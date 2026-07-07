import type { McpToolDef } from '../mcp/client.js';

/** A single tool invocation the model wants to make. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** The outcome of running a tool, to feed back to the model. */
export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError?: boolean;
}

/** Result of one streaming model turn. */
export interface TurnResult {
  /** The assistant message, in the provider's own history format, to append. */
  assistantMessage: unknown;
  /** True when the model stopped to call tools (loop should resolve them). */
  needsTools: boolean;
}

export interface StreamTurnArgs {
  model: string;
  system: string;
  /** Provider-formatted tool definitions (from {@link LlmProvider.formatTools}). */
  tools: unknown;
  /** Conversation so far, in this provider's history format. */
  messages: unknown[];
  /** Called with each streamed text delta. */
  onText: (delta: string) => void;
}

/**
 * A chat model backend. Each conversation is bound to one provider; message
 * history is kept in that provider's native format (so switching provider
 * requires a fresh conversation, but switching model within a provider does not).
 */
export interface LlmProvider {
  readonly id: 'anthropic' | 'openai';
  /** Human-facing label, used e.g. in the "out of credit" notice. */
  readonly label: string;

  /** Whether the server has an API key configured for this provider. */
  isConfigured(): boolean;

  /** Translate MCP tool defs into the provider's tool schema. */
  formatTools(mcp: McpToolDef[]): unknown;

  /** Wrap a plain user message in the provider's history format. */
  userMessage(text: string): unknown;

  /** Tool calls left unanswered in the tail assistant message (for resume). */
  pendingToolCalls(messages: unknown[]): ToolCall[];

  /** Run one streaming turn. */
  streamTurn(args: StreamTurnArgs): Promise<TurnResult>;

  /** Messages carrying tool results, to append after executing the calls. */
  toolResultMessages(results: ToolResult[]): unknown[];

  /** True when the error indicates an empty balance / billing problem. */
  isBillingError(e: unknown): boolean;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
