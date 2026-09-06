/** Windows reserved device names — reserved even with an extension ("con.txt") on older Windows. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Cap the base name so full paths stay well under Windows' 260-char MAX_PATH. */
const MAX_BASE_LENGTH = 120;

/**
 * Build a safe base filename from a video title. When the title is truncated,
 * the video id is appended so long titles sharing a prefix cannot overwrite
 * each other's files; an empty or whitespace-only title falls back to the id.
 */
export function sanitizeFilename(input: string, videoId = ""): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/ /g, "-");
  // Slice by code point, not UTF-16 unit, so the cap cannot split a surrogate pair.
  const chars = [...cleaned];
  let name = chars.slice(0, MAX_BASE_LENGTH).join("");
  if (chars.length > MAX_BASE_LENGTH && videoId) name += `-${videoId}`;
  if (!name) name = videoId || "untitled";
  return WINDOWS_RESERVED.test(name) ? `_${name}` : name;
}
