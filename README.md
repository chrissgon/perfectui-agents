# perfectui-agents

A read-only [MCP](https://modelcontextprotocol.io) server that gives coding agents the real classes, markup and install instructions of [Perfect UI](https://perfectui.dev) 1.0.0, so they stop inventing `pui-*` classes.

Everything the server answers comes from one file, `data/corpus-1.0.0.json`, generated from the library's documents at the `v1.0.0` tag and from the stylesheet of the published `@chrissgon/perfectui@1.0.0` package. The server never writes, runs or downloads anything, and it makes no network requests.

> **Status:** local development. The package (`@chrissgon/perfectui-mcp`) is not on npm yet, so run it from a checkout as described below.

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

## Run it locally

Requirements: Node.js 20 or later (developed on Node.js 24) and npm.

```bash
git clone <this repository> perfectui-agents
cd perfectui-agents
npm install
npm run build
```

Then add the server to any MCP client that runs local servers over stdio. The server entry is a `command` and its `args`; many clients take it inside an `mcpServers` object like the one below, but check where your client keeps it. Replace the path with your checkout's absolute path:

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

To try it without a client, use the MCP Inspector's command-line mode:

```bash
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/server.js --method tools/call --tool-name get_component --tool-arg name=button
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

The tests call every tool through the MCP SDK client over an in-memory transport, so they exercise the same schemas, validation and errors a real client sees. Design notes on the transport are in `docs/spikes/stdio.md`.

## License

MIT, see `LICENSE`. `data/corpus-1.0.0.json` contains the Perfect UI documentation, also MIT, copyright Christopher Gonçalves. The summary parser in `scripts/build-corpus.ts` is adapted from [perfectui-doc](https://github.com/chrissgon/perfectui-doc) (MIT), so slugs match the documentation site.
