import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { VideoTranscript } from "./types.js";
import { sanitizeFilename } from "./sanitize-filename.js";

export interface SavedPaths {
  json: string;
  txt: string;
  summary?: string;
  full?: string;
}

/** Write outputs using the original youtube-tldr file contract. */
export async function saveOutputs(
  dir: string,
  video: VideoTranscript,
  fullText: string,
  summaryMd?: string,
  fullTranscriptMd?: string
): Promise<SavedPaths> {
  await fs.mkdir(dir, { recursive: true });
  const base = sanitizeFilename(video.title || video.videoId);

  const paths: SavedPaths = {
    json: path.join(dir, `${base}.json`),
    txt: path.join(dir, `${base}.txt`),
  };

  const jsonData = {
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    videoId: video.videoId,
    title: video.title,
    transcript: video.segments,
  };

  const writes = [
    fs.writeFile(paths.json, JSON.stringify(jsonData, null, 2)),
    fs.writeFile(paths.txt, fullText),
  ];
  if (summaryMd !== undefined) {
    paths.summary = path.join(dir, `${base}-summary.md`);
    writes.push(fs.writeFile(paths.summary, `# ${video.title}\n\n${summaryMd}`));
  }
  if (fullTranscriptMd !== undefined) {
    paths.full = path.join(dir, `${base}-full-transcript.md`);
    writes.push(fs.writeFile(paths.full, `# ${video.title}\n\n${fullTranscriptMd}`));
  }
  await Promise.all(writes);
  return paths;
}
