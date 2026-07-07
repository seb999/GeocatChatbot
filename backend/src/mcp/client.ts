/**
 * Minimal MCP client — JSON-RPC 2.0 over Streamable HTTP (MCP 2024-11-05).
 *
 * Ported from Moneta/backend/Infrastructure/McpClient.cs. Connects to a remote
 * MCP server, lists tools, and calls them. The eea-geonetwork server at
 * sdi-mcp.dspx.eu is stateless (no Mcp-Session-Id), but we still capture the
 * session id if a future version returns one. Degrades gracefully: callers
 * decide what to do when connect/list throws.
 */

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface RpcError {
  code: number;
  message: string;
}

export class McpSession {
  private counter = 1;
  private sessionId: string | null = null;

  private constructor(
    private readonly url: string,
    private readonly authToken?: string,
  ) {}

  /** Connect + run the initialize handshake. Throws on failure. */
  static async connect(url: string, authToken?: string): Promise<McpSession> {
    const session = new McpSession(url, authToken);
    await session.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'geocat-chatbot', version: '0.1.0' },
    });
    await session.notify('notifications/initialized');
    return session;
  }

  async listTools(): Promise<McpToolDef[]> {
    const result = await this.rpc('tools/list', {});
    const tools = (result?.tools as unknown[] | undefined) ?? [];
    return tools.map((t) => {
      const tool = t as Record<string, unknown>;
      return {
        name: String(tool.name ?? ''),
        description: tool.description as string | undefined,
        inputSchema:
          (tool.inputSchema as Record<string, unknown>) ?? { type: 'object' },
      };
    });
  }

  /** Call a tool and return its text content concatenated. */
  async callTool(name: string, args: unknown): Promise<string> {
    const result = await this.rpc('tools/call', { name, arguments: args });
    const content = result?.content as Array<Record<string, unknown>> | undefined;
    if (!content) return JSON.stringify(result ?? null);
    return content
      .filter((c) => c.type === 'text')
      .map((c) => String(c.text ?? ''))
      .join('');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.authToken) h.Authorization = `Bearer ${this.authToken}`;
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }

  private async rpc(
    method: string,
    params: unknown,
  ): Promise<Record<string, any> | null> {
    const id = this.counter++;
    const res = await fetch(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });

    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) this.sessionId = sid;

    if (res.status === 202) return null;

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`MCP ${method} HTTP ${res.status}: ${truncate(text, 300)}`);
    }
    if (!text.trim()) return null;

    const node = JSON.parse(extractJson(text));
    if (node?.error) {
      const err = node.error as RpcError;
      throw new Error(`MCP ${method}: ${err.message}`);
    }
    return (node?.result as Record<string, any>) ?? null;
  }

  private async notify(method: string): Promise<void> {
    try {
      await fetch(this.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: '2.0', method }),
      });
    } catch {
      /* fire and forget */
    }
  }
}

/** Strip SSE "data:" framing if present; otherwise return the raw text. */
function extractJson(text: string): string {
  if (text.includes('data:')) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t.startsWith('data:')) {
        const d = t.slice(5).trim();
        if (d.startsWith('{') || d.startsWith('[')) return d;
      }
    }
  }
  return text;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}
