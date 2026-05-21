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

A common reaction to this issue is that the LLM is at fault — it "should have known" the file contains `\u2019` and used that exact sequence in `oldText`. This section argues that framing is incomplete, and that the tool itself has both the precedent and the capability to handle this better.

### What actually happens

The file contains the six ASCII characters `\u2019`. The LLM's `oldText` contains one actual Unicode character U+2019. After pi's existing `normalizeForFuzzyMatch`:

| | File content | oldText |
|---|---|---|
| Raw | `crohn\u2019s` | `crohn's` |
| After normalization | `crohn\u2019s` (unchanged!) | `crohn's` |
| Match? | **No** | |

The regex `.replace(/[\u2018\u2019\u201A\u201B]/g, "'")` only matches *actual Unicode characters*, not ASCII escape sequences. So the file's `\u2019` passes through untouched, while the oldText `'` is unchanged (already ASCII). They never align.

### Why the tool bears responsibility

**1. The tool already committed to this philosophy.**

Pi added fuzzy matching (PR #713) specifically to handle "looks the same, different bytes": smart quotes, em-dashes, non-breaking spaces, and trailing whitespace. The goal was explicitly to forgive "minor formatting differences." A `\u2019` escape sequence producing a right single quotation mark is the *same category* of problem — just an unhandled edge case in the normalization layer.

**2. The error message is actively harmful.**

> "Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines."

This tells the LLM nothing actionable. It doesn't say "your text looks similar but uses a different encoding" or "try `\u2019` instead of `'`". The LLM receives this, has no signal about what went wrong, and may retry with equally wrong variations. The reproduction's `detectEscapeMismatch` function proves that a precise, helpful hint can be generated automatically.

**3. The LLM may be reasoning about semantics, not raw bytes.**

In `const x = 'crohn\u2019s'`, the escape sequence evaluates at runtime to U+2019. The LLM may be operating on the *semantic value* of the code rather than its raw source representation. The tool operates at the raw byte level. This is an interface mismatch between two layers with different abstractions, not simple LLM sloppiness.

### The fair counter-argument

There is a defensible concern about scope creep: if you handle `\u2019`, what about `\xE2\x80\x99`, `&#8217;`, `\u{2019}`, `&rsquo;`, or language-specific escapes? The tool could become an escape-sequence interpreter for every programming language.

This is a genuine design tension. But it does not justify the error message being useless. Even if auto-matching is deemed too risky, telling the user what actually went wrong is unambiguously the tool's responsibility.

### Concrete options

**Option A: Better error diagnostics (zero risk)**

When `fuzzyFindText` fails, check whether the file contains escape sequences (`\uXXXX`, `\u{XXXX}`) that correspond to Unicode characters in `oldText`. If so, append a specific hint to the error message. This requires no changes to matching logic and carries no risk of incorrect replacements.

**Option B: Extend fuzzy matching with an escape-aware tier (low risk)**

Add a third tier to `fuzzyFindText`:
1. Exact match
2. Existing fuzzy match (Unicode chars → ASCII)
3. **Escape-aware fuzzy match**: interpret common escape sequences in file content before applying normalizations

This only activates when both previous tiers fail, so it only helps cases that currently error.

**Option C: Pre-normalize escape sequences (medium risk)**

Convert `\uXXXX` sequences to their actual characters inside `normalizeForFuzzyMatch`. This is more aggressive — it would affect all fuzzy matching — but it aligns with the existing normalization philosophy.

### Bottom line

| Claim | Verdict |
|---|---|
| "The LLM used the wrong representation" | **True** — the LLM emitted a literal U+2019 instead of `\u2019` |
| "The tool can't do anything about this" | **False** — the tool already handles similar cases, and better diagnostics are trivial to add |
| "It's purely an LLM problem" | **Incomplete** — the error message gives zero signal, and the matching layer has an obvious gap |

The most defensible immediate fix is **Option A**: keep matching strict, but make the error message explain *why* it failed and what to try. This respects the matching logic while eliminating the debugging black hole.
