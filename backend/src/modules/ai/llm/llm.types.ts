/** Provider-neutral LLM message roles. */
export type LlmMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
  /** Optional tool name when role is `tool`. */
  name?: string;
}

/** Selects a configured model bucket when `model` is omitted. */
export type LlmModelPurpose = 'router' | 'chat' | 'json' | 'reasoning';

export interface LlmCompleteInput {
  messages: LlmMessage[];
  /** Explicit model override — otherwise resolved from `purpose`. */
  model?: string;
  purpose?: LlmModelPurpose;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmCompleteResult {
  content: string;
  model: string;
  finishReason?: string;
  usage?: LlmUsage;
}

export type LlmStreamEventType = 'start' | 'delta' | 'done' | 'error';

export interface LlmStreamEvent {
  type: LlmStreamEventType;
  /** Cumulative text when type is `delta` (provider may emit full or incremental). */
  content?: string;
  /** Incremental token/text chunk. */
  delta?: string;
  model?: string;
  finishReason?: string;
  usage?: LlmUsage;
  error?: string;
}

export interface LlmStreamInput extends LlmCompleteInput {
  onEvent: (event: LlmStreamEvent) => void | Promise<void>;
}

export interface LlmJsonInput extends LlmCompleteInput {
  /** Optional JSON Schema for structured output (provider-specific mapping). */
  schema?: Record<string, unknown>;
  schemaName?: string;
}

export interface LlmJsonResult<T = unknown> {
  data: T;
  model: string;
  rawContent?: string;
  usage?: LlmUsage;
}

/**
 * Provider-neutral LLM contract.
 * Implementations must not perform tenant mutations or external side effects.
 */
export interface LlmProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  resolveModel(purpose?: LlmModelPurpose, explicitModel?: string): string;
  complete(input: LlmCompleteInput): Promise<LlmCompleteResult>;
  stream(input: LlmStreamInput): Promise<void>;
  completeJson<T = unknown>(input: LlmJsonInput): Promise<LlmJsonResult<T>>;
}
