/**
 * Writes `data/corpus-<version>.json` (T-pua-4) from two sources only:
 *
 * - the library's documents at a tag: one entry per link of the summary in `docs/README.md`;
 * - the published package's `dist/perfectui.css`: the set of `.pui-*` classes.
 *
 * `parseSummary` and `kebab` are adapted from perfectui-doc's `shared/library-docs.ts`
 * (MIT, copyright Christopher Gonçalves, https://github.com/chrissgon/perfectui-doc), so the
 * slugs match the documentation site's URLs.
 *
 * Usage: npm run corpus [-- --ref v1.0.0 --version 1.0.0 --out data/corpus-1.0.0.json]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CorpusSchema, type Corpus, type Entry, type Install } from "../src/corpus.js";
import { puiClasses } from "../src/markup.js";
import { DEFAULT_REF, DEFAULT_VERSION, PACKAGE_NAME, readPackInfo, resolveLibrary, resolvePackage } from "./fetch-library.js";

const REPOSITORY = "https://github.com/chrissgon/perfectui";

export interface SummaryPage {
  title: string;
  slug: string;
  /** Path in the library repository: `docs/button.md` or `MIGRATION.md`. */
  file: string;
  line: number;
}

export interface SummarySection {
  title: string;
  pages: SummaryPage[];
}

export const kebab = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const GITHUB_LINK = /^https:\/\/github\.com\/chrissgon\/perfectui\/(?:blob|tree)\/[^/]+\/(.*)$/;

/** A summary link as a repository path, or null when it points outside the library. */
function libraryPath(url: string, from: string): string | null {
  const target = url.split("#")[0] ?? "";
  const github = GITHUB_LINK.exec(target);
  if (github) return github[1]!;
  if (/^[a-z]+:|^\/|^$/i.test(target)) return null;
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** Sections and pages, in order, from the `## Summary` list of `docs/README.md`. */
export function parseSummary(text: string, file = "docs/README.md"): SummarySection[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s+Summary\s*$/i.test(l));
  if (start < 0) throw new Error(`${file}: no "## Summary" heading`);
  const sections: SummarySection[] = [];
  const seen = new Map<string, number>();
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (/^#{1,2}\s/.test(line)) break;
    const item = /^[-*]\s+\[([^\]]+)\]\(([^)]+)\)/.exec(line);
    if (!item) {
      sections.push({ title: line.replace(/^#+\s*/, ""), pages: [] });
      continue;
    }
    const section = sections.at(-1);
    if (!section) throw new Error(`${file}:${i + 1}: a page link comes before any section`);
    const target = libraryPath(item[2]!, file);
    if (!target) throw new Error(`${file}:${i + 1}: "${item[2]}" is not a document of the library`);
    const slug = kebab(item[1]!);
    const other = seen.get(slug);
    if (other) throw new Error(`${file}:${i + 1}: the slug "${slug}" is also used on line ${other}`);
    seen.set(slug, i + 1);
    section.pages.push({ title: item[1]!, slug, file: target, line: i + 1 });
  }
  return sections;
}

interface Block {
  lang: string;
  body: string;
}

/** The document's lines outside code fences, and its fenced blocks with their language. */
function splitFences(markdown: string): { prose: string[]; blocks: Block[] } {
  const prose: string[] = [];
  const blocks: Block[] = [];
  let fence: { marker: string; lang: string; lines: string[] } | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (fence) {
      if (line.trim() === fence.marker) {
        blocks.push({ lang: fence.lang, body: fence.lines.join("\n") });
        fence = null;
      } else fence.lines.push(line);
      continue;
    }
    const open = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(line);
    if (open) {
      fence = { marker: open[1]!, lang: open[2]!, lines: [] };
      prose.push("");
      continue;
    }
    prose.push(line);
  }
  return { prose, blocks };
}

