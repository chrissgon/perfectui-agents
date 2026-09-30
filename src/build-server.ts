/**
 * The Perfect UI MCP server without a transport (T-pua-8, T-pua-15): five read-only tools over a
 * corpus. `server.ts` connects it to stdio; a host connects it to any other transport, for example a
 * new stateless Streamable HTTP transport per request.
 */
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Corpus } from "./corpus.js";
import { registerCatalog } from "./tools/catalog.js";
import { registerCheckMarkup } from "./tools/check-markup.js";
import { registerSearch } from "./tools/search.js";

/** This package's version, as the server reports it to clients. */
export const PACKAGE_VERSION = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

/** The instructions the server sends to clients on initialize. */
export const instructions = (version: string) =>
  `Read-only. Answers only about Perfect UI ${version}; never invent classes: call check_markup before returning markup.`;

/** The tools every server from `buildServer` lists, in the order it lists them. */
export const TOOL_NAMES = ["get_install", "list_components", "get_component", "search_docs", "check_markup"] as const;

/** A new server with the five read-only tools over `corpus`, not yet connected to a transport. */
export function buildServer(corpus: Corpus): McpServer {
  const server = new McpServer({ name: "perfectui", version: PACKAGE_VERSION }, { instructions: instructions(corpus.version) });
  registerCatalog(server, corpus);
  registerSearch(server, corpus);
  registerCheckMarkup(server, corpus);
  return server;
}
