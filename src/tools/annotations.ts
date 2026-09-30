import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/** Every tool of this server: it only reads the bundled corpus (same hints as the personal site's ADR-0004). */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
