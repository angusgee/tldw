import type { LlmUsage } from "./llm.js";

/** Split "0.42 Wh" into number and suffix; null when the value has no leading number. */
function splitNumeric(value: unknown): { num: number; suffix: string } | null {
  if (typeof value === "number") return { num: value, suffix: "" };
  if (typeof value !== "string") return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  return match ? { num: parseFloat(match[1]), suffix: match[2] } : null;
}

/** Fold one call's usage into the running totals. */
export function mergeUsage(totals: LlmUsage, call: LlmUsage): void {
  if (call.promptTokens !== undefined) {
    totals.promptTokens = (totals.promptTokens ?? 0) + call.promptTokens;
  }
  if (call.completionTokens !== undefined) {
    totals.completionTokens = (totals.completionTokens ?? 0) + call.completionTokens;
  }
  for (const [key, value] of Object.entries(call.extras)) {
    const prev = totals.extras[key];
    if (prev === undefined) {
      totals.extras[key] = value;
      continue;
    }
    // Providers report per-call figures that may be unit-suffixed strings
    // ("0.4 Wh"). Sum values whose units match; anything unmergeable keeps the
    // latest value rather than presenting one chunk's figure as a bogus total.
    const a = splitNumeric(prev);
    const b = splitNumeric(value);
    if (a && b && a.suffix === b.suffix) {
      const sum = Number((a.num + b.num).toFixed(6));
      totals.extras[key] = a.suffix ? `${sum}${a.suffix}` : sum;
    } else {
      totals.extras[key] = value;
    }
  }
}
