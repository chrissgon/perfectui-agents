import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildCorpus, cssClasses, documentDescription, parseMigrations, parseSummary } from "../scripts/build-corpus.js";
import { CorpusSchema, loadCorpus } from "../src/corpus.js";

// T-pua-4 (AC-3): one entry per summary link, every entry titled, classes exactly the stylesheet's.
const LIBRARY = join(import.meta.dirname, "fixtures/library");
const PACKAGE = join(import.meta.dirname, "fixtures/package");
const build = (library = LIBRARY) => buildCorpus({ library, packageDir: PACKAGE, libraryLabel: "v1.0.0" });

/** The fixture stylesheet's classes, listed by hand from tests/fixtures/package/dist/perfectui.css. */
const FIXTURE_CLASSES = [
  "pui-bottom", "pui-btn", "pui-card", "pui-card-content", "pui-card-header", "pui-group-row", "pui-hoverable",
  "pui-modal", "pui-muted", "pui-outline", "pui-soft", "pui-solid", "pui-striped", "pui-surface", "pui-theme",
];

describe("buildCorpus on the fixture library", () => {
  const { corpus, warnings } = build();

  it("has one entry per link of the summary, in order", () => {
    const links = parseSummary(readFileSync(join(LIBRARY, "docs/README.md"), "utf8")).flatMap((s) => s.pages);
    expect(links.map((l) => l.file)).toEqual(["docs/installation.md", "MIGRATION.md", "docs/button.md", "docs/modal.md"]);
    expect(corpus.components.map((c) => c.file)).toEqual(links.map((l) => l.file));
    expect(corpus.components.map((c) => c.slug)).toEqual(["installation", "migrating-from-0-x", "button", "modal"]);
    expect(corpus.components.map((c) => c.section)).toEqual(["Getting Started", "Getting Started", "Components", "Components"]);
  });

  it("gives every entry the document's own title", () => {
    expect(corpus.components.map((c) => c.title)).toEqual(["Installation", "Migrating from 0.x", "Button", "Modal"]);
    for (const entry of corpus.components) expect(entry.title.trim()).not.toBe("");
  });

  it("takes the classes from the stylesheet, exactly", () => {
    expect(corpus.classes).toEqual(FIXTURE_CLASSES);
  });

  it("keeps the html blocks as examples and lists their pui classes", () => {
    const button = corpus.components.find((c) => c.slug === "button")!;
    expect(button.examples).toEqual([
      '<button class="pui-btn pui-solid pui-theme">Save</button>',
      '<button class="pui-btn pui-outline pui-theme">Outline</button>',
      '<button class="pui-btn pui-outline pui-surface">Cancel</button>',
    ]);
    expect(button.classes).toEqual(["pui-btn", "pui-outline", "pui-solid", "pui-surface", "pui-theme"]);
    expect(button.markdown).toBe(readFileSync(join(LIBRARY, "docs/button.md"), "utf8"));
    // A diff block is not an example: the migration guide shows 0.x classes on purpose.
    expect(corpus.components.find((c) => c.slug === "migrating-from-0-x")!.examples).toEqual([]);
  });

  it("describes each entry with its first paragraph", () => {
    expect(corpus.components.find((c) => c.slug === "button")!.description).toBe(
      "The `pui-btn` class turns a `<button>` or an `<a>` into a button. It brings the shape only: pair it with a style and a color.",
    );
    expect(documentDescription("# T\n\n<!-- site: tags: [x] -->\n\nSome **bold** text\ncontinued.\n\n## Next")).toBe("Some bold text continued.");
  });

  it("pins the install instructions to the package version", () => {
    expect(corpus.install).toEqual({
      package: "@chrissgon/perfectui",
      version: "1.0.0",
      npm: "npm i @chrissgon/perfectui@1.0.0",
      packageManagers: { npm: "npm i @chrissgon/perfectui@1.0.0", yarn: "yarn add @chrissgon/perfectui@1.0.0" },
      cdn: {
        stylesheet: "https://cdn.jsdelivr.net/npm/@chrissgon/perfectui@1.0.0/dist/perfectui.css",
        script: "https://cdn.jsdelivr.net/npm/@chrissgon/perfectui@1.0.0/dist/js/index.js",
      },
      imports: [
        'import "@chrissgon/perfectui/perfectui.css";',
        'import "@chrissgon/perfectui/core.css";',
        'import "@chrissgon/perfectui/components/button.css";',
        'import "@chrissgon/perfectui";',
      ],
      source: "docs/installation.md",
    });
    expect(JSON.stringify(corpus.install)).not.toContain("latest");
  });

  it("warns about a document left out of the summary and a 0.x class with no class replacement", () => {
    expect(warnings).toEqual([
      "docs/orphan.md is not in the summary of docs/README.md, so it is not in the corpus",
      "MIGRATION.md:45: dark has no pui-* replacement in the guide, so check_markup does not report it",
    ]);
  });

  // T-pua-10 (AC-4): the class renames the migration guide states, and nothing else.
  it("reads the class renames of MIGRATION.md: tables, diffs and the surviving modifiers", () => {
    expect(corpus.migration).toEqual({
      file: "MIGRATION.md",
      from: "0.23.0",
      classes: [
        { from: "btn", to: "pui-btn", line: 12 },
        { from: "style-solid-primary", to: "pui-solid pui-theme", line: 20 },
        { from: "style-*-secondary", to: "pui-<style> pui-muted", line: 21 },
        { from: "style-white", to: "pui-solid pui-surface", line: 22 },
        { from: "card", to: "pui-card", line: 29 },
        { from: "card-header", to: "pui-card-header", line: 29 },
        { from: "card-content", to: "pui-card-content", line: 29 },
        { from: "modal", to: "pui-modal", line: 34 },
        { from: "table-striped", to: "pui-striped", line: 56 },
        { from: "table-hoverable", to: "pui-hoverable", line: 56 },
        { from: "list-striped", to: "pui-striped", line: 56 },
        { from: "list-hoverable", to: "pui-hoverable", line: 56 },
      ],
    });
  });

  it("records where it came from and passes its own schema", () => {
    expect(corpus.version).toBe("1.0.0");
    expect(corpus.source).toEqual({ library: "v1.0.0", package: "@chrissgon/perfectui@1.0.0" });
    expect(() => CorpusSchema.parse(corpus)).not.toThrow();
  });
});

