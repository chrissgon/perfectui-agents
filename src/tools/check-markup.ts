/**
 * check_markup (T-pua-7): every `pui-*` class in the given HTML that Perfect UI's stylesheet does
 * not define, with its line and the closest real class. It reads the text only: nothing is parsed
 * as a document, executed or fetched.
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
  line: number;
  suggestion: string | null;
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
    return { suggestion: null, reason: `${unknown}, and no class is within ${MAX_DISTANCE} edits; see list_components` };
  };

  return (html) => {
    const tokens = classTokens(html).filter((t) => isPuiClass(t.name));
    const findings = tokens.filter((t) => !known.has(t.name)).map((t) => ({ class: t.name, line: t.line, ...suggest(t.name) }));
    return { version: corpus.version, checked: tokens.length, valid: findings.length === 0, findings };
  };
}

const FindingSchema = z
  .object({ class: z.string(), line: z.number().int(), suggestion: z.string().nullable(), reason: z.string() })
  .strict();

export function registerCheckMarkup(server: McpServer, corpus: Corpus): void {
  const check = createChecker(corpus);
  server.registerTool(
    "check_markup",
    {
      title: "Check markup",
      description:
        `Lists every pui-* class in the HTML that Perfect UI ${corpus.version} does not define, with its line and the closest real class. ` +
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
