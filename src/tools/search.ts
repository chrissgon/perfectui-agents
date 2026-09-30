/**
 * search_docs (T-pua-6): MiniSearch 7.2.0 over every document's sections, with the options of the
 * documentation site's search (perfectui-doc ADR-0009, `shared/search-options.ts`): prefix matching,
 * one typo from four characters, title above heading above body, a page's opening section first.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MiniSearch, { type Options } from "minisearch";
import { z } from "zod";
import type { Corpus, Entry } from "../corpus.js";
import { READ_ONLY } from "./annotations.js";

export interface Section {
  id: string;
  slug: string;
  title: string;
  /** The section's heading; empty for the opening section, before the first heading. */
  heading: string;
  content: string;
}

/**
 * A document cut at its level-2 to level-6 headings. Headings inside code blocks do not count, and
 * everything above the title (the library's section label, `#### Components`) is left out.
 */
export function splitSections(entry: Entry): Section[] {
  const sections: Section[] = [];
  let heading = "";
  let lines: string[] = [];
  let fence: string | null = null;
  let titled = false;
  const flush = () => {
    const content = lines.join("\n").trim();
    if (content || heading) sections.push({ id: `${entry.slug}#${sections.length}`, slug: entry.slug, title: entry.title, heading, content });
    lines = [];
  };
  for (const line of entry.markdown.split("\n")) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (fence) {
      if (line.trim() === fence) fence = null;
    } else if (marker) {
      fence = marker;
    } else if (/^#\s+/.test(line)) {
      titled = true;
      continue;
    } else if (titled) {
      const sub = /^#{2,6}\s+(.*)$/.exec(line);
      if (sub) {
        flush();
        heading = sub[1]!.trim();
        continue;
      }
    }
    if (titled) lines.push(line);
  }
  flush();
  return sections;
}

const OPTIONS: Options<Section> = {
  fields: ["title", "heading", "content"],
  storeFields: ["slug", "title", "heading", "content"],
  searchOptions: {
    prefix: true,
    fuzzy: (term: string) => (term.length >= 4 ? 1 : 0),
    boost: { title: 3, heading: 2 },
    boostDocument: (_id, _term, stored) => (stored?.heading ? 1 : 1.5),
  },
};

export interface SearchResult {
  slug: string;
  title: string;
  heading: string;
  snippet: string;
  score: number;
}

export function createSearch(corpus: Corpus): (query: string, limit: number) => SearchResult[] {
  const index = new MiniSearch<Section>(OPTIONS);
  index.addAll(corpus.components.flatMap(splitSections));
  return (query, limit) =>
    index
      .search(query)
      .slice(0, limit)
      .map((hit) => ({
        slug: hit.slug as string,
        title: hit.title as string,
        heading: hit.heading as string,
        snippet: snippet(hit.content as string, hit.terms, !hit.heading),
        score: Math.round(hit.score * 100) / 100,
      }));
}

const SNIPPET = 240;

/**
 * About 240 characters of the section, whitespace collapsed: from its start when the first matched
 * term is visible there or when `fromStart` is set (a page's opening section starts with its
 * description, the best summary of the page), else from a little before that term.
 */
export function snippet(content: string, terms: string[], fromStart = false): string {
  const text = content.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t.toLowerCase())).filter((i) => i >= 0), Infinity);
  if (text.length <= SNIPPET) return text;
  const start = fromStart || at === Infinity || at + 40 <= SNIPPET ? 0 : at - 60;
  const end = Math.min(text.length, start + SNIPPET);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export const SearchInput = z
  .object({
    query: z.string().trim().min(1).max(200).describe("words to look for, for example 'modal backdrop' or 'dark mode'"),
    limit: z.number().int().min(1).max(10).default(5).describe("how many sections to return, 1 to 10 (default 5)"),
  })
  .strict();

const ResultSchema = z
  .object({ slug: z.string(), title: z.string(), heading: z.string(), snippet: z.string(), score: z.number() })
  .strict();

export function registerSearch(server: McpServer, corpus: Corpus): void {
  const search = createSearch(corpus);
  server.registerTool(
    "search_docs",
    {
      title: "Search the documentation",
      description:
        `Full-text search over the sections of every Perfect UI ${corpus.version} document (prefix and typo tolerant). ` +
        "Returns the document slug (for get_component), the section heading (empty for the opening section), a snippet and a score, best first.",
      inputSchema: SearchInput,
      outputSchema: z.object({ query: z.string(), results: z.array(ResultSchema) }).strict(),
      annotations: READ_ONLY,
    },
    async ({ query, limit }) => {
      const results = search(query, limit);
      const text = results.length
        ? results.map((r) => `${r.slug}${r.heading ? ` › ${r.heading}` : ""} (${r.score}): ${r.snippet}`).join("\n")
        : `No section of Perfect UI ${corpus.version} matches "${query}".`;
      return { content: [{ type: "text", text }], structuredContent: { query, results } };
    },
  );
}
