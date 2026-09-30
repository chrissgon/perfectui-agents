/**
 * check_markup (T-pua-7): every `pui-*` class in the given HTML that Perfect UI's stylesheet does
 * not define, with its line and the closest real class; and (T-pua-10) every class of the previous
 * major that the migration guide renames, with the replacement the guide gives. It reads the text
 * only: nothing is parsed as a document, executed or fetched.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Corpus } from "../corpus.js";
import { classTokens, isPuiClass } from "../markup.js";
import { READ_ONLY } from "./annotations.js";

export const MAX_HTML = 100_000;
const MAX_DISTANCE = 3;

export interface Finding {
  class: string;
  /** `unknown`: a pui-* class the stylesheet does not define; `legacy`: a class the migration guide renames. */
  kind: "unknown" | "legacy";
  line: number;
  /** Absent when no class is close enough (an optional field is more portable than a nullable one). */
  suggestion?: string;
  reason: string;
}

export interface CheckResult {
  version: string;
  checked: number;
  valid: boolean;
  findings: Finding[];
}

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

export function createChecker(corpus: Corpus): (html: string) => CheckResult {
  const known = new Set(corpus.classes);
  // How often each class appears in the documentation's examples, to break ties between suggestions.
  const usage = new Map<string, number>();
  for (const entry of corpus.components) for (const example of entry.examples) {
    for (const token of classTokens(example)) usage.set(token.name, (usage.get(token.name) ?? 0) + 1);
  }
  const bySlug = new Map(corpus.components.filter((c) => c.classes.length).map((c) => [c.slug, c]));

  const nearest = (name: string, candidates: string[], limit: number) =>
    candidates
      .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
      .filter((c) => c.distance <= limit)
      .sort((x, y) => x.distance - y.distance || (usage.get(y.candidate) ?? 0) - (usage.get(x.candidate) ?? 0) || x.candidate.localeCompare(y.candidate))[0]
      ?.candidate;

  const suggest = (name: string): Pick<Finding, "suggestion" | "reason"> => {
    const unknown = `${name} is not a class of Perfect UI ${corpus.version}`;
    // `pui-<document>` (pui-button, pui-textarea): the classes that document's examples use.
    const entry = bySlug.get(name.slice("pui-".length));
    const own = entry && nearest(name, entry.classes, Infinity);
    if (entry && own) return { suggestion: own, reason: `${unknown}; the ${entry.title} document (get_component ${entry.slug}) uses ${own}` };
    const close = nearest(name, corpus.classes, MAX_DISTANCE);
    if (close) return { suggestion: close, reason: `${unknown}; the closest class is ${close}` };
    return { reason: `${unknown}, and no class is within ${MAX_DISTANCE} edits; see list_components` };
  };

  const legacy = createLegacyLookup(corpus, known);

  return (html) => {
    const tokens = classTokens(html);
    const findings: Finding[] = [];
    let checked = 0;
    for (const t of tokens) {
      if (isPuiClass(t.name)) {
        checked++;
        if (!known.has(t.name)) findings.push({ class: t.name, kind: "unknown", line: t.line, ...suggest(t.name) });
        continue;
      }
      const renamed = legacy(t.name);
      if (renamed) {
        const reason = `${t.name} is a class of Perfect UI ${corpus.migration.from}; ${corpus.migration.file} (line ${renamed.line}) replaces it with ${renamed.to}`;
        findings.push({ class: t.name, kind: "legacy", line: t.line, suggestion: renamed.to, reason });
      }
    }
    return { version: corpus.version, checked, valid: findings.length === 0, findings };
  };
}

/**
 * The replacement the migration guide gives for an old class, or undefined. A guide pattern such
 * as `style-*-secondary` → `pui-<style> pui-muted` applies only when the word `*` matched makes
 * real classes (`style-soft-secondary` → `pui-soft pui-muted`; `style-shiny-secondary` → nothing).
 */
function createLegacyLookup(corpus: Corpus, known: Set<string>): (name: string) => { to: string; line: number } | undefined {
  const exact = new Map(corpus.migration.classes.filter((m) => !m.from.includes("*")).map((m) => [m.from, m]));
  const patterns = corpus.migration.classes
    .filter((m) => m.from.includes("*"))
    .map((m) => ({ ...m, match: new RegExp(`^${m.from.split("*").map(escapeRegExp).join("([a-z0-9]+)")}$`) }));
  return (name) => {
    const found = exact.get(name);
    if (found) return found;
    for (const pattern of patterns) {
      const word = pattern.match.exec(name)?.[1];
      if (!word) continue;
      const to = pattern.to.replace(/<[a-z]+>/g, word);
      if (to.split(" ").every((c) => known.has(c))) return { to, line: pattern.line };
    }
    return undefined;
  };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const FindingSchema = z
  .object({ class: z.string(), kind: z.enum(["unknown", "legacy"]), line: z.number().int(), suggestion: z.string().optional(), reason: z.string() })
  .strict();

export function registerCheckMarkup(server: McpServer, corpus: Corpus): void {
  const check = createChecker(corpus);
  server.registerTool(
    "check_markup",
    {
      title: "Check markup",
      description:
        `Lists every pui-* class in the HTML that Perfect UI ${corpus.version} does not define (kind "unknown"), with its line and the closest real class, ` +
        `and every Perfect UI ${corpus.migration.from} class that the migration guide renames (kind "legacy"), with the guide's replacement. ` +
        "Reads class and className attributes only; other classes (your own, Tailwind) are ignored. Call it on any markup before returning it.",
      inputSchema: z
        .object({ html: z.string().min(1).max(MAX_HTML).describe(`HTML, JSX or a template, up to ${MAX_HTML} characters`) })
        .strict(),
      outputSchema: z
        .object({ version: z.string(), checked: z.number().int(), valid: z.boolean(), findings: z.array(FindingSchema) })
        .strict(),
      annotations: READ_ONLY,
    },
    async ({ html }) => {
      const result = check(html);
      const text = result.valid
        ? `No unknown Perfect UI ${result.version} classes (${result.checked} pui-* classes checked).`
        : result.findings
            .map((f) => `line ${f.line}: ${f.class}${f.suggestion ? ` → ${f.suggestion}` : ""} (${f.reason})`)
            .join("\n");
      return { content: [{ type: "text", text }], structuredContent: { ...result } };
    },
  );
}
