import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadCorpus } from "../src/corpus.js";
import { classTokens } from "../src/markup.js";
import { createChecker, editDistance, MAX_HTML, registerCheckMarkup } from "../src/tools/check-markup.js";
import { call, connectWith, text } from "./helpers/connect.js";

// T-pua-7 (AC-1, AC-4): check_markup through the SDK client, over the committed corpus.
const corpus = loadCorpus();
const check = createChecker(corpus);
let client: Client;
beforeAll(async () => {
  client = await connectWith((server) => registerCheckMarkup(server, corpus));
});

describe("check_markup", () => {
  it("flags an invented class and suggests pui-btn for pui-button", async () => {
    const result = await call(client, "check_markup", { html: '<button class="pui-button">Save</button>' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      version: "1.0.0",
      checked: 1,
      valid: false,
      findings: [
        {
          class: "pui-button",
          line: 1,
          suggestion: "pui-btn",
          reason: "pui-button is not a class of Perfect UI 1.0.0; the Button document (get_component button) uses pui-btn",
        },
      ],
    });
    expect(text(result)).toMatch(/^line 1: pui-button → pui-btn \(/);
  });

  it("finds nothing in any html example of the 1.0.0 documents", () => {
    const examples = corpus.components.flatMap((c) => c.examples.map((html) => ({ slug: c.slug, html })));
    expect(examples.length).toBeGreaterThan(90);
    for (const { slug, html } of examples) {
      expect(check(html).findings, `an example of ${slug}`).toEqual([]);
    }
  });

  it("says so in words when the markup is clean", async () => {
    const result = await call(client, "check_markup", { html: '<button class="pui-btn pui-solid pui-theme">Save</button>' });
    expect(text(result)).toBe("No unknown Perfect UI 1.0.0 classes (3 pui-* classes checked).");
    expect(result.structuredContent?.valid).toBe(true);
  });

  it(`rejects more than ${MAX_HTML} characters and accepts exactly ${MAX_HTML}`, async () => {
    const over = await call(client, "check_markup", { html: "x".repeat(MAX_HTML + 1) });
    expect(over.isError).toBe(true);
    expect(text(over)).toContain("Input validation error");
    expect((await call(client, "check_markup", { html: "x".repeat(MAX_HTML) })).isError).toBeFalsy();
  });

  it("rejects empty html and an extra argument", async () => {
    expect((await call(client, "check_markup", { html: "" })).isError).toBe(true);
    expect((await call(client, "check_markup", { html: "<p></p>", fix: true })).isError).toBe(true);
  });
});

describe("suggestions", () => {
  const first = (html: string) => check(html).findings[0];

  it("corrects typos to the closest class", () => {
    expect(first('<b class="pui-buton">')?.suggestion).toBe("pui-btn");
    expect(first('<b class="pui-sollid">')?.suggestion).toBe("pui-solid");
    expect(first('<b class="pui-card-heder">')?.suggestion).toBe("pui-card-header");
  });

  it("maps pui-<document> to the class that document uses", () => {
    expect(first('<textarea class="pui-textarea">')).toMatchObject({ suggestion: "pui-input", reason: expect.stringContaining("the Textarea document") });
  });

  it("gives no suggestion when nothing is within 3 edits", () => {
    expect(first('<div class="pui-zzzzzzzzzz">')).toMatchObject({ suggestion: null, reason: expect.stringContaining("no class is within 3 edits") });
  });
});

describe("reading class attributes", () => {
  it("reports the line of each class across quoting styles and JSX", () => {
    const html = [
      "<div class='pui-card'>", // 1
      '  <p class="own-class pui-nope">', // 2
      "  <Button className=\"pui-btnn\" />", // 3
      "  <i class=pui-bad>", // 4
      '  <span class="pui-chip', // 5
      '    pui-wrong">', // 6
    ].join("\n");
    expect(check(html).findings.map((f) => [f.line, f.class])).toEqual([
      [2, "pui-nope"],
      [3, "pui-btnn"],
      [4, "pui-bad"],
      [6, "pui-wrong"],
    ]);
    expect(check(html).checked).toBe(6);
  });

  it("ignores comments, bindings and attributes that only end in class", () => {
    const html = '<!-- <b class="pui-old"> -->\n<b :class="{ \'pui-x\': on }" data-class="pui-y" v-bind:class="z">';
    expect(classTokens(html)).toEqual([]);
    expect(check(html)).toMatchObject({ checked: 0, valid: true });
  });
});

describe("editDistance", () => {
  it("counts insertions, deletions and substitutions", () => {
    expect(editDistance("pui-button", "pui-btn")).toBe(3);
    expect(editDistance("pui-button", "pui-bottom")).toBe(2);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
