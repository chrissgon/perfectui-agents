#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// T-pua-2 spike: one read-only tool over stdio, to confirm the SDK 1.31.0 imports.
export function buildServer(): McpServer {
  const server = new McpServer({ name: "perfectui", version: "0.1.0" });
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Return pong. Read-only.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ reply: z.literal("pong") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: "text", text: "pong" }], structuredContent: { reply: "pong" as const } }),
  );
  return server;
}

/** True when this file is the process entry (`node dist/server.js` or the package bin), not an import. */
function isEntry(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === fileURLToPath(import.meta.url);
}

if (isEntry()) await buildServer().connect(new StdioServerTransport());
