export interface TranscriptSegment {
  text: string;
  /** Duration in seconds. */
  duration: number;
  /** Start offset in seconds. */
  offset: number;
}

export type TranscriptSource = "innertube" | "timedtext";

export interface VideoTranscript {
  videoId: string;
  title: string;
  segments: TranscriptSegment[];
  source: TranscriptSource;
}

/** Classified failure reasons so the CLI can print something useful. */
export class TldwError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | "bad-input"
      | "unavailable-video"
      | "no-captions"
      | "network"
      | "provider-auth"
      | "provider-error"
      | "config"
  ) {
    super(message);
    this.name = "TldwError";
  }
}
