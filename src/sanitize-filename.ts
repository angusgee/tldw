/** Windows reserved device names. Reserved even with an extension on older Windows. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Cap the base name so full paths stay well under Windows' 260-char MAX_PATH. */
const MAX_BASE_LENGTH = 120;

/**
 * Build a safe base filename from a video title.
 * Truncated titles get the video id appended so they cannot collide.
 * Blank titles fall back to the id.
 */
export function sanitizeFilename(input: string, videoId = ""): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/ /g, "-");
  // slice by code point so the cap cannot split a surrogate pair
  const chars = [...cleaned];
  let name = chars.slice(0, MAX_BASE_LENGTH).join("");
  if (chars.length > MAX_BASE_LENGTH && videoId) name += `-${videoId}`;
  if (!name) name = videoId || "untitled";
  return WINDOWS_RESERVED.test(name) ? `_${name}` : name;
}
