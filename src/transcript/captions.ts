import type { TranscriptSegment } from "../types.js";
import { TldwError } from "../types.js";
import { parseJson3 } from "./json3.js";
import { YT_HEADERS } from "./watch-page.js";

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" for auto-generated
}

/** Manual captions beat auto-generated; requested language beats English beats first. */
export function pickTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack {
  const score = (t: CaptionTrack): number => {
    let s = 0;
    if (lang && t.languageCode.toLowerCase().startsWith(lang.toLowerCase())) s += 4;
    if (t.languageCode.toLowerCase().startsWith("en")) s += 2;
    if (t.kind !== "asr") s += 1;
    return s;
  };
  return [...tracks].sort((a, b) => score(b) - score(a))[0];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return ENTITIES[entity] ?? match;
  });
}

/** Parse YouTube's XML caption format: <transcript><text start="1.2" dur="3.4">…</text>… */
export function parseCaptionXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const re = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = decodeEntities(match[3].replace(/<[^>]+>/g, "")).trim();
    if (!text) continue;
    segments.push({
      offset: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text,
    });
  }
  return segments;
}

/**
 * Fetch one caption track. Tries json3 first (richer), falls back to the
 * default XML format (what youtube-transcript-api uses). An empty body on
 * both means the URL is PoToken-gated.
 */
export async function fetchTrack(track: CaptionTrack): Promise<TranscriptSegment[]> {
  const base = track.baseUrl.replace("&fmt=srv3", "");
  if (base.includes("&exp=xpe")) {
    throw new TldwError("Caption URL is PoToken-gated (exp=xpe).", "no-captions");
  }

  for (const url of [`${base}&fmt=json3`, base]) {
    const res = await fetch(url, { headers: YT_HEADERS });
    if (!res.ok) continue;
    const body = await res.text();
    if (!body.trim()) continue;
    if (body.trimStart().startsWith("{")) {
      const segments = parseJson3(JSON.parse(body));
      if (segments.length > 0) return segments;
    } else {
      const segments = parseCaptionXml(body);
      if (segments.length > 0) return segments;
    }
  }
  throw new TldwError("Caption track returned no usable data (possibly PoToken-gated).", "no-captions");
}
