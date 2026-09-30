#!/usr/bin/env node
/**
 * The Perfect UI MCP server on stdio (T-pua-8): the package's bin (`node dist/server.js`). The server
 * itself is built in `build-server.ts`, which the library entry (`index.ts`) exports.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, PACKAGE_VERSION } from "./build-server.js";
import { loadCorpus } from "./corpus.js";

export { buildServer, instructions } from "./build-server.js";

/** True when this file is the process entry (`node dist/server.js` or the package bin), not an import. */
function isEntry(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url);
}

if (isEntry()) {
  const corpus = loadCorpus();
  await buildServer(corpus).connect(new StdioServerTransport());
  // stdout carries the protocol; diagnostics go to stderr.
  console.error(`perfectui MCP server ${PACKAGE_VERSION}: Perfect UI ${corpus.version}, ${corpus.components.length} documents, stdio`);
}
