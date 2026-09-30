import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRuns } from "../scripts/eval-markup.js";
import { loadCorpus } from "../src/corpus.js";

// T-pua-12 (AC-6): the eval counts check_markup's findings over saved outputs, <runs>/<case>/<variant>.html.
const RUNS = join(import.meta.dirname, "fixtures/runs");
const ROOT = join(import.meta.dirname, "..");
const corpus = loadCorpus();

const EXPECTED = {
  version: "1.0.0",
  cases: [
    {
      case: "dark-mode",
      variants: {
        baseline: { invented: 0, occurrences: 0, classes: [], legacy: ["card"], checked: 3 },
        "skill-server": { invented: 0, occurrences: 0, classes: [], legacy: [], checked: 4 },
      },
    },
    {
      case: "login-card",
      variants: {
        baseline: { invented: 1, occurrences: 1, classes: ["pui-button"], legacy: [], checked: 6 },
        "skill-server": { invented: 0, occurrences: 0, classes: [], legacy: [], checked: 6 },
      },
    },
  ],
  totals: {
    baseline: { outputs: 2, invented: 1, legacy: 1 },
    "skill-server": { outputs: 2, invented: 0, legacy: 0 },
  },
};

describe("evaluateRuns", () => {
  it("counts the invented pui-* classes of each output, per case and variant", () => {
    expect(evaluateRuns(RUNS, corpus)).toEqual(EXPECTED);
  });

  it("returns no cases for an empty runs folder", () => {
    const empty = mkdtempSync(join(tmpdir(), "runs-"));
    try {
      expect(evaluateRuns(empty, corpus)).toEqual({ version: "1.0.0", cases: [], totals: {} });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("evals/cases.json", () => {
  const cases = JSON.parse(readFileSync(join(ROOT, "evals/cases.json"), "utf8")) as {
    variants: { id: string }[];
    cases: { id: string; prompt: string }[];
  };

  it("has at least six requests, each with a folder-safe id and a prompt that names Perfect UI", () => {
    expect(cases.cases.length).toBeGreaterThanOrEqual(6);
    expect(new Set(cases.cases.map((c) => c.id)).size).toBe(cases.cases.length);
    for (const c of cases.cases) {
      expect(c.id, c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.prompt, c.id).toContain("Perfect UI");
    }
  });

  it("runs every case without and with the skill and the server", () => {
    expect(cases.variants.map((v) => v.id)).toEqual(["baseline", "skill-server"]);
  });
});

describe("scripts/eval-markup.ts", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "scripts/eval-markup.ts", ...args], { cwd: ROOT, encoding: "utf8" });

  it("prints the counts as JSON on stdout", () => {
    const result = run("--runs", "tests/fixtures/runs");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(EXPECTED);
    expect(result.stderr).toContain("2 cases, 4 outputs");
  });

  it("fails with a message when the runs folder does not exist", () => {
    const result = run("--runs", "tests/fixtures/no-such-runs");
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("eval-markup: tests/fixtures/no-such-runs is not a folder");
  });

  it("explains itself with --help", () => {
    const result = run("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: npx tsx scripts/eval-markup.ts --runs <folder>");
  });
});
