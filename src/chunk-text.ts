export const CHUNK_CHAR_LIMIT = 12000;

/**
 * Split text into chunks on sentence boundaries, max `limit` chars each.
 * Unpunctuated transcripts get hard-split on whitespace so the limit always holds.
 */
export function chunkText(text: string, limit: number = CHUNK_CHAR_LIMIT): string[] {
  const sentences = text.split(/(?<=\.)\s+/).flatMap((s) => hardSplit(s, limit));
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > limit && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence + " ";
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

/** Break one oversized sentence on whitespace. Cuts mid-word as a last resort. */
function hardSplit(sentence: string, limit: number): string[] {
  if (sentence.length <= limit) return [sentence];
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}
