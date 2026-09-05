import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Minimal .env support, zero dependencies: loads KEY=value lines from a .env
 * in the current working directory. Real environment variables always win.
 */
export function loadEnvFile(): void {
  const file = path.join(process.cwd(), ".env");
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
