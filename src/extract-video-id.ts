/** Accepts a bare 11-char video id or any common YouTube URL shape. */
export function extractVideoId(input: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      return validId(url.pathname.slice(1).split("/")[0]);
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const fromParam = url.searchParams.get("v");
      if (fromParam) return validId(fromParam);
      const pathMatch = url.pathname.match(/^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

function validId(candidate: string | undefined): string | null {
  return candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
}
