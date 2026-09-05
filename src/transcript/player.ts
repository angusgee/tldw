import type { TranscriptSegment } from "../types.js";
import { TldwError } from "../types.js";
import { fetchTrack, pickTrack, type CaptionTrack } from "./captions.js";

// Mirrors the approach of the actively maintained youtube-transcript-api:
// InnerTube player endpoint with the ANDROID client, keyed by the watch
// page's INNERTUBE_API_KEY. The Android client's caption URLs are not
// PoToken-gated (unlike the web client's).
const ANDROID_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: "20.10.38" },
};

export interface PlayerResult {
  title: string;
  segments: TranscriptSegment[];
}

export async function fetchViaAndroidPlayer(
  videoId: string,
  apiKey: string,
  lang?: string
): Promise<PlayerResult> {
  const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept-language": "en-GB,en;q=0.9" },
    body: JSON.stringify({ context: ANDROID_CONTEXT, videoId }),
  });
  if (!res.ok) {
    throw new TldwError(`InnerTube player returned HTTP ${res.status}.`, "network");
  }
  const data = await res.json();

  const status: string = data?.playabilityStatus?.status ?? "UNKNOWN";
  if (status !== "OK") {
    const reason = data?.playabilityStatus?.reason ?? status;
    throw new TldwError(`Video is not accessible: ${reason}`, "unavailable-video");
  }

  const tracks: CaptionTrack[] =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    throw new TldwError("This video has no caption tracks.", "no-captions");
  }

  const segments = await fetchTrack(pickTrack(tracks, lang));
  const title: string = data?.videoDetails?.title ?? "";
  return { title, segments };
}