/** The only level-1 heading outside code. */
export function documentTitle(markdown: string, file: string): string {
  const titles = splitFences(markdown).prose.filter((l) => /^#\s+\S/.test(l));
  if (titles.length !== 1) throw new Error(`${file}: expected one level-1 heading, found ${titles.length}`);
  return titles[0]!.replace(/^#\s+/, "").trim();
}

/** The first paragraph after the title, as plain text (emphasis markers removed, code kept). */
export function documentDescription(markdown: string): string {
  const { prose } = splitFences(markdown);
  const start = prose.findIndex((l) => /^#\s+\S/.test(l));
  const paragraph: string[] = [];
  for (const raw of prose.slice(start + 1)) {
    const line = raw.trim();
    if (!line || /^<!--.*-->$/.test(line)) {
      if (paragraph.length) break;
      continue;
    }
    if (/^(#|>|[-*|]\s|\|)/.test(line)) break;
    paragraph.push(line);
  }
  return paragraph.join(" ").replace(/(\*\*|__)(.+?)\1/g, "$2");
}

/** Every ```html block (with or without `live`), in order. */
export function htmlExamples(markdown: string): string[] {
  return splitFences(markdown)
    .blocks.filter((b) => b.lang === "html")
    .map((b) => b.body);
}

/** Every distinct `.pui-*` class selector in a stylesheet, sorted. */
export function cssClasses(css: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...new Set([...code.matchAll(/\.(pui-[a-zA-Z0-9_-]+)/g)].map((m) => m[1]!))].sort();
}

interface Manifest {
  name: string;
  version: string;
  exports?: Record<string, unknown>;
}

const CDN = /https:\/\/cdn\.jsdelivr\.net\/npm\/(@chrissgon\/perfectui)@([^/\s"']+)\/([^\s"']+)/g;
const MANAGERS = /^(npm i|npm install|yarn add|pnpm add|bun add)\s+(@chrissgon\/perfectui)\s*$/;

/**
 * Install instructions from the installation document, pinned to the package version: every CDN
 * URL and package-manager command there says `latest` or no version, and the server must never
 * answer with `latest`. Every URL and import is checked against the package's files and exports.
 */
export function buildInstall(markdown: string, manifest: Manifest, packageDir: string, file: string): Install {
  const { version } = manifest;
  const cdn: Partial<Install["cdn"]> = {};
  for (const match of markdown.matchAll(CDN)) {
    const path = match[3]!;
    if (!existsSync(join(packageDir, path))) throw new Error(`${file}: ${match[0]} names ${path}, which is not in ${manifest.name}@${version}`);
    const pinned = `https://cdn.jsdelivr.net/npm/${match[1]}@${version}/${path}`;
    if (path.endsWith(".css")) cdn.stylesheet ??= pinned;
    else if (path.endsWith(".js")) cdn.script ??= pinned;
  }
  if (!cdn.stylesheet || !cdn.script) throw new Error(`${file}: expected a CDN stylesheet and a CDN script`);

  const { blocks } = splitFences(markdown);
  const packageManagers: Record<string, string> = {};
  for (const line of blocks.filter((b) => b.lang === "bash").flatMap((b) => b.body.split("\n"))) {
    const command = MANAGERS.exec(line.trim());
    if (command) packageManagers[command[1]!.split(" ")[0]!] = `${command[1]} ${command[2]}@${version}`;
  }
  const npm = packageManagers.npm;
  if (!npm) throw new Error(`${file}: no npm install command`);

  const imports: string[] = [];
  for (const line of blocks.filter((b) => b.lang === "js").flatMap((b) => b.body.split("\n"))) {
    const statement = /^import\s+"(@chrissgon\/perfectui(?:\/[^"]*)?)";/.exec(line.trim());
    if (!statement || imports.includes(statement[0])) continue;
    const subpath = `.${statement[1]!.slice(manifest.name.length)}`;
    if (!exportsSubpath(manifest, subpath)) throw new Error(`${file}: ${statement[0]} is not an export of ${manifest.name}@${version}`);
    imports.push(statement[0]);
  }
  if (!imports.length) throw new Error(`${file}: no import statement`);

  return { package: manifest.name, version, npm, packageManagers, cdn: { stylesheet: cdn.stylesheet, script: cdn.script }, imports, source: file };
}

function exportsSubpath(manifest: Manifest, subpath: string): boolean {
  const keys = Object.keys(manifest.exports ?? {});
  return keys.some((key) => {
    if (!key.includes("*")) return key === subpath;
    const [head, tail] = key.split("*") as [string, string];
    return subpath.startsWith(head) && subpath.endsWith(tail) && subpath.length > head.length + tail.length;
  });
}

export interface BuildInput {
  library: string;
  packageDir: string;
  /** What the documents came from, recorded in the corpus: a ref, or PERFECTUI_SOURCE. */
  libraryLabel: string;
  integrity?: string | undefined;
}

/** The corpus and the warnings (documents left out of the summary). */
export function buildCorpus({ library, packageDir, libraryLabel, integrity }: BuildInput): { corpus: Corpus; warnings: string[] } {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as Manifest;
  const sections = parseSummary(readFileSync(join(library, "docs/README.md"), "utf8"));
  const components: Entry[] = [];
  let install: Install | undefined;
  for (const section of sections) {
    for (const page of section.pages) {
      const path = join(library, page.file);
      if (!existsSync(path)) throw new Error(`docs/README.md:${page.line}: "${page.file}" does not exist in the library`);
      const markdown = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      const examples = htmlExamples(markdown);
      components.push({
        slug: page.slug,
        title: documentTitle(markdown, page.file),
        section: section.title,
        file: page.file,
        description: documentDescription(markdown),
        markdown,
        examples,
        classes: puiClasses(examples.join("\n")),
      });
      if (page.slug === "installation") install = buildInstall(markdown, manifest, packageDir, page.file);
    }
  }
  if (!install) throw new Error('docs/README.md: the summary has no "Installation" document');

  const listed = new Set(components.map((c) => c.file));
  const warnings = readdirSync(join(library, "docs"))
    .filter((name) => name.endsWith(".md") && name !== "README.md" && !listed.has(`docs/${name}`))
    .map((name) => `docs/${name} is not in the summary of docs/README.md, so it is not in the corpus`);

  const corpus: Corpus = {
    version: manifest.version,
    source: { library: libraryLabel, package: `${manifest.name}@${manifest.version}`, ...(integrity ? { integrity } : {}) },
    install,
    components,
    classes: cssClasses(readFileSync(join(packageDir, "dist/perfectui.css"), "utf8")),
  };
  return { corpus: CorpusSchema.parse(corpus), warnings };
}

const HELP = `Usage: npm run corpus [-- --ref <tag>] [--version <package version>] [--out <file>]

Writes the corpus JSON from the library's documents at <tag> (default ${DEFAULT_REF}) and the
stylesheet of ${PACKAGE_NAME}@<version> (default ${DEFAULT_VERSION}).
Default output: data/corpus-<version>.json. Set PERFECTUI_SOURCE to read a local checkout instead
of the tag (the corpus then records "PERFECTUI_SOURCE" as its library source).`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      ref: { type: "string", default: DEFAULT_REF },
      version: { type: "string", default: DEFAULT_VERSION },
      out: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const library = await resolveLibrary(values.ref);
  const packageDir = await resolvePackage(values.version);
  const libraryLabel = process.env.PERFECTUI_SOURCE ? "PERFECTUI_SOURCE" : values.ref;
  const { corpus, warnings } = buildCorpus({ library, packageDir, libraryLabel, integrity: readPackInfo(packageDir)?.integrity });
  const out = values.out ?? `data/corpus-${corpus.version}.json`;
  writeFileSync(out, `${JSON.stringify(corpus, null, 2)}\n`);
  for (const warning of warnings) console.error(`build-corpus: warning: ${warning}`);
  console.error(`build-corpus: ${out}: ${corpus.components.length} documents, ${corpus.classes.length} classes, from ${libraryLabel} and ${corpus.source.package}`);
  console.log(out);
}

if (process.argv[1]?.endsWith("build-corpus.ts")) {
  main().catch((error: Error) => {
    console.error(`build-corpus: ${error.message}`);
    process.exit(1);
  });
}
