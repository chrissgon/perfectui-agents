/** get_install, list_components and get_component (T-pua-5): the corpus, served as it is. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EntrySchema, InstallSchema, type Corpus } from "../corpus.js";
import { READ_ONLY } from "./annotations.js";

const ListItemSchema = EntrySchema.pick({ slug: true, title: true, section: true, description: true });

export function registerCatalog(server: McpServer, corpus: Corpus): void {
  const slugs = corpus.components.map((c) => c.slug) as [string, ...string[]];
  const bySlug = new Map(corpus.components.map((c) => [c.slug, c]));

  server.registerTool(
    "get_install",
    {
      title: "Get install instructions",
      description:
        `How to install Perfect UI ${corpus.version}: the npm command and the other package managers' commands, the CDN stylesheet and ` +
        "script URLs and the import statements, all pinned to this version, from the library's installation document " +
        "(get_component with name installation explains when the script is needed).",
      inputSchema: z.object({}).strict(),
      outputSchema: InstallSchema,
      annotations: READ_ONLY,
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(corpus.install, null, 2) }],
      structuredContent: corpus.install,
    }),
  );

  server.registerTool(
    "list_components",
    {
      title: "List documents",
      description:
        `Every document of Perfect UI ${corpus.version}, in the documentation's order: components, forms, layout, ` +
        "customization and guides, each with its slug (the name get_component takes), title, section and one-line description.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ version: z.string(), components: z.array(ListItemSchema) }).strict(),
      annotations: READ_ONLY,
    },
    async () => {
      const components = corpus.components.map(({ slug, title, section, description }) => ({ slug, title, section, description }));
      const text = components.map((c) => `${c.slug} (${c.section}): ${c.description}`).join("\n");
      return { content: [{ type: "text", text }], structuredContent: { version: corpus.version, components } };
    },
  );

  server.registerTool(
    "get_component",
    {
      title: "Get a document",
      description:
        `The full Markdown of one Perfect UI ${corpus.version} document, with its HTML examples and the pui-* classes they use. ` +
        "Copy markup from the examples instead of writing classes from memory. Names come from list_components.",
      inputSchema: z
        .object({ name: z.enum(slugs).describe("document slug, for example button, modal or dark-mode") })
        .strict(),
      outputSchema: EntrySchema.extend({ version: z.string() }).strict(),
      annotations: READ_ONLY,
    },
    async ({ name }) => {
      // The schema restricts `name` to the corpus slugs, so the entry exists.
      const entry = bySlug.get(name)!;
      return { content: [{ type: "text", text: entry.markdown }], structuredContent: { ...entry, version: corpus.version } };
    },
  );
}
