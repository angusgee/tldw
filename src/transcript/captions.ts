import type { TranscriptSegment } from "../types.js";
import { TldwError } from "../types.js";
import { parseJson3 } from "./json3.js";
import { YT_HEADERS } from "./watch-page.js";

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string; // "asr" for auto-generated
}

/** Manual beats auto-generated. Requested language beats English beats first. */
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
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  middot: "·",
  deg: "°",
  copy: "©",
  reg: "®",
  trade: "™",
  pound: "£",
  euro: "€",
  frac12: "½",
  times: "×",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ntilde: "ñ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  szlig: "ß",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]{1,30});/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      // out-of-range numeric entities stay as-is instead of throwing
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

/** Parse YouTube's XML caption format: <transcript><text start="1.2" dur="3.4">…</text>… */
export function parseCaptionXml(xml: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  // attributes come in any order and dur is optional
  // empty cues can be self-closing
  const re = /<text\b([^>]*?)(?:\/>|>([\s\S]*?)<\/text>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const attrs = match[1];
    // anchored so data-start can never match
    const start = attrs.match(/(?<![\w-])start="([\d.]+)"/)?.[1];
    if (start === undefined) continue;
    const dur = attrs.match(/(?<![\w-])dur="([\d.]+)"/)?.[1] ?? "0";
    const text = decodeEntities((match[2] ?? "").replace(/<[^>]+>/g, "")).trim();
    if (!text) continue;
    segments.push({
      offset: parseFloat(start),
      duration: parseFloat(dur),
      text,
    });
  }
  return segments;
}

/**
 * Fetch one caption track.
 * Tries json3 first then falls back to the XML format.
 * An empty body on both means the URL is PoToken-gated.
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        continue; // malformed json3 body — fall back to the XML format
      }
      const segments = parseJson3(parsed);
      if (segments.length > 0) return segments;
    } else {
      const segments = parseCaptionXml(body);
      if (segments.length > 0) return segments;
    }
  }
  throw new TldwError("Caption track returned no usable data (possibly PoToken-gated).", "no-captions");
}
