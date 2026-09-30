import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** A connected SDK client over an in-memory transport (docs/spikes/stdio.md). */
export async function connect(server: McpServer): Promise<Client> {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

/** A client for a bare server with only the tools `register` adds. */
export async function connectWith(register: (server: McpServer) => void): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  register(server);
  return connect(server);
}

export async function call(client: Client, name: string, args: Record<string, unknown>): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

/** The text of a result's first content block. */
export function text(result: CallToolResult): string {
  const [first] = result.content;
  if (first?.type !== "text") throw new Error(`expected text content, got ${first?.type}`);
  return first.text;
}
