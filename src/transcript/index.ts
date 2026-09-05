import type { VideoTranscript } from "../types.js";
import { TldwError } from "../types.js";
import { fetchWatchPage } from "./watch-page.js";
import { fetchViaAndroidPlayer } from "./player.js";
import { fetchViaWatchPageTracks } from "./timedtext.js";
import { fetchViaYtdlp, ytdlpAvailable } from "./ytdlp.js";

/**
 * Layered transcript extraction:
 *   1. InnerTube player endpoint, ANDROID client (caption URLs not PoToken-gated)
 *   2. Caption tracks from the watch page's web player response
 *   3. yt-dlp, only if installed
 */
export async function getTranscript(
  videoId: string,
  lang: string | undefined,
  log: (msg: string) => void
): Promise<VideoTranscript> {
  const page = await fetchWatchPage(videoId);
  const failures: string[] = [];

  if (page.apiKey) {
    try {
      const { title, segments } = await fetchViaAndroidPlayer(videoId, page.apiKey, lang);
      return { videoId, title: title || page.title, segments, source: "innertube" };
    } catch (err) {
      if (err instanceof TldwError && err.kind === "unavailable-video") throw err;
      failures.push(`android player: ${(err as Error).message}`);
      log("Android player path failed, trying watch-page captions...");
    }
  } else {
    failures.push("android player: no INNERTUBE_API_KEY on watch page");
  }

  try {
    const segments = await fetchViaWatchPageTracks(page, lang);
    return { videoId, title: page.title, segments, source: "timedtext" };
  } catch (err) {
    failures.push(`watch-page captions: ${(err as Error).message}`);
  }

  if (await ytdlpAvailable()) {
    log("Watch-page captions failed, trying yt-dlp...");
    try {
      const segments = await fetchViaYtdlp(videoId, lang ?? "en");
      return { videoId, title: page.title, segments, source: "ytdlp" };
    } catch (err) {
      failures.push(`yt-dlp: ${(err as Error).message}`);
    }
  }

  throw new TldwError(
    `Could not get a transcript for this video. This usually means it has no captions.\nDetails:\n  - ${failures.join("\n  - ")}`,
    "no-captions"
  );
}
