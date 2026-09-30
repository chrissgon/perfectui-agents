import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadCorpus } from "../src/corpus.js";
import { buildServer } from "../src/server.js";
import { call, connect, text } from "./helpers/connect.js";

// T-pua-8 (AC-1, AC-2): the assembled server, as a client sees it.
const corpus = loadCorpus();
let client: Client;
beforeAll(async () => {
  client = await connect(buildServer(corpus));
});

describe("buildServer", () => {
  it("lists exactly the five tools, all read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_markup", "get_component", "get_install", "list_components", "search_docs"]);
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.description, tool.name).toContain("Perfect UI 1.0.0");
    }
  });

  it("answers an unknown tool with an error result", async () => {
    const result = await call(client, "delete_everything", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toBe("MCP error -32602: Tool delete_everything not found");
  });

  it("tells the client what it is for", () => {
    expect(client.getInstructions()).toBe(
      "Read-only. Answers only about Perfect UI 1.0.0; never invent classes: call check_markup before returning markup.",
    );
    expect(client.getServerVersion()).toMatchObject({ name: "perfectui", version: "0.1.0" });
  });

  it("serves get_component and check_markup together", async () => {
    const modal = await call(client, "get_component", { name: "modal" });
    const examples = (modal.structuredContent as { examples: string[] }).examples;
    const checked = await call(client, "check_markup", { html: examples.join("\n") });
    expect(checked.structuredContent).toMatchObject({ valid: true, findings: [] });
  });

  it("offers no resources or prompts", async () => {
    expect(client.getServerCapabilities()).toMatchObject({ tools: expect.any(Object) });
    expect(client.getServerCapabilities()?.resources).toBeUndefined();
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
  });
});
