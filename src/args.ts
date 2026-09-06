import { createRequire } from "node:module";
import { extractVideoId } from "./extract-video-id.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export const HELP = `tldw ${version} — Too Long; Didn't Watch

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

export interface Args {
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

export function parseArgs(argv: string[]): Args {
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
      case "--save": {
        args.save = true;
        // Take the next token as the directory unless it is the only remaining
        // candidate for the video URL/id. A directory name that merely looks
        // like an id (any 11 chars, e.g. "transcripts") must not be rejected
        // when the video is given elsewhere on the command line.
        const next = argv[i + 1];
        if (next && !next.startsWith("-")) {
          const inputElsewhere =
            args.input !== undefined ||
            argv.slice(i + 2).some((token) => !token.startsWith("-") && extractVideoId(token) !== null);
          if (inputElsewhere || !extractVideoId(next)) {
            args.saveDir = argv[++i];
          }
        }
        break;
      }
      case "--model":
        args.model = requireValue(argv, ++i, arg);
        break;
      case "--base-url":
        args.baseUrl = requireValue(argv, ++i, arg);
        break;
      case "--lang":
        args.lang = requireValue(argv, ++i, arg);
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

function requireValue(argv: string[], i: number, flag: string): string {
  const value = argv[i];
  if (value === undefined || value.startsWith("-")) {
    fail(`Missing value for ${flag}\n\n${HELP}`);
  }
  return value;
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}
