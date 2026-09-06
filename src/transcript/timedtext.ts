import type { TranscriptSegment } from "../types.js";
import { TldwError } from "../types.js";
import { fetchTrack, pickTrack, type CaptionTrack } from "./captions.js";
import type { WatchPage } from "./watch-page.js";

/**
 * Fallback extraction using caption tracks from the watch page player response.
 * Web caption URLs are increasingly PoToken-gated so the Android path goes first.
 */
export async function fetchViaWatchPageTracks(
  page: WatchPage,
  lang?: string
): Promise<TranscriptSegment[]> {
  const tracks: CaptionTrack[] =
    page.playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (tracks.length === 0) {
    throw new TldwError("No caption tracks in the watch page player response.", "no-captions");
  }
  return fetchTrack(pickTrack(tracks, lang));
}
