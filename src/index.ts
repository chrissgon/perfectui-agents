/**
 * The package's library entry (`import { buildServer, loadCorpus } from "@chrissgon/perfectui-mcp"`).
 * Importing it starts nothing: it neither reads stdin nor opens a transport. The bin
 * (`dist/server.js`) is the stdio server.
 *
 * The package reads its corpus and its package.json from files next to its code, so a bundler must
 * keep it external (installed as a dependency), not inline it.
 */
export { buildServer, instructions, PACKAGE_VERSION, TOOL_NAMES } from "./build-server.js";
export { CORPUS_VERSION, CorpusSchema, DEFAULT_CORPUS, loadCorpus } from "./corpus.js";
export type { ClassMigration, Corpus, Entry, Install, Migration } from "./corpus.js";
