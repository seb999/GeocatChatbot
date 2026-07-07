import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { config } from '../config.js';
import type { McpToolDef } from '../mcp/client.js';
import type { LlmProvider, StreamTurnArgs, ToolCall, ToolResult, TurnResult } from './types.js';

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic' as const;
  readonly label = 'Anthropic';

  private client: Anthropic | null = null;

  isConfigured(): boolean {
    return Boolean(config.anthropicApiKey);
  }

  private sdk(): Anthropic {
    if (!this.client) this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    return this.client;
  }

  /** All MCP tools are exposed; writes are gated at runtime (not filtered out). */
  formatTools(mcp: McpToolDef[]): Tool[] {
    return mcp.map((t) => ({
      name: t.name,
      description: t.description ?? t.name,
      input_schema: t.inputSchema as Tool['input_schema'],
    }));
  }

  userMessage(text: string): MessageParam {
    return { role: 'user', content: text };
  }

  pendingToolCalls(messages: unknown[]): ToolCall[] {
    const last = messages[messages.length - 1] as MessageParam | undefined;
    if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return [];
    return last.content
      .filter((b): b is ToolUseBlock => (b as { type?: string }).type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: b.input }));
  }

  async streamTurn(args: StreamTurnArgs): Promise<TurnResult> {
    const stream = this.sdk().messages.stream({
      model: args.model,
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: args.system,
      tools: args.tools as Tool[],
      messages: args.messages as MessageParam[],
    });
    stream.on('text', (delta) => args.onText(delta));
    const final = await stream.finalMessage();
    return {
      assistantMessage: { role: 'assistant', content: final.content as ContentBlockParam[] },
      needsTools: final.stop_reason === 'tool_use',
    };
  }

  toolResultMessages(results: ToolResult[]): MessageParam[] {
    const content: ToolResultBlockParam[] = results.map((r) => ({
      type: 'tool_result',
      tool_use_id: r.id,
      content: r.content,
      ...(r.isError ? { is_error: true } : {}),
    }));
    return [{ role: 'user', content }];
  }

  /** Anthropic returns a 400 "credit balance is too low" when out of credit. */
  isBillingError(e: unknown): boolean {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return msg.includes('credit balance') || msg.includes('billing');
  }
}
