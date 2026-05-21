# Minimal reproduction for pi issue #4198

**Issue:** https://github.com/earendil-works/pi/issues/4198

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
