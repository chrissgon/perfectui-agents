# Spike: stdio server with the MCP SDK 1.31.0 (T-pua-2)

- Date: 2026-09-30
- Question: which import paths does the rest of the server use, and can the tests run the server in memory instead of spawning it?

## Findings

| Question | Answer | How it was checked |
|----------|--------|--------------------|
| Server class | `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` | `src/server.ts` builds and runs |
| stdio transport | `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` | `npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list` lists `ping` |
| In-memory transport for tests | yes: `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/sdk/inMemory.js`, with `Client` from `@modelcontextprotocol/sdk/client/index.js` | a probe script connected a `Client` to an `McpServer` in one process and called a tool |
| Strict input schemas | `registerTool` accepts a zod object schema (`AnySchema`), not only a raw shape, so `z.object({...}).strict()` rejects unknown keys and the listed JSON Schema carries `"additionalProperties": false` | probe: `{ name: "button", extra: 1 }` → `isError: true`, "Input validation error: ... Unrecognized key: \"extra\"" |
| Invalid enum value | a tool result with `isError: true`, "MCP error -32602: Input validation error: ... Invalid option: expected one of ..." (not a thrown protocol error) | probe |
| Unknown tool | a tool result with `isError: true`, "MCP error -32602: Tool nope not found" | probe |
| Output schema | `outputSchema` (zod object) is listed as JSON Schema and the tool returns `structuredContent` with the same data as its text content | Inspector `tools/list` output |

## Decision

- The server runs over stdio (`dist/server.js`), which is what `npx` and a local MCP client expect; the Streamable HTTP pattern of the personal-site spike stays for the optional remote endpoint (T-pua-15).
- Tests use `InMemoryTransport` with the SDK `Client`, so they exercise the real protocol path (schemas, validation, errors) without spawning processes. End-to-end runs over stdio use the Inspector CLI.
- `src/server.ts` exports `buildServer()` and connects to stdio only when it is the process entry, so tests can import it.
