/**
 * Resolves the two sources of the corpus (T-pua-3):
 *
 * - the library's documents at a fixed ref, the way perfectui-doc's `scripts/sync-docs.ts` does it
 *   (MIT, https://github.com/chrissgon/perfectui-doc): `PERFECTUI_SOURCE` (a local checkout, read
 *   as it is on disk), else `.cache/library/<ref>/`, else one archive download of the ref;
 * - the published npm package (for `dist/perfectui.css`), from `.cache/package/<version>/`, else
 *   `npm pack <name>@<version>` extracted there.
 *
 * Both network steps are injectable so the tests run offline.
 *
 * Usage: npx tsx scripts/fetch-library.ts [--ref v1.0.0] [--package 1.0.0]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

export const LIBRARY_CACHE = ".cache/library";
export const PACKAGE_CACHE = ".cache/package";
export const PACKAGE_NAME = "@chrissgon/perfectui";
export const DEFAULT_REF = "v1.0.0";
export const DEFAULT_VERSION = "1.0.0";
const ARCHIVE = (ref: string) => `https://codeload.github.com/chrissgon/perfectui/tar.gz/${ref}`;

export type Download = (ref: string, into: string) => Promise<void>;
/** Writes the package's files (with `package.json` at the top) into `into`; returns npm's pack metadata when known. */
export type Pack = (spec: string, into: string) => Promise<PackInfo | undefined>;

export interface PackInfo {
  integrity?: string;
  shasum?: string;
}

export interface LibraryOptions {
  source?: string | undefined;
  cache?: string;
  download?: Download;
}

/** A library tree on disk for the ref: the checkout, the cache, or a fresh download into the cache. */
export async function resolveLibrary(
  ref: string,
  { source = process.env.PERFECTUI_SOURCE, cache = LIBRARY_CACHE, download = downloadArchive }: LibraryOptions = {},
): Promise<string> {
  if (source) {
    if (!existsSync(join(source, "docs/README.md"))) throw new Error(`PERFECTUI_SOURCE "${source}" has no docs/README.md`);
    return source;
  }
  const dir = join(cache, ref);
  if (existsSync(join(dir, "docs/README.md"))) return dir;
  await fillAtomically(dir, async (partial) => {
    try {
      await download(ref, partial);
    } catch (error) {
      throw new Error(`library ref "${ref}": ${(error as Error).message}`, { cause: error });
    }
    if (!existsSync(join(partial, "docs/README.md"))) throw new Error(`library ref "${ref}": the download has no docs/README.md`);
  });
  return dir;
}

export interface PackageOptions {
  cache?: string;
  pack?: Pack;
}

/** The published package's files for the version: the cache, or `npm pack` extracted into the cache. */
export async function resolvePackage(
  version: string,
  { cache = PACKAGE_CACHE, pack = npmPack }: PackageOptions = {},
): Promise<string> {
  const dir = join(cache, version);
  if (!existsSync(join(dir, "package.json"))) {
    await fillAtomically(dir, async (partial) => {
      const info = await pack(`${PACKAGE_NAME}@${version}`, partial);
      if (info) writeFileSync(join(partial, ".npm-pack.json"), `${JSON.stringify(info, null, 2)}\n`);
    });
  }
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
  if (manifest.name !== PACKAGE_NAME || manifest.version !== version) {
    throw new Error(`${dir}/package.json is ${manifest.name}@${manifest.version}, expected ${PACKAGE_NAME}@${version}`);
  }
  return dir;
}

/** npm's pack metadata saved next to the package, when the package came from `npm pack`. */
export function readPackInfo(dir: string): PackInfo | undefined {
  const file = join(dir, ".npm-pack.json");
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as PackInfo) : undefined;
}

async function fillAtomically(dir: string, fill: (partial: string) => Promise<void>): Promise<void> {
  const partial = `${dir}.partial`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(partial, { recursive: true });
  try {
    await fill(partial);
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
  rmSync(dir, { recursive: true, force: true });
  renameSync(partial, dir);
}

function untar(file: string, into: string): void {
  const tar = spawnSync("tar", ["-xzf", file, "-C", into, "--strip-components=1"], { encoding: "utf8" });
  if (tar.status !== 0) throw new Error(`could not extract ${file}: ${tar.stderr}`);
}

async function downloadArchive(ref: string, into: string): Promise<void> {
  const response = await fetch(ARCHIVE(ref));
  if (!response.ok) throw new Error(`download failed with HTTP ${response.status} (${ARCHIVE(ref)})`);
  const file = join(into, "archive.tar.gz");
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  untar(file, into);
  rmSync(file);
  console.error(`fetch-library: downloaded ${ARCHIVE(ref)}`);
}

async function npmPack(spec: string, into: string): Promise<PackInfo> {
  const scratch = mkdtempSync(join(tmpdir(), "perfectui-pack-"));
  try {
    const run = spawnSync("npm", ["pack", spec, "--json", "--pack-destination", scratch], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`npm pack ${spec} failed: ${run.stderr}`);
    const [info] = JSON.parse(run.stdout) as { filename: string; integrity?: string; shasum?: string }[];
    if (!info) throw new Error(`npm pack ${spec} printed no result`);
    untar(join(scratch, info.filename), into);
    console.error(`fetch-library: packed ${spec} (${info.integrity ?? "no integrity"})`);
    return { integrity: info.integrity, shasum: info.shasum };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const HELP = `Usage: npx tsx scripts/fetch-library.ts [--ref <tag>] [--package <version>]

Prints the path of the Perfect UI library at <tag> (default ${DEFAULT_REF}) on stdout.
With --package, also resolves ${PACKAGE_NAME}@<version> and prints its path on a second line.

Sources, in order: PERFECTUI_SOURCE (a local checkout), ${LIBRARY_CACHE}/<tag>/, a download of
${ARCHIVE("<tag>")}. The package comes from ${PACKAGE_CACHE}/<version>/ or npm pack.`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { ref: { type: "string", default: DEFAULT_REF }, package: { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  console.log(await resolveLibrary(values.ref));
  if (values.package) console.log(await resolvePackage(values.package));
}

if (process.argv[1]?.endsWith("fetch-library.ts")) {
  main().catch((error: Error) => {
    console.error(`fetch-library: ${error.message}`);
    process.exit(1);
  });
}
