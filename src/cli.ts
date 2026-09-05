#!/usr/bin/env node
import { createRequire } from "node:module";
import { loadEnvFile } from "./env-file.js";
import { extractVideoId } from "./extract-video-id.js";

loadEnvFile();
import { getTranscript } from "./transcript/index.js";
import { loadLlmConfig, streamCompletion, type LlmUsage } from "./llm.js";
import { summaryPrompt, reformatPrompt } from "./prompts.js";
import { chunkText } from "./chunk-text.js";
import { saveOutputs } from "./output.js";
import { TldwError } from "./types.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const HELP = `tldw ${version} — Too Long; Didn't Watch

Summarise a YouTube video in your terminal.

Usage:
  tldw <url-or-video-id> [options]

Options:
  --full             Also produce the full transcript as clean, readable prose
  --transcript       Print the raw transcript only (no LLM call, no key needed)
  --save [dir]       Write output files (default dir: ./outputs)
  --model <id>       Override TLDW_MODEL for this run
  --base-url <url>   Override TLDW_BASE_URL for this run
  --lang <code>      Preferred caption language (default: en)
  --json             Machine-readable JSON output on stdout
  --help             Show this help
  --version          Show version

Configuration (environment):
  TLDW_API_KEY       API key for any OpenAI-compatible provider  (required for summaries)
  TLDW_BASE_URL      Provider base URL (default: https://api.neuralwatt.com/v1)
  TLDW_MODEL         Model id at your provider

Examples:
  tldw https://www.youtube.com/watch?v=dQw4w9WgXcQ
  tldw dQw4w9WgXcQ --full --save
  tldw dQw4w9WgXcQ --transcript --json
`;

interface Args {
  input?: string;
  full: boolean;
  transcriptOnly: boolean;
  save: boolean;
  saveDir: string;
  model?: string;
  baseUrl?: string;
  lang?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    full: false,
    transcriptOnly: false,
    save: false,
    saveDir: "./outputs",
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case "--version":
      case "-v":
        process.stdout.write(`${version}\n`);
        process.exit(0);
        break;
      case "--full":
        args.full = true;
        break;
      case "--transcript":
        args.transcriptOnly = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--save":
        args.save = true;
        if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
          args.saveDir = argv[++i];
        }
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--lang":
        args.lang = argv[++i];
        break;
      default:
        if (!arg.startsWith("-") && !args.input) {
          args.input = arg;
        } else {
          fail(`Unknown option: ${arg}\n\n${HELP}`);
        }
    }
  }
  return args;
}

function log(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
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
  const usage: LlmUsage = { extras: {} };

  log(`Summarising with ${config.model}...\n`);
  const summary = await collectStream(
    streamCompletion(config, summaryPrompt(fullText), 2048, usage),
    !args.json
  );
  if (usage.truncated) {
    log("\nWarning: the model hit its output limit; the summary may be incomplete.");
  }

  let fullTranscriptMd: string | undefined;
  if (args.full) {
    const chunks = chunkText(fullText);
    const formatted: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      log(`\nFormatting transcript chunk ${i + 1}/${chunks.length}...\n`);
      formatted.push(
        await collectStream(
          streamCompletion(config, reformatPrompt(chunks[i]), 8192, usage),
          !args.json
        )
      );
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
