import type { TranscriptSegment } from "../types.js";

/** Parse YouTube's json3 caption format: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] } */
export function parseJson3(json3: any): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const event of json3?.events ?? []) {
    if (!event.segs) continue;
    const text = event.segs
      .map((s: any) => s.utf8 || "")
      .join("")
      .trim();
    if (!text || text === "\n") continue;
    segments.push({
      offset: (event.tStartMs || 0) / 1000,
      duration: (event.dDurationMs || 0) / 1000,
      text,
    });
  }
  return segments;
}
