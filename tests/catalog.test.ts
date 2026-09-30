import { beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { loadCorpus } from "../src/corpus.js";
import { registerCatalog } from "../src/tools/catalog.js";
import { call, connectWith, text } from "./helpers/connect.js";

// T-pua-5 (AC-1, AC-2): the three catalog tools through the SDK client, over the committed corpus.
const corpus = loadCorpus();
let client: Client;
beforeAll(async () => {
  client = await connectWith((server) => registerCatalog(server, corpus));
});

describe("get_install", () => {
  it("returns the install instructions pinned to 1.0.0, never latest", async () => {
    const result = await call(client, "get_install", {});
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(corpus.install);
    expect(result.structuredContent).toMatchObject({
      npm: "npm i @chrissgon/perfectui@1.0.0",
      cdn: { stylesheet: "https://cdn.jsdelivr.net/npm/@chrissgon/perfectui@1.0.0/dist/perfectui.css" },
    });
    expect(text(result)).not.toContain("latest");
    expect(JSON.parse(text(result))).toEqual(corpus.install);
  });

  it("rejects an argument it does not take", async () => {
    const result = await call(client, "get_install", { version: "latest" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Unrecognized key: "version"');
  });
});

describe("list_components", () => {
  it("lists every document in the documentation's order", async () => {
    const result = await call(client, "list_components", {});
    const listed = (result.structuredContent as { components: { slug: string; section: string }[] }).components;
    expect(listed.map((c) => c.slug)).toEqual(corpus.components.map((c) => c.slug));
    expect(listed).toHaveLength(28);
    expect(listed.find((c) => c.slug === "modal")).toEqual({
      slug: "modal",
      title: "Modal",
      section: "Components",
      description: "Built on `<dialog>`. The browser handles the top layer, the backdrop, focus trapping and the escape key.",
    });
    expect(text(result).split("\n")).toHaveLength(28);
  });
});

describe("get_component", () => {
  it("returns the button document's Markdown, examples and classes", async () => {
    const result = await call(client, "get_component", { name: "button" });
    const button = corpus.components.find((c) => c.slug === "button")!;
    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe(button.markdown);
    expect(text(result)).toContain("# Button");
    expect(result.structuredContent).toMatchObject({ slug: "button", title: "Button", version: "1.0.0", file: "docs/button.md" });
    expect((result.structuredContent as { classes: string[] }).classes).toContain("pui-btn");
  });

  it("rejects a name that is not a document with a validation error", async () => {
    const result = await call(client, "get_component", { name: "foo" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Input validation error");
    expect(text(result)).toContain("Invalid option");
  });

  it("rejects an extra argument", async () => {
    const result = await call(client, "get_component", { name: "button", version: "0.23.0" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Unrecognized key: "version"');
  });

  it("rejects a missing name", async () => {
    const result = await call(client, "get_component", {});
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Input validation error");
  });
});

describe("tools/list", () => {
  it("lists the three tools as read-only with strict inputs and output schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_component", "get_install", "list_components"]);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.outputSchema).toBeDefined();
    }
    const getComponent = tools.find((t) => t.name === "get_component")!;
    expect((getComponent.inputSchema.properties as { name: { enum: string[] } }).name.enum).toEqual(corpus.components.map((c) => c.slug));
  });
});
