/** Windows reserved device names — invalid as filenames even with an extension on older Windows. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Cap the base name so full paths stay well under Windows' 260-char MAX_PATH. */
const MAX_BASE_LENGTH = 120;

export function sanitizeFilename(input: string): string {
  const name = input
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/ /g, "-")
    .slice(0, MAX_BASE_LENGTH);
  return WINDOWS_RESERVED.test(name) ? `_${name}` : name;
}