describe("buildCorpus failures", () => {
  const withEdit = (file: string, edit: (text: string) => string, run: (library: string) => void) => {
    const library = mkdtempSync(join(tmpdir(), "corpus-"));
    try {
      cpSync(LIBRARY, library, { recursive: true });
      writeFileSync(join(library, file), edit(readFileSync(join(library, file), "utf8")));
      run(library);
    } finally {
      rmSync(library, { recursive: true, force: true });
    }
  };

  it("names the summary line of a missing document", () => {
    withEdit("docs/README.md", (t) => t.replace("docs/modal.md", "docs/dialog.md"), (library) =>
      expect(() => build(library)).toThrow('docs/README.md:15: "docs/dialog.md" does not exist in the library'),
    );
  });

  it("rejects a CDN file the package does not ship", () => {
    withEdit("docs/installation.md", (t) => t.replace("dist/js/index.js", "dist/perfectui.js"), (library) =>
      expect(() => build(library)).toThrow("names dist/perfectui.js, which is not in @chrissgon/perfectui@1.0.0"),
    );
  });

  it("rejects an import the package does not export", () => {
    withEdit("docs/installation.md", (t) => t.replace("@chrissgon/perfectui/core.css", "@chrissgon/perfectui/dist/core.css"), (library) =>
      expect(() => build(library)).toThrow('import "@chrissgon/perfectui/dist/core.css"; is not an export'),
    );
  });

  it("rejects a rename to a class the stylesheet does not define", () => {
    withEdit("MIGRATION.md", (t) => t.replace("| `pui-solid pui-surface` |", "| `pui-solid pui-paper`   |"), (library) =>
      expect(() => build(library)).toThrow("MIGRATION.md:22: style-white becomes pui-paper, which dist/perfectui.css does not define"),
    );
  });

  it("rejects two different renames of one class", () => {
    withEdit("MIGRATION.md", (t) => t.replace("| `pui-btn`  ", "| `pui-card` "), (library) =>
      expect(() => build(library)).toThrow("MIGRATION.md:28: btn becomes pui-card here but pui-btn on line 12"),
    );
  });

  it("rejects a guide without its from version", () => {
    withEdit("MIGRATION.md", (t) => t.replace("<!-- site: from: 0.23.0 -->\n", ""), (library) =>
      expect(() => build(library)).toThrow('MIGRATION.md: no "<!-- site: from: <version> -->" line'),
    );
  });

  it("rejects a document without a level-1 heading", () => {
    withEdit("docs/button.md", (t) => t.replace("# Button", "## Button"), (library) =>
      expect(() => build(library)).toThrow("docs/button.md: expected one level-1 heading, found 0"),
    );
  });
});

