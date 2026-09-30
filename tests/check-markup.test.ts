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
          kind: "unknown",
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
    const finding = first('<div class="pui-zzzzzzzzzz">');
    expect(finding).not.toHaveProperty("suggestion");
    expect(finding?.reason).toContain("no class is within 3 edits");
  });
});

// T-pua-10 (AC-4): a class of 0.23.0 gets the 1.0.0 replacement MIGRATION.md gives for it.
describe("classes of Perfect UI 0.23.0", () => {
  it("suggests the replacements MIGRATION.md gives, with the guide's line", async () => {
    // MIGRATION.md at v1.0.0, line 55: -<button class="btn style-solid-primary">; line 67: style-solid-primary → pui-solid pui-theme.
    const result = await call(client, "check_markup", { html: '<button class="btn style-solid-primary">Save</button>' });
    expect(result.structuredContent).toEqual({
      version: "1.0.0",
      checked: 0,
      valid: false,
      findings: [
        {
          class: "btn",
          kind: "legacy",
          line: 1,
          suggestion: "pui-btn",
          reason: "btn is a class of Perfect UI 0.23.0; MIGRATION.md (line 55) replaces it with pui-btn",
        },
        {
          class: "style-solid-primary",
          kind: "legacy",
          line: 1,
          suggestion: "pui-solid pui-theme",
          reason: "style-solid-primary is a class of Perfect UI 0.23.0; MIGRATION.md (line 67) replaces it with pui-solid pui-theme",
        },
      ],
    });
    expect(text(result)).toBe(
      [
        "line 1: btn → pui-btn (btn is a class of Perfect UI 0.23.0; MIGRATION.md (line 55) replaces it with pui-btn)",
        "line 1: style-solid-primary → pui-solid pui-theme (style-solid-primary is a class of Perfect UI 0.23.0; MIGRATION.md (line 67) replaces it with pui-solid pui-theme)",
      ].join("\n"),
    );
  });

  it("maps every 0.23.0 component class of the guide's table", () => {
    const html = '<div class="card"><div class="card-header"></div><ul class="list"><li class="list-item"></li></ul><table class="table table-striped"></table></div>';
    expect(check(html).findings.map((f) => [f.class, f.suggestion])).toEqual([
      ["card", "pui-card"],
      ["card-header", "pui-card-header"],
      ["list", "pui-list"],
      ["list-item", "pui-list-item"],
      ["table", "pui-table"],
      ["table-striped", "pui-striped"],
    ]);
  });

  it("fills the guide's style-*-secondary pattern only with a real style", () => {
    expect(check('<a class="style-outline-secondary">').findings[0]).toMatchObject({ kind: "legacy", suggestion: "pui-outline pui-muted" });
    expect(check('<a class="style-soft-secondary">').findings[0]?.suggestion).toBe("pui-soft pui-muted");
    expect(check('<a class="style-shiny-secondary">').findings).toEqual([]);
  });

  it("leaves alone names the guide gives no class for, and classes of other libraries", () => {
    // dark, active and overflow-hidden appear in MIGRATION.md without a pui-* replacement.
    const html = '<html class="dark"><a class="active overflow-hidden w-full rounded-none text-sm my-card">';
    expect(check(html)).toMatchObject({ valid: true, findings: [] });
  });

  it("reports unknown pui-* classes and 0.23.0 classes together, in document order", () => {
    const findings = check('<button class="btn pui-sollid pui-theme">\n<span class="badge">').findings;
    expect(findings.map((f) => [f.line, f.class, f.kind, f.suggestion])).toEqual([
      [1, "btn", "legacy", "pui-btn"],
      [1, "pui-sollid", "unknown", "pui-solid"],
      [2, "badge", "legacy", "pui-badge"],
    ]);
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
