# Minimal reproduction for pi issue #4198

**Issue:** <https://github.com/earendil-works/pi/issues/4198>

## Problem

Pi's Edit tool fails with a generic "Could not find the exact text" error when:

- The **file** contains a Unicode escape sequence like `\u2019` (6 ASCII characters)
- The Edit tool's **oldText** contains the actual Unicode character (e.g. `'` U+2019)

They render identically on screen but are completely different byte sequences, so string
matching fails. The error message gives no hint that this Unicode escape vs. literal
mismatch is the root cause.

## Files

- `test-file.ts` — A file containing the literal escape `\u2019`
- `repro.ts` — Reproduction script that imports pi's actual `edit-diff.ts` and demonstrates the failure

## Run

```bash
node --experimental-strip-types repro.ts
```

Requires Node.js v24+ (uses `--experimental-strip-types` to run TypeScript directly).

## Expected output

The script shows:

1. **Byte-level difference** between the file's `\u2019` (6 ASCII chars) and the search's `'` (actual U+2019)
2. **Pi's `fuzzyFindText` returning `found: false`** — neither exact nor fuzzy match succeeds
3. **The generic error message** from `applyEditsToNormalizedContent`
4. **A proposed diagnostic detector** that correctly identifies the mismatch and suggests using `\u2019` in `oldText`
5. **Additional cases** for em-dash (U+2014), middle dot (U+00B7), and non-breaking space (U+00A0)

---

## Is this the LLM's fault?

### What actually happens

After pi's `normalizeForFuzzyMatch`:

| | File content | oldText |
|---|---|---|
| Raw | `crohn\u2019s` | `crohn's` |
| After normalization | `crohn\u2019s` (unchanged!) | `crohn's` |
| Match? | **No** | |

The regex only matches *actual Unicode characters*, not ASCII escape sequences. The file's `\u2019` passes through untouched.

### Why the tool bears responsibility

**1. The tool already handles similar cases.**

Pi added fuzzy matching (PR #713) specifically to handle "looks the same, different bytes": smart quotes, em-dashes, non-breaking spaces, and trailing whitespace. A `\u2019` escape sequence is the same category — just an unhandled edge case.

**2. The error message is actively harmful.**

> "Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines."

This tells the LLM nothing actionable. It doesn't say "your text looks similar but uses a different encoding" or "try `\u2019` instead of `'`".

**3. The LLM may be reasoning about semantics, not raw bytes.**

In `const x = 'crohn\u2019s'`, the escape sequence evaluates at runtime to U+2019. The LLM may be operating on the *semantic value* of the code rather than its raw source representation. The tool operates at the raw byte level.

### The fair counter-argument

If you handle `\u2019`, what about `\xE2\x80\x99`, `&#8217;`, `\u{2019}`, `&rsquo;`, or language-specific escapes? Fair concern — but it doesn't justify the error message being useless. Even if auto-matching is too risky, the error message can still mention common causes.

### Concrete options

**Option A: Mention common failure modes in the error message (zero effort, zero risk)**

Change the error string to mention common causes:

> "Could not find the exact text in ${path}. The old text must match exactly. Common causes include Unicode escape sequences in the file (e.g., `\u2019`) vs. the actual Unicode character in oldText, or whitespace/newline mismatches. Re-read the file and ensure oldText uses the exact characters as they appear in the source."

No new logic — just a better string literal. The LLM reads the hint, re-reads the file, and self-corrects.

**Option B: Dynamic escape-mismatch detection in error messages (low effort, low risk)**

When `fuzzyFindText` fails, check whether the file contains escape sequences (`\uXXXX`, `\u{XXXX}`) that correspond to Unicode characters in `oldText` and append a targeted hint. See the `detectEscapeMismatch` function in the reproduction script.

**Option C: Extend fuzzy matching with an escape-aware tier (medium effort, low risk)**

Add a third tier to `fuzzyFindText`:
1. Exact match
2. Existing fuzzy match (Unicode chars → ASCII)
3. **Escape-aware fuzzy match**: interpret common escape sequences in file content before applying normalizations

This only activates when both previous tiers fail, so it only helps cases that currently error.

**Option D: Pre-normalize escape sequences (medium effort, medium risk)**

Convert `\uXXXX` sequences to their actual characters inside `normalizeForFuzzyMatch`. This is more aggressive — it would affect all fuzzy matching — but it aligns with the existing normalization philosophy.

### Bottom line

| Claim | Verdict |
|---|---|
| "The LLM used the wrong representation" | **True** — the LLM emitted a literal U+2019 instead of `\u2019` |
| "The tool can't do anything about this" | **False** — even just mentioning common failure modes in the error string would help |
| "It's purely an LLM problem" | **Incomplete** — the error message gives zero signal, and the matching layer has an obvious gap |

Option A is a one-line change that addresses the immediate problem.
