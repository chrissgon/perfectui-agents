import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadCorpus, type Entry } from "../src/corpus.js";
import { registerSearch, snippet, splitSections, type SearchResult } from "../src/tools/search.js";
import { call, connectWith, text } from "./helpers/connect.js";

// T-pua-6 (AC-1): search_docs through the SDK client, over the committed corpus.
const corpus = loadCorpus();
let client: Client;
beforeAll(async () => {
  client = await connectWith((server) => registerSearch(server, corpus));
});
const results = async (args: Record<string, unknown>) => {
  const result = await call(client, "search_docs", args);
  expect(result.isError).toBeFalsy();
  return (result.structuredContent as { results: SearchResult[] }).results;
};

describe("search_docs", () => {
  it('puts the modal document first for "modal"', async () => {
    const found = await results({ query: "modal" });
    expect(found[0]).toMatchObject({ slug: "modal", title: "Modal", heading: "" });
    expect(found[0]!.snippet).toContain("Built on `<dialog>`");
    expect(found.length).toBeLessThanOrEqual(5);
  });

  it("finds a section by its heading, with a typo", async () => {
    const found = await results({ query: "static backdrp", limit: 3 });
    expect(found[0]).toMatchObject({ slug: "modal", heading: "A static backdrop" });
  });

  it("returns an empty list when nothing matches", async () => {
    const result = await call(client, "search_docs", { query: "qwxyzzy" });
    expect(result.structuredContent).toEqual({ query: "qwxyzzy", results: [] });
    expect(text(result)).toBe('No section of Perfect UI 1.0.0 matches "qwxyzzy".');
  });

  it("honours the limit", async () => {
    expect(await results({ query: "pui", limit: 10 })).toHaveLength(10);
    expect(await results({ query: "pui", limit: 1 })).toHaveLength(1);
  });

  it("rejects a query of 201 characters and accepts one of 200", async () => {
    const long = await call(client, "search_docs", { query: "a".repeat(201) });
    expect(long.isError).toBe(true);
    expect(text(long)).toContain("Input validation error");
    expect((await call(client, "search_docs", { query: "a".repeat(200) })).isError).toBeFalsy();
  });

  it("rejects a blank query, a limit out of range and an extra argument", async () => {
    for (const args of [{ query: "   " }, { query: "modal", limit: 0 }, { query: "modal", limit: 11 }, { query: "modal", page: 2 }]) {
      const result = await call(client, "search_docs", args);
      expect(result.isError, JSON.stringify(args)).toBe(true);
    }
  });
});

describe("splitSections", () => {
  const entry: Entry = {
    slug: "demo",
    title: "Demo",
    section: "Components",
    file: "docs/demo.md",
    description: "Opening.",
    markdown: "#### Components\n\n# Demo\n\nOpening.\n\n```html\n## not a heading\n```\n\n### First\n\nOne.\n\n#### Deeper\n\nTwo.\n",
    examples: [],
    classes: [],
  };

  it("cuts at headings below the title, ignoring the label above it and headings in code", () => {
    expect(splitSections(entry).map((s) => [s.heading, s.content])).toEqual([
      ["", "Opening.\n\n```html\n## not a heading\n```"],
      ["First", "One."],
      ["Deeper", "Two."],
    ]);
  });
});

describe("snippet", () => {
  it("keeps a short section whole and cuts a long one around the match", () => {
    expect(snippet("short   text", ["text"])).toBe("short text");
    const long = `${"a ".repeat(200)}needle ${"b ".repeat(200)}`;
    const cut = snippet(long, ["needle"]);
    expect(cut).toContain("needle");
    expect(cut.startsWith("…")).toBe(true);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(242);
    expect(snippet(long, ["needle"], true).startsWith("a a")).toBe(true);
  });
});
