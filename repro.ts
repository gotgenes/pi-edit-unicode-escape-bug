/**
 * Minimal reproduction for https://github.com/earendil-works/pi/issues/4198
 *
 * The Edit tool fails to match text when the file contains a Unicode escape
 * sequence (e.g. \u2019) but oldText contains the actual Unicode character.
 * They render identically but are different byte sequences.
 *
 * Run with: npm run repro
 *    or:    node --experimental-strip-types repro.ts
 */

import { readFileSync } from "node:fs";
import {
	applyEditsToNormalizedContent,
	normalizeToLF,
	fuzzyFindText,
} from "./node_modules/@earendil-works/pi-coding-agent/dist/core/tools/edit-diff.js";

const fileText = readFileSync("test-file.ts", "utf-8");

// The actual Unicode character U+2019 (RIGHT SINGLE QUOTATION MARK)
const oldText = "crohn\u2019s";

console.log("=== Reproduction for pi issue #4198 ===\n");

console.log("File content:");
console.log("  raw:", JSON.stringify(fileText));

console.log("\noldText (what the agent searches for):");
console.log("  raw:", JSON.stringify(oldText));

// Show the byte-level difference
const fileSliceStart = fileText.indexOf("crohn");
const fileSlice = fileText.slice(fileSliceStart, fileSliceStart + 12);
console.log("\nFile bytes around match area:");
console.log("  hex:", Buffer.from(fileSlice).toString("hex"));
console.log("  text:", fileSlice);

console.log("\noldText bytes:");
console.log("  hex:", Buffer.from(oldText).toString("hex"));
console.log("  text:", oldText);

// Run pi's matching logic
console.log("\n--- Running pi's fuzzyFindText ---");
const exactResult = fuzzyFindText(fileText, oldText);
console.log("Exact match:", exactResult.found && !exactResult.usedFuzzyMatch);
console.log("Fuzzy match:", exactResult.usedFuzzyMatch);
console.log("Overall found:", exactResult.found);

console.log("\n--- Running pi's applyEditsToNormalizedContent ---");
try {
	applyEditsToNormalizedContent(normalizeToLF(fileText), [{ oldText, newText: "test" }], "test-file.ts");
	console.log("SUCCESS (this shouldn't happen)");
} catch (e) {
	console.log("ERROR:", (e as Error).message);
}

// --- Diagnostic: explain the mismatch ---
console.log("\n\n=== Diagnostic: why it failed ===");

const fileAfterCrohn = fileText.slice(fileText.indexOf("crohn") + 5, fileText.indexOf("crohn") + 11);
console.log(`File has (6 chars):  "${fileAfterCrohn}"`);
console.log(`  codepoints: ${[...fileAfterCrohn].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}`);

const oldAfterCrohn = oldText.slice(5);
console.log(`oldText has (1 char): "${oldAfterCrohn}"`);
console.log(`  codepoints: ${[...oldAfterCrohn].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ")}`);

console.log("\nThey LOOK identical when rendered, but the computer sees them as completely different strings.");
console.log("normalizeForFuzzyMatch handles smart quotes — but only when they're actual Unicode chars,");
console.log("not when they're 6-character ASCII escape sequences like \\u2019.");

// --- Proposed detector (from the issue) ---
console.log("\n\n=== Proposed diagnostic detector ===");
function detectEscapeMismatch(fileText: string, oldText: string): string | null {
	const unicodePattern = /[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u00A0\u2002-\u200A\u202F\u205F\u3000]/g;

	let m: RegExpExecArray | null;
	while ((m = unicodePattern.exec(oldText)) !== null) {
		const cp = m[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0");
		const escaped = `\\u${cp}`;
		if (fileText.includes(escaped)) {
			return `Hint: file contains "${escaped}" but oldText has the actual Unicode character "${m[0]}". Try using "${escaped}" in oldText.`;
		}
	}

	const escapePattern = /\\u([0-9A-Fa-f]{4})/g;
	let e: RegExpExecArray | null;
	while ((e = escapePattern.exec(fileText)) !== null) {
		const char = String.fromCodePoint(parseInt(e[1], 16));
		if (oldText.includes(char)) {
			return `Hint: file contains "${e[0]}" but oldText has the actual Unicode character "${char}". Try using "${e[0]}" in oldText.`;
		}
	}

	return null;
}

const hint = detectEscapeMismatch(fileText, oldText);
console.log(hint ?? "No known escape mismatch detected.");

// --- Additional cases from the issue ---
console.log("\n\n=== Additional cases ===");

const cases = [
	{ name: "em-dash (U+2014)", file: "status --\\u2014 active", search: "status --\u2014 active" },
	{ name: "middle dot (U+00B7)", file: "foo \\u00B7 bar", search: "foo \u00B7 bar" },
	{ name: "non-breaking space (U+00A0)", file: "foo \\u00A0 bar", search: "foo \u00A0 bar" },
];

for (const c of cases) {
	console.log(`\n${c.name}:`);
	const result = fuzzyFindText(c.file, c.search);
	console.log(`  file:   "${c.file}"`);
	console.log(`  search: "${c.search}"`);
	console.log(`  found:  ${result.found}`);
	const hint = detectEscapeMismatch(c.file, c.search);
	if (hint) console.log(`  ${hint}`);
}
