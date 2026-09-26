import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for the invisible-scrollbar-thumb bug: the thumb's background read
 * `color-mix(in srgb, var(--ledger-color-text) 40%, transparent)` — a token that never
 * existed, so the declaration was invalid-at-computed-value-time, fell back to transparent,
 * and every scrollbar in every demo rendered invisible while every geometry probe (track
 * rects, display, position) kept passing. A var() that resolves to nothing fails SILENTLY at
 * runtime; this test fails at the first reference.
 *
 * Root-level (not colocated in packages/vue/src): the guard reads the stylesheet through
 * node:fs, and the package tsconfigs deliberately carry `types: []` — no node globals in
 * package sources. The root config has them.
 */
describe("stylesheet tokens", () => {
  // jsdom pages rewrite import.meta.url to a non-file scheme, so the path goes through the
  // process cwd — vitest always runs from the config root (this repo's root).
  const css = readFileSync(`${process.cwd()}/packages/vue/src/styles.css`, "utf8");
  // Strip comments: a token mentioned in prose inside a comment is not a reference.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  const defined = new Set<string>();
  for (const match of withoutComments.matchAll(/(^|[\s{;])(--ledger-[a-z0-9-]+)\s*:/g)) {
    defined.add(match[2]!);
  }

  // Referenced WITHOUT a fallback. A var() that carries a fallback (the public CSS-variable
  // API and the component-injected runtime vars — cell paddings, column widths…) is
  // deliberately optional: it degrades to its fallback when nobody sets it. A var() with NO
  // fallback and no definition anywhere computes to nothing — the declaration silently falls
  // back to the property's initial value, which is how the scrollbar thumb went transparent.
  const noFallback = new Set<string>();
  for (const match of withoutComments.matchAll(/var\(\s*(--ledger-[a-z0-9-]+)\s*\)/g)) {
    noFallback.add(match[1]!);
  }

  // The one deliberate no-fallback var: the documented root-level type scale. Unset, an
  // invalid font-size simply inherits — the optional-by-contract behavior.
  const deliberate = new Set(["--ledger-font-size"]);

  it("defines every fallback-less ledger token the stylesheet references", () => {
    const missing = [...noFallback].filter(token => !defined.has(token) && !deliberate.has(token));

    expect(missing, "var() references without fallback, definition, or deliberate allowance").toEqual([]);
  });

  it("references at least the scrollbar thumb token (the invisible-thumb regression)", () => {
    expect(defined.has("--ledger-scrollbar-thumb")).toBe(true);
    expect(withoutComments.includes("var(--ledger-scrollbar-thumb)")).toBe(true);
  });
});
