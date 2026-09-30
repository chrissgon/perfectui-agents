#!/usr/bin/env python3
"""Redact secrets from a line of text before it is printed, stored or quoted.

Usage: python3 redact.py [--secret-line] < text      (one line of output per line of input)

The one list of credential formats shared by scripts/security_scan.py and the skill scripts that
quote code (skills/eng-code-review/scripts/change_scope.py keeps a byte-identical copy next to it,
because a skill is installed on its own; scripts/tests checks that the copies match).

  redact(text)            known token formats become "<redacted LABEL>", a credential-like name's
                          literal value and the password in a URL become "<redacted>", invisible
                          characters become "<U+XXXX>"; cut to 160 characters. No part of a secret
                          is kept, not even a prefix.
  mask_secret_line(text)  redact(), then every quoted literal of 8+ characters and every unbroken
                          run of 16+ key-like characters also becomes "<redacted>". For a line a
                          detector already suspects of holding a secret in a format this list
                          does not know.
  token_label(text)       the label of the first known token format in text, or None.

--secret-line applies mask_secret_line instead of redact. Exit codes: 0 ok, 2 usage error.
"""
import re
import sys

TOKEN_PATTERNS = [
    ("AWS access key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("GitHub token", r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    ("GitHub fine-grained token", r"\bgithub_pat_[A-Za-z0-9_]{50,}\b"),
    ("Slack token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    ("model API key", r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}"),
    ("Google API key", r"\bAIza[0-9A-Za-z_-]{35}\b"),
    ("npm token", r"\bnpm_[A-Za-z0-9]{36}\b"),
    ("Stripe key", r"\b[rsp]k_(?:live|test)_[0-9A-Za-z]{16,}"),
    ("Netlify personal access token", r"\bnfp_[A-Za-z0-9]{32,}\b"),
    ("private key block", r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----"),
    ("JWT", r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
]
TOKEN_RES = [(label, re.compile(p)) for label, p in TOKEN_PATTERNS]
# A credential-like name (one ending in api_key, secret, token, password or private/access key, or an
# upper-case constant ending in _KEY such as STRIPE_KEY) assigned a literal of 12+ characters with a
# digit in it (words and identifiers are not secrets) that is not a URL.
ASSIGN_RE = re.compile(
    r"\b((?i:[A-Za-z0-9_-]*?(?:api[_-]?key|secret|token|password|passwd|private[_-]?key|access[_-]?key))"
    r"|[A-Z][A-Z0-9_]*_KEY)"
    r"\b[\"']?\s*[:=]\s*[\"']([^\"'\s]{12,})[\"']")
URL_CREDENTIAL_RE = re.compile(r"(\b[a-z][a-z0-9+.-]*://[^/\s:@]+):[^/\s@]+@")
HIDDEN_RANGES = [(0x200B, 0x200F), (0x202A, 0x202E), (0x2060, 0x2064), (0x2066, 0x2069), (0xFEFF, 0xFEFF),
                 (0xE0000, 0xE007F)]
HIDDEN_RE = re.compile("[" + "".join(f"{chr(a)}-{chr(b)}" for a, b in HIDDEN_RANGES) + "]")
QUOTED_RE = re.compile(r"([\"'`])(?!<redacted)[^\"'`\n]{8,}\1")
LONG_RUN_RE = re.compile(r"(?<![A-Za-z0-9<])[A-Za-z0-9_+/=.-]{16,}")
LIMIT = 160


def token_label(text):
    for label, rx in TOKEN_RES:
        if rx.search(text):
            return label
    return None


def redact(text, limit=LIMIT):
    for label, rx in TOKEN_RES:
        text = rx.sub(f"<redacted {label}>", text)
    text = ASSIGN_RE.sub(lambda m: m.group(0).replace(m.group(2), "<redacted>"), text)
    text = URL_CREDENTIAL_RE.sub(r"\1:<redacted>@", text)
    return HIDDEN_RE.sub(lambda m: f"<U+{ord(m.group(0)):04X}>", text).strip()[:limit]


def mask_secret_line(text, limit=LIMIT):
    # Mask on the whole line first, then cut, so a secret that straddles the limit is never half kept.
    text = redact(text, limit=len(text) + 64)
    text = QUOTED_RE.sub(lambda m: f"{m.group(1)}<redacted>{m.group(1)}", text)
    text = LONG_RUN_RE.sub("<redacted>", text)
    return text[:limit]


def main(argv):
    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return 0
    unknown = [a for a in argv if a != "--secret-line"]
    if unknown:
        print(f"Error: unknown option {unknown[0]!r}. See --help.", file=sys.stderr)
        return 2
    fn = mask_secret_line if "--secret-line" in argv else redact
    for line in sys.stdin:
        print(fn(line.rstrip("\n")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
