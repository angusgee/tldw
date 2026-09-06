import { TldwError } from "./types.js";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  /** Set when the model stopped because it hit max_tokens. */
  truncated?: boolean;
  /** The finish_reason reported by the provider, if any. */
  finishReason?: string;
  /** Whether the stream terminated with a proper [DONE] sentinel. */
  sawDone?: boolean;
  /** Provider-specific extras like NeuralWatt energy figures. */
  extras: Record<string, unknown>;
}

export function loadLlmConfig(overrides: { baseUrl?: string; model?: string }): LlmConfig {
  const baseUrl =
    overrides.baseUrl ?? process.env.TLDW_BASE_URL ?? "https://api.neuralwatt.com/v1";
  const apiKey = process.env.TLDW_API_KEY;
  const model = overrides.model ?? process.env.TLDW_MODEL ?? "deepseek-v4-flash";
  if (!apiKey) {
    throw new TldwError(
      "TLDW_API_KEY is not set. Get a key from your provider (e.g. NeuralWatt or OpenRouter), then put it in ~/.tldw.env or export it. See the Configure section of the README.",
      "config"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/**
 * Stream a chat completion from any OpenAI-compatible endpoint.
 * Fills usageOut when the provider reports usage.
 */
export async function* streamCompletion(
  config: LlmConfig,
  prompt: string,
  maxTokens: number,
  usageOut: LlmUsage
): AsyncGenerator<string> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    throw new TldwError(`Could not reach the LLM provider: ${(err as Error).message}`, "network");
  }

  if (res.status === 401 || res.status === 403) {
    throw new TldwError("The LLM provider rejected your API key (check TLDW_API_KEY).", "provider-auth");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TldwError(
      `LLM provider returned HTTP ${res.status}: ${body.slice(0, 300)}`,
      "provider-error"
    );
  }
  if (!res.body) {
    throw new TldwError("LLM provider returned no response body.", "provider-error");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function* handleLine(line: string, out: LlmUsage): Generator<string> {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      out.sawDone = true;
      return;
    }
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    const choice = json.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      yield delta;
    }
    if (typeof choice?.finish_reason === "string") {
      out.finishReason = choice.finish_reason;
      if (choice.finish_reason === "length") {
        out.truncated = true;
      }
    }
    if (json.usage) {
      out.promptTokens = json.usage.prompt_tokens;
      out.completionTokens = json.usage.completion_tokens;
      for (const [key, value] of Object.entries(json.usage)) {
        if (/energy|watt|wh|joule/i.test(key)) {
          out.extras[key] = value as unknown;
        }
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      yield* handleLine(line, usageOut);
    }
  }
  // flush any final chunk that arrived without a trailing newline
  buffer += decoder.decode();
  if (buffer.trim()) {
    yield* handleLine(buffer, usageOut);
  }
}
