import type { VideoTranscript } from "../types.js";
import { TldwError } from "../types.js";
import { fetchWatchPage } from "./watch-page.js";
import { fetchViaAndroidPlayer } from "./player.js";
import { fetchViaWatchPageTracks } from "./timedtext.js";

/**
 * Layered transcript extraction:
 *   1. InnerTube player endpoint, ANDROID client (caption URLs not PoToken-gated)
 *   2. Caption tracks from the watch page's web player response
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

  // Both paths failed. If the video itself is unplayable (private, age-gated,
  // region-blocked), say that instead of blaming missing captions — but keep
  // the per-path detail either way.
  const detail = `\nDetails:\n  - ${failures.join("\n  - ")}`;

  // LOGIN_REQUIRED on a public video is YouTube's bot check, not a private
  // video: a retryable environment problem, so classify it as network.
  if (page.playabilityStatus === "LOGIN_REQUIRED") {
    throw new TldwError(
      `YouTube is asking for a sign-in before serving this video ("confirm you're not a bot"). This usually means the request came from a flagged IP such as a VPN or datacentre — retry on a residential connection.${detail}`,
      "network"
    );
  }
  if (page.playabilityStatus !== "OK" && page.playabilityStatus !== "UNKNOWN") {
    throw new TldwError(
      `Video is not accessible: ${page.playabilityStatus}${detail}`,
      "unavailable-video"
    );
  }

  throw new TldwError(
    `Could not get a transcript for this video. This usually means it has no captions.${detail}`,
    "no-captions"
  );
}
