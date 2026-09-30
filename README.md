# perfectui-agents

A read-only [MCP](https://modelcontextprotocol.io) server that gives coding agents the real classes, markup and install instructions of [Perfect UI](https://perfectui.dev) 1.0.0, so they stop inventing `pui-*` classes.

Everything the server answers comes from one file, `data/corpus-1.0.0.json`, generated from the library's documents at the `v1.0.0` tag and from the stylesheet of the published `@chrissgon/perfectui@1.0.0` package. The server never writes, runs or downloads anything, and it makes no network requests.

The npm package is [`@chrissgon/perfectui-mcp`](https://www.npmjs.com/package/@chrissgon/perfectui-mcp).

## Tools

| Tool | Input | Returns |
|------|-------|---------|
| `get_install` | none | The npm command and the other package managers' commands, the CDN stylesheet and script URLs, and the import statements, all pinned to `1.0.0` (never `latest`). |
| `list_components` | none | Every document in the documentation's order (components, forms, layout, customization, guides): slug, title, section and a one-line description. |
| `get_component` | `name`: a slug from `list_components`, for example `button` | The document's full Markdown, its HTML examples and the `pui-*` classes they use. |
| `search_docs` | `query` (1 to 200 characters), `limit` (1 to 10, default 5) | The best matching sections: slug, heading, snippet and score. Prefix matching and one typo from four characters. |
| `check_markup` | `html` (up to 100,000 characters) | Every `pui-*` class in `class` or `className` attributes that Perfect UI 1.0.0 does not define (`kind: "unknown"`), with its line and the closest real class; and every Perfect UI 0.23.0 class that the migration guide renames (`kind: "legacy"`), with the guide's replacement. |

Every tool declares `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` and `openWorldHint: false`, rejects unknown arguments, and returns structured content that matches its output schema.

A typical agent loop: `list_components` or `search_docs` to find the right document, `get_component` to copy its markup, then `check_markup` on the result before handing it over.

```text
check_markup { "html": "<button class=\"pui-button\">Save</button>" }
→ line 1: pui-button → pui-btn (pui-button is not a class of Perfect UI 1.0.0; the Button document (get_component button) uses pui-btn)
```

## Install

Requirements: Node.js 20 or later and npm (the server is developed and tested on Node.js 24).

The server speaks MCP over stdio. An MCP client starts it with `npx`, which downloads the package on first use:

```bash
npx -y @chrissgon/perfectui-mcp
```

Run on its own, it waits for a client on stdin and prints one status line to stderr.

### Client configuration

Many clients take a server as a `command` and its `args` inside an `mcpServers` object like the one below; check where your client keeps it:

```json
{
  "mcpServers": {
    "perfectui": {
      "command": "npx",
      "args": ["-y", "@chrissgon/perfectui-mcp"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add perfectui -- npx -y @chrissgon/perfectui-mcp
```

VS Code (`.vscode/mcp.json` in a workspace):

```json
{
  "servers": {
    "perfectui": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chrissgon/perfectui-mcp"]
    }
  }
}
```

To pin a version, write it in the package name: `@chrissgon/perfectui-mcp@0.2.0`.

To try it without a client, use the MCP Inspector's command-line mode. Leave `-y` out of the server command here: with it, Inspector 2.8.0 fails to start the server (npx still installs the package without asking, because its input is not a terminal).

```bash
npx -y @modelcontextprotocol/inspector --cli npx @chrissgon/perfectui-mcp --method tools/list
npx -y @modelcontextprotocol/inspector --cli npx @chrissgon/perfectui-mcp --method tools/call --tool-name get_component --tool-arg name=button
```

## Use it as a library

From 0.2.0 the package also has a library entry, so a host can serve the same five tools over another transport. `buildServer(corpus)` returns a new `McpServer` (from `@modelcontextprotocol/sdk`) that is not connected yet; `loadCorpus()` reads and validates the bundled corpus. Importing the entry starts nothing. Types ship with the package.

```ts
import { buildServer, loadCorpus } from "@chrissgon/perfectui-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const corpus = loadCorpus(); // once per process

// Stateless Streamable HTTP: a new server and transport for every request.
export async function handle(request: Request): Promise<Response> {
  const server = buildServer(corpus);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}
```

The entry also exports `TOOL_NAMES`, `instructions`, `PACKAGE_VERSION`, `CORPUS_VERSION` and the corpus types. The package reads `data/corpus-1.0.0.json` and its own `package.json` from files next to its code, so keep it external when you bundle (installed in `node_modules`, not inlined). The bin is unchanged: `npx -y @chrissgon/perfectui-mcp` is still the stdio server.

## Run it from a checkout

```bash
git clone https://github.com/chrissgon/perfectui-agents.git
cd perfectui-agents
npm ci
npm run build
```

Then point the client at the built file, with your checkout's absolute path:

```json
{
  "mcpServers": {
    "perfectui": {
      "command": "node",
      "args": ["/absolute/path/to/perfectui-agents/dist/server.js"]
    }
  }
}
```

```bash
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list
```

## Where the data comes from

`npm run corpus` rebuilds `data/corpus-1.0.0.json`:

- **Documents:** one entry per link in the summary of the library's `docs/README.md` at the `v1.0.0` tag (28 documents, including the migration guide). Each entry keeps the document's Markdown as written, its ```` ```html ```` blocks as examples, and the `pui-*` classes those examples use.
- **Classes:** every `.pui-*` selector in `dist/perfectui.css` of the published package (51 classes). The package's npm integrity hash is recorded in the corpus.
- **Class renames:** the tables, diff blocks and "survive as" sentence of the library's `MIGRATION.md` (38 renames from 0.23.0, each checked against the stylesheet). The guide starts at 0.23.0, so classes of older releases (0.7.x, for example) are not recognised; names the guide gives no `pui-*` class for (`dark`, `dropdown-trigger`, `field-group-error`) and the removed utilities are not reported.
- **Install instructions:** read from the installation document and pinned to the package version; every CDN file and import is checked against the package's files and `exports` before it is written.

The library is read from `PERFECTUI_SOURCE` (a local checkout, as it is on disk) when set, else from `.cache/library/v1.0.0/`, else from one download of the tag's archive from GitHub. The package comes from `.cache/package/1.0.0/`, else from `npm pack`. Only this build step uses the network; the server does not.

## Development

| Task | Command |
|------|---------|
| Tests (offline) | `npm test` |
| Type-check source, scripts and tests | `npm run typecheck` |
| Build `dist/` | `npm run build` |
| Rebuild the corpus | `npm run corpus` |
| Start on stdio | `npm start` |
| List what the package ships | `npm pack --dry-run` |
| Count invented classes in saved eval outputs (`evals/cases.json`) | `npx tsx scripts/eval-markup.ts --runs evals/runs/<date>/<model>` |

The tests call every tool through the MCP SDK client over an in-memory transport, so they exercise the same schemas, validation and errors a real client sees. Design notes on the transport are in `docs/spikes/stdio.md`.

## Releases

A release is a tag `v<version>` that matches `package.json`, pushed by the owner. `.github/workflows/publish.yml` then checks that the tag is on `main`, runs the same checks as CI, publishes to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no npm token is stored; npm attaches provenance) and creates the GitHub release. A version with a prerelease suffix (`1.0.0-beta.0`) is published under the `next` dist-tag, never `latest`.

## License

MIT, see `LICENSE`. `data/corpus-1.0.0.json` contains the Perfect UI documentation, also MIT, copyright Christopher Gonçalves. The summary parser in `scripts/build-corpus.ts` is adapted from [perfectui-doc](https://github.com/chrissgon/perfectui-doc) (MIT), so slugs match the documentation site.
