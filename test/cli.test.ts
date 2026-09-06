import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args.js";
import { mergeUsage } from "../src/usage.js";
import type { LlmUsage } from "../src/llm.js";

describe("parseArgs --save", () => {
  it("accepts an 11-char directory name when the video came first", () => {
    const args = parseArgs(["https://youtu.be/dQw4w9WgXcQ", "--save", "transcripts"]);
    expect(args.input).toBe("https://youtu.be/dQw4w9WgXcQ");
    expect(args.saveDir).toBe("transcripts");
  });
  it("accepts an 11-char directory name when the video follows", () => {
    const args = parseArgs(["--save", "transcripts", "dQw4w9WgXcQ"]);
    expect(args.saveDir).toBe("transcripts");
    expect(args.input).toBe("dQw4w9WgXcQ");
  });
  it("still treats a lone id after --save as the video", () => {
    const args = parseArgs(["--save", "dQw4w9WgXcQ"]);
    expect(args.saveDir).toBe("./outputs");
    expect(args.input).toBe("dQw4w9WgXcQ");
  });
  it("takes an ordinary directory name with the video after", () => {
    const args = parseArgs(["--save", "out", "dQw4w9WgXcQ"]);
    expect(args.saveDir).toBe("out");
    expect(args.input).toBe("dQw4w9WgXcQ");
  });
});

describe("mergeUsage", () => {
  it("sums prompt and completion tokens across calls", () => {
    const totals: LlmUsage = { extras: {} };
    mergeUsage(totals, { promptTokens: 100, completionTokens: 10, extras: {} });
    mergeUsage(totals, { promptTokens: 200, completionTokens: 20, extras: {} });
    expect(totals.promptTokens).toBe(300);
    expect(totals.completionTokens).toBe(30);
  });
  it("sums numeric extras", () => {
    const totals: LlmUsage = { extras: {} };
    mergeUsage(totals, { extras: { cost: 0.1 } });
    mergeUsage(totals, { extras: { cost: 0.2 } });
    expect(totals.extras.cost).toBeCloseTo(0.3);
  });
  it("sums unit-suffixed string extras instead of keeping the last chunk", () => {
    const totals: LlmUsage = { extras: {} };
    mergeUsage(totals, { extras: { energy: "0.4 Wh" } });
    mergeUsage(totals, { extras: { energy: "0.2 Wh" } });
    expect(totals.extras.energy).toBe("0.6 Wh");
  });
  it("keeps the latest value when units cannot be merged", () => {
    const totals: LlmUsage = { extras: {} };
    mergeUsage(totals, { extras: { note: "fast" } });
    mergeUsage(totals, { extras: { note: "slow" } });
    expect(totals.extras.note).toBe("slow");
  });
});
