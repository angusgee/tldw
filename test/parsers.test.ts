import { describe, expect, it } from "vitest";
import { parseJson3 } from "../src/transcript/json3.js";
import { parseCaptionXml, decodeEntities, pickTrack } from "../src/transcript/captions.js";
import { chunkText } from "../src/chunk-text.js";
import { sanitizeFilename } from "../src/sanitize-filename.js";

describe("parseJson3", () => {
  it("flattens events/segs/utf8 and skips empties", () => {
    const fixture = {
      events: [
        { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
        { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: "\n" }] },
        { tStartMs: 3000, dDurationMs: 1500, segs: [{ utf8: "again" }] },
        { tStartMs: 5000, dDurationMs: 100 },
      ],
    };
    const segments = parseJson3(fixture);
    expect(segments).toEqual([
      { offset: 0, duration: 2, text: "Hello world" },
      { offset: 3, duration: 1.5, text: "again" },
    ]);
  });
});

describe("parseCaptionXml", () => {
  it("parses text elements with entities and strips tags", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<transcript>
  <text start="0.42" dur="2.1">Hello &amp;amp; welcome</text>
  <text start="2.52" dur="1.9">it&amp;#39;s &lt;i&gt;great&lt;/i&gt;</text>
  <text start="5" dur="1"> </text>
</transcript>`.replace(/&amp;amp;/g, "&amp;").replace(/&amp;#39;/g, "&#39;").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const segments = parseCaptionXml(xml);
    expect(segments).toEqual([
      { offset: 0.42, duration: 2.1, text: "Hello & welcome" },
      { offset: 2.52, duration: 1.9, text: "it's great" },
    ]);
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("a &amp; b &#39;c&#39; &#x41; &quot;d&quot;")).toBe(`a & b 'c' A "d"`);
  });
  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&wibble;")).toBe("&wibble;");
  });
});

describe("pickTrack", () => {
  const manualEn = { baseUrl: "a", languageCode: "en", kind: undefined };
  const asrEn = { baseUrl: "b", languageCode: "en", kind: "asr" };
  const manualDe = { baseUrl: "c", languageCode: "de", kind: undefined };

  it("prefers manual over auto-generated", () => {
    expect(pickTrack([asrEn, manualEn])).toBe(manualEn);
  });
  it("prefers the requested language", () => {
    expect(pickTrack([manualEn, manualDe], "de")).toBe(manualDe);
  });
  it("falls back to English", () => {
    expect(pickTrack([manualDe, asrEn])).toBe(asrEn);
  });
});

describe("chunkText", () => {
  it("splits on sentence boundaries under the limit", () => {
    const text = "One. Two. Three. Four.";
    const chunks = chunkText(text, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(12);
    }
  });
  it("returns one chunk for short text", () => {
    expect(chunkText("Short text.", 12000)).toEqual(["Short text."]);
  });
});

describe("sanitizeFilename", () => {
  it("strips filesystem-hostile characters", () => {
    expect(sanitizeFilename('a<b>:c"/d\\e|f?g*h')).toBe("a_b_c_d_e_f_g_h");
  });
  it("converts spaces to dashes", () => {
    expect(sanitizeFilename("my video title")).toBe("my-video-title");
  });
});
