import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { TranscriptSegment } from "../types.js";
import { TldwError } from "../types.js";
import { parseJson3 } from "./json3.js";

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

export async function ytdlpAvailable(): Promise<boolean> {
  try {
    await run("yt-dlp", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/** Last-resort extraction: shell out to yt-dlp if the user happens to have it. */
export async function fetchViaYtdlp(videoId: string, lang = "en"): Promise<TranscriptSegment[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tldw-"));
  try {
    await run("yt-dlp", [
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang",
      lang,
      "--skip-download",
      "--sub-format",
      "json3",
      "-o",
      path.join(tmpDir, "%(id)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);
    const subFile = path.join(tmpDir, `${videoId}.${lang}.json3`);
    const raw = await fs.readFile(subFile, "utf-8");
    const segments = parseJson3(JSON.parse(raw));
    if (segments.length === 0) {
      throw new TldwError("yt-dlp subtitles parsed to zero segments.", "no-captions");
    }
    return segments;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
