/**
 * Counts, with check_markup's own checker, the Perfect UI classes a model invented in the outputs
 * of an evaluation run (T-pua-12). An output is `<runs>/<case>/<variant>.html`; the cases are in
 * `evals/cases.json`. Other files beside the outputs are ignored.
 *
 * Usage: npx tsx scripts/eval-markup.ts --runs evals/runs/<date> [--corpus data/corpus-1.0.0.json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { DEFAULT_CORPUS, loadCorpus, type Corpus } from "../src/corpus.js";
import { createChecker } from "../src/tools/check-markup.js";

export interface OutputCount {
  /** Distinct pui-* classes the stylesheet does not define. */
  invented: number;
  /** Every occurrence of those classes. */
  occurrences: number;
  classes: string[];
  /** Distinct classes of the previous major that the migration guide renames. */
  legacy: string[];
  /** pui-* classes read. */
  checked: number;
}

export interface EvalReport {
  version: string;
  cases: { case: string; variants: Record<string, OutputCount> }[];
  totals: Record<string, { outputs: number; invented: number; legacy: number }>;
}

const distinct = (names: string[]) => [...new Set(names)].sort();
const folders = (dir: string) =>
  readdirSync(dir)
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .sort();

export function evaluateRuns(runs: string, corpus: Corpus): EvalReport {
  const check = createChecker(corpus);
  const report: EvalReport = { version: corpus.version, cases: [], totals: {} };
  for (const name of folders(runs)) {
    const variants: Record<string, OutputCount> = {};
    for (const file of readdirSync(join(runs, name)).filter((f) => f.endsWith(".html")).sort()) {
      const result = check(readFileSync(join(runs, name, file), "utf8"));
      const invented = result.findings.filter((f) => f.kind === "unknown").map((f) => f.class);
      const legacy = distinct(result.findings.filter((f) => f.kind === "legacy").map((f) => f.class));
      const classes = distinct(invented);
      const variant = file.slice(0, -".html".length);
      variants[variant] = { invented: classes.length, occurrences: invented.length, classes, legacy, checked: result.checked };
      const total = (report.totals[variant] ??= { outputs: 0, invented: 0, legacy: 0 });
      total.outputs++;
      total.invented += classes.length;
      total.legacy += legacy.length;
    }
    report.cases.push({ case: name, variants });
  }
  return report;
}

const HELP = `Usage: npx tsx scripts/eval-markup.ts --runs <folder> [--corpus <file>]

Reads every <folder>/<case>/<variant>.html, runs check_markup's checker on it, and prints JSON:
per case and variant, the distinct invented pui-* classes (invented, classes), their occurrences,
the 0.x classes the migration guide renames (legacy) and the pui-* classes read (checked); then
totals per variant. Default corpus: data/corpus-1.0.0.json. Exit 2 when the folder is missing.`;

function main(): void {
  const { values } = parseArgs({ options: { runs: { type: "string" }, corpus: { type: "string" }, help: { type: "boolean" } } });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const runs = values.runs;
  if (!runs || !statSync(runs, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`eval-markup: ${runs ?? "--runs"} is not a folder\n\n${HELP}`);
    process.exit(2);
  }
  const report = evaluateRuns(runs, loadCorpus(values.corpus ?? DEFAULT_CORPUS));
  const outputs = Object.values(report.totals).reduce((sum, t) => sum + t.outputs, 0);
  console.log(JSON.stringify(report, null, 2));
  console.error(`eval-markup: ${report.cases.length} cases, ${outputs} outputs, Perfect UI ${report.version}`);
}

if (process.argv[1]?.endsWith("eval-markup.ts")) main();
