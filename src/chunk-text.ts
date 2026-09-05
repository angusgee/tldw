export const CHUNK_CHAR_LIMIT = 12000;

/** Split text into chunks on sentence boundaries, each at most `limit` chars. */
export function chunkText(text: string, limit: number = CHUNK_CHAR_LIMIT): string[] {
  const sentences = text.split(/(?<=\.)\s+/);
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
