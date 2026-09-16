import { z } from 'zod';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  name?: string;
  input?: unknown;
}

export interface LlmResponse {
  content: LlmContentBlock[];
  usage: LlmUsage;
}

export interface LlmRequest {
  model: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  tool?: { name: string; description: string; inputSchema: unknown };
}

export interface LlmTransport {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set — LLM steps are unavailable');
  }
}

export class LlmOutputError extends Error {}

/** Real transport backed by the Anthropic API (SDK imported lazily). */
export class AnthropicTransport implements LlmTransport {
  private client: unknown;
  constructor(private readonly apiKey: string | undefined = process.env.ANTHROPIC_API_KEY) {}

  available(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    if (!this.apiKey) throw new LlmNotConfiguredError();
    if (!this.client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey, maxRetries: 3 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.client as any;
    const res = await client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(req.tool
        ? {
            tools: [
              {
                name: req.tool.name,
                description: req.tool.description,
                input_schema: req.tool.inputSchema,
              },
            ],
            tool_choice: { type: 'tool', name: req.tool.name },
          }
        : {}),
    });
    const content: LlmContentBlock[] = (res.content as Array<Record<string, unknown>>).map((b) =>
      b.type === 'tool_use'
        ? { type: 'tool_use', name: b.name as string, input: b.input }
        : { type: 'text', text: (b.text as string) ?? '' },
    );
    return {
      content,
      usage: {
        inputTokens: res.usage?.input_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
      },
    };
  }
}

export interface LlmModels {
  primary: string;
  fast: string;
}

export function defaultModels(): LlmModels {
  return {
    primary: process.env.JH_MODEL_PRIMARY || 'claude-sonnet-5',
    fast: process.env.JH_MODEL_FAST || 'claude-haiku-4-5-20251001',
  };
}

export interface JsonCallOptions<T> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  tier?: 'primary' | 'fast';
  maxTokens?: number;
}

export interface JsonCallResult<T> {
  data: T;
  usage: LlmUsage;
  model: string;
}

/**
 * LLM wrapper producing schema-validated JSON via forced tool use.
 * One validation-repair retry; transport-level retries live in the SDK.
 */
export class Llm {
  constructor(
    private readonly transport: LlmTransport,
    readonly models: LlmModels = defaultModels(),
  ) {}

  static fromEnv(): Llm | null {
    const t = new AnthropicTransport();
    return t.available() ? new Llm(t) : null;
  }

  async json<T>(opts: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    const model = opts.tier === 'fast' ? this.models.fast : this.models.primary;
    const inputSchema = z.toJSONSchema(opts.schema as z.ZodType<unknown>);
    delete (inputSchema as Record<string, unknown>)['$schema'];
    const tool = { name: opts.name, description: opts.description, inputSchema };
    const messages: LlmRequest['messages'] = [{ role: 'user', content: opts.user }];
    const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.transport.complete({
        model,
        system: opts.system,
        messages,
        maxTokens: opts.maxTokens ?? 4096,
        tool,
      });
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      const block = res.content.find((b) => b.type === 'tool_use' && b.name === opts.name);
      const parsed = opts.schema.safeParse(block?.input);
      if (parsed.success) return { data: parsed.data, usage, model };
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      messages.push(
        { role: 'assistant', content: JSON.stringify(block?.input ?? null) },
        {
          role: 'user',
          content: `Your previous tool call failed schema validation: ${issues}. Call the "${opts.name}" tool again with a corrected, complete input.`,
        },
      );
    }
    throw new LlmOutputError(`LLM output failed validation for tool "${opts.name}" after retry`);
  }
}
