#!/usr/bin/env node
/**
 * The Perfect UI MCP server (T-pua-8): five read-only tools over the bundled corpus, served on
 * stdio when this file is the process entry (`node dist/server.js`, the package's bin).
 */
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCorpus, type Corpus } from "./corpus.js";
import { registerCatalog } from "./tools/catalog.js";
import { registerCheckMarkup } from "./tools/check-markup.js";
import { registerSearch } from "./tools/search.js";

const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export const instructions = (version: string) =>
  `Read-only. Answers only about Perfect UI ${version}; never invent classes: call check_markup before returning markup.`;

export function buildServer(corpus: Corpus): McpServer {
  const server = new McpServer({ name: "perfectui", version: PACKAGE.version }, { instructions: instructions(corpus.version) });
  registerCatalog(server, corpus);
  registerSearch(server, corpus);
  registerCheckMarkup(server, corpus);
  return server;
}

/** True when this file is the process entry (`node dist/server.js` or the package bin), not an import. */
function isEntry(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url);
}

if (isEntry()) {
  const corpus = loadCorpus();
  await buildServer(corpus).connect(new StdioServerTransport());
  // stdout carries the protocol; diagnostics go to stderr.
  console.error(`perfectui MCP server ${PACKAGE.version}: Perfect UI ${corpus.version}, ${corpus.components.length} documents, stdio`);
}
