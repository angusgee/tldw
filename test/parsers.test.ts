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
  it("skips self-closing text elements without stealing the next element's body", () => {
    const xml = `<transcript><text start="1" dur="2"/><text start="3" dur="2">hi</text></transcript>`;
    expect(parseCaptionXml(xml)).toEqual([{ offset: 3, duration: 2, text: "hi" }]);
  });
  it("does not bind start to a data-start attribute", () => {
    const xml = `<transcript><text data-start="99.9" start="1.2" dur="3">hi</text></transcript>`;
    expect(parseCaptionXml(xml)).toEqual([{ offset: 1.2, duration: 3, text: "hi" }]);
  });
  it("handles a missing dur attribute and reordered attributes", () => {
    const xml = `<transcript>
  <text start="1.5">no duration</text>
  <text dur="2" start="4">reordered</text>
</transcript>`;
    expect(parseCaptionXml(xml)).toEqual([
      { offset: 1.5, duration: 0, text: "no duration" },
      { offset: 4, duration: 2, text: "reordered" },
    ]);
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeEntities("a &amp; b &#39;c&#39; &#x41; &quot;d&quot;")).toBe(`a & b 'c' A "d"`);
  });
  it("decodes uppercase-X hex entities", () => {
    expect(decodeEntities("&#X41;")).toBe("A");
  });
  it("leaves unknown entities alone", () => {
    expect(decodeEntities("&wibble;")).toBe("&wibble;");
  });
  it("decodes common named entities beyond the XML five", () => {
    expect(decodeEntities("it&rsquo;s a caf&eacute; &hellip; &frac12; &mdash; done")).toBe(
      "it’s a café … ½ — done"
    );
  });
  it("leaves out-of-range numeric entities alone instead of throwing", () => {
    expect(decodeEntities("&#x110000; &#999999999;")).toBe("&#x110000; &#999999999;");
  });
  it("does not misparse malformed decimal entities as hex digits", () => {
    expect(decodeEntities("&#3f;")).toBe("&#3f;");
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
  it("hard-splits unpunctuated text so no chunk exceeds the limit", () => {
    const text = Array(100).fill("word").join(" "); // no full stops at all
    const chunks = chunkText(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
    expect(chunks.join(" ")).toBe(text);
  });
});

describe("sanitizeFilename", () => {
  it("strips filesystem-hostile characters", () => {
    expect(sanitizeFilename('a<b>:c"/d\\e|f?g*h')).toBe("a_b_c_d_e_f_g_h");
  });
  it("converts spaces to dashes", () => {
    expect(sanitizeFilename("my video title")).toBe("my-video-title");
  });
  it("guards Windows reserved device names, including with an extension", () => {
    expect(sanitizeFilename("CON")).toBe("_CON");
    expect(sanitizeFilename("nul")).toBe("_nul");
    expect(sanitizeFilename("CON.talk")).toBe("_CON.talk");
  });
  it("caps very long names", () => {
    expect(sanitizeFilename("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });
  it("appends the video id when the title was truncated, so prefixes cannot collide", () => {
    const prefix = "x".repeat(150);
    const a = sanitizeFilename(prefix + "part-1", "aaaaaaaaaaa");
    const b = sanitizeFilename(prefix + "part-2", "bbbbbbbbbbb");
    expect(a).not.toBe(b);
    expect(a.endsWith("-aaaaaaaaaaa")).toBe(true);
  });
  it("never splits a surrogate pair at the cap", () => {
    const name = sanitizeFilename("x".repeat(119) + "😀😀", "dQw4w9WgXcQ");
    expect(name.isWellFormed()).toBe(true);
    expect(name).toContain("😀");
  });
  it("falls back to the video id for whitespace-only titles", () => {
    expect(sanitizeFilename("   ", "dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(sanitizeFilename("   ")).toBe("untitled");
  });
});
