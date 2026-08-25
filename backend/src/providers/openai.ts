import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { config } from '../config.js';
import type { McpToolDef } from '../mcp/client.js';
import type {
  LlmProvider,
  ProviderId,
  StreamTurnArgs,
  ToolCall,
  ToolResult,
  TurnResult,
} from './types.js';

/** Assistant message shape we keep in history (mirrors the OpenAI API). */
interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ChatCompletionMessageToolCall[];
}

/**
 * Where an OpenAI-compatible endpoint lives. Credentials are read lazily so the
 * provider can be constructed before config is fully resolved.
 */
export interface OpenAIEndpoint {
  id: ProviderId;
  label: string;
  apiKey: () => string;
  /** Omit for api.openai.com; set for a gateway (e.g. the EEA in-house LLM). */
  baseUrl?: () => string;
}

const OPENAI_ENDPOINT: OpenAIEndpoint = {
  id: 'openai',
  label: 'OpenAI',
  apiKey: () => config.openaiApiKey,
};

/**
 * Chat provider speaking the OpenAI Chat Completions API. Used both for OpenAI
 * itself and for OpenAI-compatible gateways, which differ only in base URL.
 */
export class OpenAIProvider implements LlmProvider {
  readonly id: ProviderId;
  readonly label: string;

  private readonly endpoint: OpenAIEndpoint;
  private client: OpenAI | null = null;

  constructor(endpoint: OpenAIEndpoint = OPENAI_ENDPOINT) {
    this.endpoint = endpoint;
    this.id = endpoint.id;
    this.label = endpoint.label;
  }

  isConfigured(): boolean {
    return Boolean(this.endpoint.apiKey());
  }

  private sdk(): OpenAI {
    if (!this.client) {
      const baseURL = this.endpoint.baseUrl?.();
      this.client = new OpenAI({
        apiKey: this.endpoint.apiKey(),
        ...(baseURL ? { baseURL: baseURL.replace(/\/+$/, '') } : {}),
      });
    }
    return this.client;
  }

  formatTools(mcp: McpToolDef[]): ChatCompletionTool[] {
    return mcp.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? t.name,
        parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
      },
    }));
  }

  userMessage(text: string): ChatCompletionMessageParam {
    return { role: 'user', content: text };
  }

  pendingToolCalls(messages: unknown[]): ToolCall[] {
    const last = messages[messages.length - 1] as AssistantMessage | undefined;
    if (!last || last.role !== 'assistant' || !Array.isArray(last.tool_calls)) return [];
    return last.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParse(tc.function.arguments),
    }));
  }

  async streamTurn(args: StreamTurnArgs): Promise<TurnResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: args.system },
      ...(args.messages as ChatCompletionMessageParam[]),
    ];

    const stream = await this.sdk().chat.completions.create({
      model: args.model,
      messages,
      tools: args.tools as ChatCompletionTool[],
      stream: true,
    });

    let text = '';
    const toolCalls: ChatCompletionMessageToolCall[] = [];
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        args.onText(delta.content);
      }
      for (const tc of delta?.tool_calls ?? []) {
        const slot = (toolCalls[tc.index] ??= {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.function.name += tc.function.name;
        if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const assistantMessage: AssistantMessage = {
      role: 'assistant',
      content: text || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    return {
      assistantMessage,
      needsTools: finishReason === 'tool_calls' || toolCalls.length > 0,
    };
  }

  toolResultMessages(results: ToolResult[]): ChatCompletionMessageParam[] {
    return results.map((r) => ({
      role: 'tool',
      tool_call_id: r.id,
      content: r.isError ? `ERROR: ${r.content}` : r.content,
    }));
  }

  /** OpenAI returns "insufficient_quota" / 429 when the account is out of credit. */
  isBillingError(e: unknown): boolean {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
    return (
      msg.includes('insufficient_quota') ||
      msg.includes('exceeded your current quota') ||
      msg.includes('billing')
    );
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}
