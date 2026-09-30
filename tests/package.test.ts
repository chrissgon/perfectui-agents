import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as entry from "../src/index.js";
import { connect } from "./helpers/connect.js";

// T-pua-15: the library entry (`exports["."]`) that a host such as a Netlify Function imports.
const ROOT = resolve(import.meta.dirname, "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  types: string;
  exports: Record<string, unknown>;
};
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

describe("library entry (source)", () => {
  it("exports buildServer and loadCorpus, and nothing that starts a transport", () => {
    expect(Object.keys(entry).sort()).toEqual(
      ["CORPUS_VERSION", "CorpusSchema", "DEFAULT_CORPUS", "PACKAGE_VERSION", "TOOL_NAMES", "buildServer", "instructions", "loadCorpus"].sort(),
    );
    expect(entry.PACKAGE_VERSION).toBe(PKG.version);
  });

  it("builds a server that lists the five tools, all read-only", async () => {
    const client = await connect(entry.buildServer(entry.loadCorpus()));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...entry.TOOL_NAMES]);
    for (const tool of tools) expect(tool.annotations, tool.name).toEqual(READ_ONLY);
  });

  it("builds an independent server on every call", () => {
    const corpus = entry.loadCorpus();
    expect(entry.buildServer(corpus)).not.toBe(entry.buildServer(corpus));
  });
});

describe("package.json", () => {
  it("keeps the bin and exposes the library entry with its types", () => {
    expect(PKG.bin).toEqual({ "perfectui-mcp": "dist/server.js" });
    expect(PKG.types).toBe("./dist/index.d.ts");
    expect(PKG.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" },
      "./package.json": "./package.json",
    });
  });
});

// The packed tarball, installed where Node resolves it by name: what a consumer gets from npm.
describe("packed package", () => {
  const work = join(ROOT, ".cache", "package-test");
  let files: string[] = [];

  beforeAll(() => {
    rmSync(work, { recursive: true, force: true });
    mkdirSync(join(work, "node_modules", "@chrissgon"), { recursive: true });
    // `npm pack` runs prepack (the build), so dist/ is fresh; --json lists the tarball's files.
    const [pack] = JSON.parse(
      execFileSync("npm", ["pack", "--json", "--pack-destination", work], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    ) as [{ filename: string; files: { path: string }[] }];
    files = pack.files.map((f) => f.path).sort();
    const target = join(work, "node_modules", "@chrissgon", "perfectui-mcp");
    mkdirSync(target);
    execFileSync("tar", ["-xzf", join(work, pack.filename), "-C", target, "--strip-components=1"]);
  }, 120_000);

  it("ships only dist/, data/, README.md, LICENSE and package.json, with the entry's types", () => {
    for (const file of files) expect(file, file).toMatch(/^(dist\/.+\.(js|d\.ts)|data\/corpus-[\d.]+\.json|README\.md|LICENSE|package\.json)$/);
    expect(files).toEqual(expect.arrayContaining(["dist/index.js", "dist/index.d.ts", "dist/server.js", "data/corpus-1.0.0.json"]));
  });

  it("imports by package name in Node and lists the five read-only tools", () => {
    // Run from the work folder: Node resolves the bare name through its node_modules, and the SDK
    // through the repository's node_modules one level up.
    const script = `
      import { buildServer, loadCorpus } from "${PKG.name}";
      import { Client } from "@modelcontextprotocol/sdk/client/index.js";
      import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
      const [a, b] = InMemoryTransport.createLinkedPair();
      await buildServer(loadCorpus()).connect(a);
      const client = new Client({ name: "package-test", version: "0" });
      await client.connect(b);
      const { tools } = await client.listTools();
      console.log(JSON.stringify({ server: client.getServerVersion(), tools: tools.map((t) => [t.name, t.annotations]) }));
      await client.close();
    `;
    const out = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: work, encoding: "utf8" })) as {
      server: { name: string; version: string };
      tools: [string, unknown][];
    };
    expect(out.server).toMatchObject({ name: "perfectui", version: PKG.version });
    expect(out.tools.map(([name]) => name)).toEqual([...entry.TOOL_NAMES]);
    for (const [name, annotations] of out.tools) expect(annotations, name).toEqual(READ_ONLY);
  });
});