describe("parseMigrations", () => {
  it("pairs each old name with pui-<name> when the new side lists several classes", () => {
    const md = "<!-- site: from: 0.9.0 -->\n\n| `0.9.0` | `1.0.0` |\n| - | - |\n| `badge` | `pui-badge`, plus the new `pui-chip` |\n";
    expect(parseMigrations(md)).toEqual({ from: "0.9.0", classes: [{ from: "badge", to: "pui-badge", line: 5 }], unmapped: [] });
  });

  it("ignores tables whose header is not a pair of versions, and code outside diff blocks", () => {
    const md = [
      "<!-- site: from: 0.9.0 -->",
      "| Removed | What to do instead |",
      "| - | - |",
      "| `unmarker` | `pui-soft pui-theme` |",
      "```html",
      '<b class="btn">',
      "```",
    ].join("\n");
    expect(parseMigrations(md)).toEqual({ from: "0.9.0", classes: [], unmapped: [] });
  });
});

describe("cssClasses", () => {
  it("reads selectors, ignores comments and custom properties", () => {
    expect(cssClasses("/* .pui-ghost */ :root{--pui-x:1} .pui-a:hover,.pui-b>.pui-a{}")).toEqual(["pui-a", "pui-b"]);
  });
});

describe("the committed corpus, data/corpus-1.0.0.json", () => {
  let corpus: ReturnType<typeof loadCorpus>;
  beforeAll(() => {
    corpus = loadCorpus();
  });

  it("comes from the v1.0.0 tag and the 1.0.0 package", () => {
    expect(corpus.version).toBe("1.0.0");
    expect(corpus.source.library).toBe("v1.0.0");
    expect(corpus.source.package).toBe("@chrissgon/perfectui@1.0.0");
    expect(corpus.source.integrity).toMatch(/^sha512-/);
  });

  it("has the 28 documents of the v1.0.0 summary and the 51 classes of the stylesheet", () => {
    // Counted on 2026-09-30: 28 links in `git show v1.0.0:docs/README.md`, and
    // `grep -oE '\.pui-[a-z0-9-]+' dist/perfectui.css | sort -u | wc -l` = 51 in the 1.0.0 package.
    expect(corpus.components).toHaveLength(28);
    expect(corpus.classes).toHaveLength(51);
    expect(corpus.components.every((c) => c.title.length > 0)).toBe(true);
  });

  it("carries the class renames MIGRATION.md states from 0.23.0, each to real 1.0.0 classes", () => {
    // Counted on 2026-09-30 in MIGRATION.md at v1.0.0: 7 rows in the style table, 20 names in the
    // components table (btn first appears in the prefix diff), 6 more in the component diffs, and
    // the 4 table and list modifiers that "survive as" pui-striped and pui-hoverable.
    const { migration } = corpus;
    expect(migration.from).toBe("0.23.0");
    expect(migration.classes).toHaveLength(38);
    const to = (from: string) => migration.classes.find((m) => m.from === from)?.to;
    expect(to("style-soft-success")).toBe("pui-soft pui-success");
    expect(to("style-*-secondary")).toBe("pui-<style> pui-muted");
    expect(to("dropdown")).toBe("pui-dropdown");
    expect(to("table-hoverable")).toBe("pui-hoverable");
    for (const removed of ["active", "dark", "overflow-hidden", "bg-*", "unmarker", "dropdown-trigger"]) expect(to(removed), removed).toBeUndefined();
    const known = new Set(corpus.classes);
    for (const m of migration.classes) {
      for (const cls of m.to.split(" ").filter((c) => !c.includes("<"))) expect(known.has(cls), `${m.from} → ${cls}`).toBe(true);
    }
  });
});
