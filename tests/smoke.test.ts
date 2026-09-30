import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import MiniSearch from "minisearch";
import { z } from "zod";

// T-pua-1: the pinned runtime dependencies load under the project's ESM settings.
describe("smoke", () => {
  it("loads the MCP SDK, zod and MiniSearch", () => {
    const server = new McpServer({ name: "smoke", version: "0.0.0" });
    expect(server).toBeInstanceOf(McpServer);
    expect(z.string().parse("pui-btn")).toBe("pui-btn");
    const index = new MiniSearch({ fields: ["text"] });
    index.add({ id: 1, text: "button" });
    expect(index.search("button").map((r) => r.id)).toEqual([1]);
  });
});
