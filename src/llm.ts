import { TldwError } from "./types.js";

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  /** Any provider-specific extras (e.g. NeuralWatt energy figures). */
  extras: Record<string, unknown>;
}

export function loadLlmConfig(overrides: { baseUrl?: string; model?: string }): LlmConfig {
  const baseUrl =
    overrides.baseUrl ?? process.env.TLDW_BASE_URL ?? "https://api.neuralwatt.com/v1";
  const apiKey = process.env.TLDW_API_KEY;
  const model = overrides.model ?? process.env.TLDW_MODEL;
  if (!apiKey) {
    throw new TldwError(
      "TLDW_API_KEY is not set. Get a key from your provider (e.g. NeuralWatt or OpenRouter) and export TLDW_API_KEY.",
      "config"
    );
  }
  if (!model) {
    throw new TldwError(
      'TLDW_MODEL is not set. Pick a model from your provider and export TLDW_MODEL (e.g. "qwen/qwen3-14b" style ids), or pass --model.',
      "config"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

/**
 * Stream a chat completion from any OpenAI-compatible endpoint.
 * Yields content deltas; fills `usageOut` when the provider reports usage.
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
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield delta;
      }
      if (json.usage) {
        usageOut.promptTokens = json.usage.prompt_tokens;
        usageOut.completionTokens = json.usage.completion_tokens;
        for (const [key, value] of Object.entries(json.usage)) {
          if (/energy|watt|wh|joule/i.test(key)) {
            usageOut.extras[key] = value as unknown;
          }
        }
      }
    }
  }
}
