import { TldwError } from "../types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export const YT_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  "accept-language": "en-GB,en;q=0.9",
  // Bypass the EU consent interstitial.
  cookie: "SOCS=CAI; CONSENT=YES+cb",
};

export interface WatchPage {
  html: string;
  playerResponse: any;
  apiKey: string | null;
  clientVersion: string | null;
  transcriptParams: string | null;
  title: string;
  playabilityStatus: string;
}

/** Extract a balanced JSON object starting at the first "{" at or after `from`. */
function extractJsonObject(text: string, from: number): string | null {
  const start = text.indexOf("{", from);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export async function fetchWatchPage(videoId: string): Promise<WatchPage> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: YT_HEADERS });
  } catch (err) {
    throw new TldwError(`Could not reach youtube.com: ${(err as Error).message}`, "network");
  }
  if (!res.ok) {
    throw new TldwError(`YouTube returned HTTP ${res.status} for the watch page.`, "network");
  }
  const html = await res.text();

  const marker = html.indexOf("ytInitialPlayerResponse");
  const playerJson = marker === -1 ? null : extractJsonObject(html, marker);
  let playerResponse: any = {};
  if (playerJson) {
    try {
      playerResponse = JSON.parse(playerJson);
    } catch {
      playerResponse = {};
    }
  }

  const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? null;
  const clientVersion =
    html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1] ??
    html.match(/"clientVersion":"([\d.]+)"/)?.[1] ??
    null;
  const transcriptParams =
    html.match(/"getTranscriptEndpoint":\s*\{"params":"([^"]+)"/)?.[1] ?? null;

  const title: string = playerResponse?.videoDetails?.title ?? "";
  const playabilityStatus: string = playerResponse?.playabilityStatus?.status ?? "UNKNOWN";

  return { html, playerResponse, apiKey, clientVersion, transcriptParams, title, playabilityStatus };
}
