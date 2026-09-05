import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Minimal .env support, zero dependencies. Load order (first found wins per
 * key, real environment variables always beat both):
 *   1. .env in the current working directory
 *   2. ~/.tldw.env - global config so tldw works from any folder
 */
export function loadEnvFile(): void {
  loadOne(path.join(process.cwd(), ".env"));
  loadOne(path.join(os.homedir(), ".tldw.env"));
}

function loadOne(file: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
