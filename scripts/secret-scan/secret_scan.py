#!/usr/bin/env python3
"""Find credentials committed to a repository, in the working tree or in its whole history.

Usage:
  python3 secret_scan.py [--root DIR] [--json]            files git tracks, plus untracked ones not ignored
  python3 secret_scan.py --history [--root DIR] [--json]  every file version reachable from any ref:
                                                          what a push publishes

Rules:
  secret-token       a known credential format (the list in redact.py, next to this file)
  secret-assignment  a credential-like name (api_key, secret, token, password, *_KEY) assigned a literal
                     of 12+ characters with a digit, which is not a URL or a placeholder
  secret-file        a credential file: .env (not .env.example or .env.sample), id_rsa and other SSH
                     keys, *.pem, *.key, *.p12, *.pfx, *.keystore, *.jks

A finding that is intended (a fake key in a test fixture) is allowed by a line in .secret-scan-allow at
the root: `<path> <rule> -- <reason>`, one file per line, never a folder or a glob.

Each finding also has "kind": "real", or "planted?" when its file sits under a test, fixture, eval or
example folder, and "action", what to tell the user. Anywhere else a credential is treated as real.

Output: one JSON object on stdout (files scanned, findings with path, line, rule and a masked excerpt);
no finding ever carries a secret, not even partially. This file and redact.py are copied into the
project by the workbench skill ops-repo-baseline; keep them together.
Exit codes: 0 no finding, 1 findings, 2 usage error or not a git repository.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from redact import ASSIGN_RE, TOKEN_RES, mask_secret_line  # noqa: E402

PLACEHOLDER_RE = re.compile(r"(?i)^https?://|^\D*$|[<>{}$]|example|sample|placeholder|changeme|your[_-]|xxx|fake|dummy|test|redacted|\*\*\*")
SECRET_FILE_RE = re.compile(r"(^|/)(\.env(\.[^/]*)?|id_rsa|id_dsa|id_ecdsa|id_ed25519|[^/]*\.(pem|key|p12|pfx|keystore|jks))$")
SECRET_FILE_OK_RE = re.compile(r"\.env\.example$|\.env\.sample$")
ALLOW_FILE = ".secret-scan-allow"
ALLOW_LINE_RE = re.compile(r"^(\S+)\s+(secret-token|secret-assignment|secret-file)\s+--\s+(\S.*)$")
SELF = {"secret_scan.py", "redact.py"}
PLANTED_DIRS = {"test", "tests", "__tests__", "spec", "fixtures", "__fixtures__", "testdata", "evals", "examples", "example"}
MAX_BYTES = 2_000_000
GIT_TIMEOUT = 300


def git(root, *args, data=None):
    return subprocess.run(["git", "-C", root, *args], input=data, capture_output=True, timeout=GIT_TIMEOUT)


def load_allow(root):
    allowed, errors = set(), []
    path = os.path.join(root, ALLOW_FILE)
    if not os.path.isfile(path):
        return allowed, errors
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = ALLOW_LINE_RE.match(line)
        if not m or any(ch in m.group(1) for ch in "*?[") or m.group(1).endswith("/"):
            errors.append(f"{ALLOW_FILE}:{n}: expected '<file> <rule> -- <reason>' naming one file")
            continue
        allowed.add((m.group(1), m.group(2)))
    return allowed, errors


def scan_text(rel, text, add):
    for i, line in enumerate(text.split("\n"), 1):
        for label, rx in TOKEN_RES:
            if rx.search(line):
                add(rel, i, "secret-token", f"looks like a {label}", line)
                break
        else:
            m = ASSIGN_RE.search(line)
            if m and not PLACEHOLDER_RE.search(m.group(2)):
                add(rel, i, "secret-assignment", f"'{m.group(1)}' holds a literal value", line)


def scan(root, history):
    allowed, errors = load_allow(root)
    findings, seen = [], set()

    def add(rel, line, rule, message, text=""):
        if (rel.split("@")[0], rule) in allowed or (rel, rule, line) in seen:
            return
        seen.add((rel, rule, line))
        planted = bool(PLANTED_DIRS & set(rel.split("@")[0].split("/")[:-1]))
        findings.append({"path": rel, "line": line, "rule": rule, "message": message,
                         "excerpt": mask_secret_line(text) if text else "",
                         "kind": "planted?" if planted else "real",
                         "action": ("ask the user whether it is a planted test value; allow it in .secret-scan-allow only if so"
                                    if planted else "revoke it with its provider now; it stays in history until the user decides")})

    def check(rel, body, where):
        if os.path.basename(rel) in SELF:
            return
        if SECRET_FILE_RE.search(rel) and not SECRET_FILE_OK_RE.search(rel):
            add(where, 0, "secret-file", "credential file")
        if len(body) > MAX_BYTES or b"\0" in body[:8192]:
            return
        scan_text(where, body.decode("utf-8", errors="replace"), add)

    if history:
        listed = git(root, "rev-list", "--all", "--objects")
        if listed.returncode != 0:
            raise FileNotFoundError(f"{root} is not a git repository")
        paths = {}
        for line in listed.stdout.decode().splitlines():
            sha, _, rel = line.partition(" ")
            if rel and sha not in paths:
                paths[sha] = rel
        out = git(root, "cat-file", "--batch", data="\n".join(paths).encode() + b"\n").stdout
        pos = 0
        while pos < len(out):
            end = out.index(b"\n", pos)
            sha, kind, size = out[pos:end].decode().split(" ")
            body = out[end + 1:end + 1 + int(size)]
            pos = end + 1 + int(size) + 1
            if kind == "blob":
                check(paths[sha], body, f"{paths[sha]}@{sha[:10]}")
        return len(paths), findings, errors
    listed = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard")
    if listed.returncode != 0:
        raise FileNotFoundError(f"{root} is not a git repository")
    files = [f for f in listed.stdout.decode().split("\0") if f]
    for rel in files:
        path = os.path.join(root, rel)
        if os.path.isfile(path) and not os.path.islink(path):
            with open(path, "rb") as fh:
                check(rel, fh.read(MAX_BYTES + 1), rel)
    return len(files), findings, errors


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return 0
    root, history, as_json, i = ".", False, False, 0
    while i < len(argv):
        a = argv[i]
        if a == "--root" and i + 1 < len(argv):
            root, i = argv[i + 1], i + 2
            continue
        if a == "--history":
            history = True
        elif a == "--json":
            as_json = True
        else:
            print(f"error: unknown option {a!r}; see --help", file=sys.stderr)
            return 2
        i += 1
    try:
        count, findings, errors = scan(os.path.abspath(root), history)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    report = {"mode": "history" if history else "tree", "scanned": count, "findings": findings, "allow_errors": errors}
    if as_json:
        print(json.dumps(report, indent=2))
    else:
        for f in findings:
            print(f"{f['path']}:{f['line']}: {f['rule']}: {f['message']}  {f['excerpt']}", file=sys.stderr)
        for e in errors:
            print(e, file=sys.stderr)
        print(json.dumps({"mode": report["mode"], "scanned": count, "findings": len(findings)}))
    return 1 if findings or errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
