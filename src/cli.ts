#!/usr/bin/env node
import { loadEnvFile } from "./env-file.js";
import { parseArgs, HELP } from "./args.js";
import { mergeUsage } from "./usage.js";
import { extractVideoId } from "./extract-video-id.js";
import { getTranscript } from "./transcript/index.js";
import { loadLlmConfig, streamCompletion, type LlmUsage } from "./llm.js";
import { summaryPrompt, reformatPrompt } from "./prompts.js";
import { chunkText } from "./chunk-text.js";
import { saveOutputs } from "./output.js";
import { TldwError } from "./types.js";

// load env before any code reads process.env
loadEnvFile();

function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

/** Warn when a single LLM call was truncated or ended without a completion signal. */
function warnIfIncomplete(usage: LlmUsage, label: string): void {
  if (usage.truncated) {
    log(`\nWarning: the model hit its output limit; the ${label} may be incomplete.`);
  }
  if (usage.sawDone === undefined && usage.finishReason === undefined) {
    log(`\nWarning: the ${label} stream ended without a completion signal; the provider may have cut it short.`);
  }
  if (process.env.TLDW_DEBUG) {
    log(`\n[debug] ${label}: finish_reason=${usage.finishReason ?? "none"} sawDone=${usage.sawDone ?? false}`);
  }
}

function formatUsage(usage: LlmUsage): string {
  const parts: string[] = [];
  if (usage.promptTokens !== undefined || usage.completionTokens !== undefined) {
    parts.push(`${usage.promptTokens ?? "?"} in / ${usage.completionTokens ?? "?"} out tokens`);
  }
  for (const [key, value] of Object.entries(usage.extras)) {
    parts.push(`${key}: ${value}`);
  }
  return parts.join(", ");
}

async function collectStream(
  gen: AsyncGenerator<string>,
  echo: boolean
): Promise<string> {
  let text = "";
  for await (const delta of gen) {
    text += delta;
    if (echo) process.stdout.write(delta);
  }
  if (echo) process.stdout.write("\n");
  return text;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    fail(HELP);
  }

  const videoId = extractVideoId(args.input);
  if (!videoId) {
    throw new TldwError(`Could not extract a video id from: ${args.input}`, "bad-input");
  }

  log(`Fetching transcript for ${videoId}...`);
  const video = await getTranscript(videoId, args.lang, log);
  const fullText = video.segments.map((s) => s.text).join(" \n");
  log(`Got ${video.segments.length} segments via ${video.source}: "${video.title}"`);

  if (args.transcriptOnly) {
    if (args.json) {
      process.stdout.write(JSON.stringify({ ...video, text: fullText }, null, 2) + "\n");
    } else {
      process.stdout.write(fullText + "\n");
    }
    if (args.save) {
      const paths = await saveOutputs(args.saveDir, video, fullText);
      log(`Saved: ${paths.json}, ${paths.txt}`);
    }
    return;
  }

  const config = loadLlmConfig({ baseUrl: args.baseUrl, model: args.model });
  // providers report usage per call so each call gets its own object and totals accumulate here
  const usage: LlmUsage = { extras: {} };

  log(`Summarising with ${config.model}...\n`);
  const summaryUsage: LlmUsage = { extras: {} };
  const summary = await collectStream(
    streamCompletion(config, summaryPrompt(fullText), 2048, summaryUsage),
    !args.json
  );
  warnIfIncomplete(summaryUsage, "summary");
  mergeUsage(usage, summaryUsage);

  let fullTranscriptMd: string | undefined;
  if (args.full) {
    const chunks = chunkText(fullText);
    const formatted: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`\nFormatting transcript chunk ${i + 1}/${chunks.length}...\n`);
      const chunkUsage: LlmUsage = { extras: {} };
      formatted.push(
        await collectStream(
          streamCompletion(config, reformatPrompt(chunks[i]), 8192, chunkUsage),
          !args.json
        )
      );
      warnIfIncomplete(chunkUsage, `transcript chunk ${i + 1}/${chunks.length}`);
      mergeUsage(usage, chunkUsage);
    }
    fullTranscriptMd = formatted.join("\n\n");
  }

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          videoId,
          title: video.title,
          source: video.source,
          summaryMd: summary,
          fullTranscriptMd,
        },
        null,
        2
      ) + "\n"
    );
  }

  if (args.save) {
    const paths = await saveOutputs(args.saveDir, video, fullText, summary, fullTranscriptMd);
    log(`\nSaved: ${Object.values(paths).join(", ")}`);
  }

  const usageLine = formatUsage(usage);
  if (usageLine) log(`\n[${usageLine}]`);
}

main().catch((err) => {
  if (err instanceof TldwError) {
    fail(`Error (${err.kind}): ${err.message}`);
  }
  fail(`Unexpected error: ${err?.stack ?? err}`);
});
