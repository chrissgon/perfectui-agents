import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPackInfo, resolveLibrary, resolvePackage, type Download, type Pack } from "../scripts/fetch-library.js";

// T-pua-3: the library and the package resolve offline; the network steps are replaced by fakes.
const LIBRARY = join(import.meta.dirname, "fixtures/library");
const PACKAGE = join(import.meta.dirname, "fixtures/package");

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "fetch-library-"));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

const copyLibrary: Download = async (_ref, into) => cpSync(LIBRARY, into, { recursive: true });
const failingDownload: Download = async () => {
  throw new Error("offline");
};

describe("resolveLibrary", () => {
  it("returns PERFECTUI_SOURCE as it is, without downloading", async () => {
    const download = vi.fn(failingDownload);
    expect(await resolveLibrary("v1.0.0", { source: LIBRARY, cache: work, download })).toBe(LIBRARY);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a PERFECTUI_SOURCE without docs/README.md", async () => {
    await expect(resolveLibrary("v1.0.0", { source: work, cache: work })).rejects.toThrow(
      `PERFECTUI_SOURCE "${work}" has no docs/README.md`,
    );
  });

  it("returns the cached ref without downloading", async () => {
    cpSync(LIBRARY, join(work, "v1.0.0"), { recursive: true });
    const download = vi.fn(failingDownload);
    expect(await resolveLibrary("v1.0.0", { source: undefined, cache: work, download })).toBe(join(work, "v1.0.0"));
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads a missing ref once into the cache", async () => {
    const download = vi.fn(copyLibrary);
    const dir = await resolveLibrary("v1.0.0", { source: undefined, cache: work, download });
    expect(dir).toBe(join(work, "v1.0.0"));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0]?.[0]).toBe("v1.0.0");
    expect(readFileSync(join(dir, "docs/README.md"), "utf8")).toContain("## Summary");
    expect(existsSync(`${dir}.partial`)).toBe(false);
    await resolveLibrary("v1.0.0", { source: undefined, cache: work, download });
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("names the ref and leaves no partial folder when the download fails", async () => {
    await expect(resolveLibrary("v9.9.9", { source: undefined, cache: work, download: failingDownload })).rejects.toThrow(
      'library ref "v9.9.9": offline',
    );
    expect(existsSync(join(work, "v9.9.9"))).toBe(false);
    expect(existsSync(join(work, "v9.9.9.partial"))).toBe(false);
  });

  it("rejects a download that is not the library", async () => {
    const empty: Download = async (_ref, into) => writeFileSync(join(into, "README.md"), "not the library");
    await expect(resolveLibrary("v1.0.0", { source: undefined, cache: work, download: empty })).rejects.toThrow(
      'library ref "v1.0.0": the download has no docs/README.md',
    );
  });
});

describe("resolvePackage", () => {
  const copyPackage: Pack = async (_spec, into) => {
    cpSync(PACKAGE, into, { recursive: true });
    return { integrity: "sha512-fixture", shasum: "fixture" };
  };

  it("packs a missing version once and keeps npm's integrity", async () => {
    const pack = vi.fn(copyPackage);
    const dir = await resolvePackage("1.0.0", { cache: work, pack });
    expect(dir).toBe(join(work, "1.0.0"));
    expect(pack.mock.calls[0]?.[0]).toBe("@chrissgon/perfectui@1.0.0");
    expect(readPackInfo(dir)).toEqual({ integrity: "sha512-fixture", shasum: "fixture" });
    await resolvePackage("1.0.0", { cache: work, pack });
    expect(pack).toHaveBeenCalledTimes(1);
  });

  it("rejects a cached package of another version", async () => {
    mkdirSync(join(work, "1.0.1"), { recursive: true });
    cpSync(PACKAGE, join(work, "1.0.1"), { recursive: true });
    await expect(resolvePackage("1.0.1", { cache: work, pack: copyPackage })).rejects.toThrow(
      "is @chrissgon/perfectui@1.0.0, expected @chrissgon/perfectui@1.0.1",
    );
  });
});
