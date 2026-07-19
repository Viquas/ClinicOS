import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG AA contrast floor (§8.5) — asserted, not eyeballed.
 *
 * This exists because the design reference's palette shipped three AA
 * failures on light mode (green at 3.05:1 both as text and as button label,
 * red at 3.91:1). They were invisible by eye on a good monitor and would have
 * been very visible on a ₹10k tablet in a bright room.
 *
 * Parses the real globals.css so the test cannot drift from the shipped
 * tokens — a duplicated palette here would defeat the point.
 */

const CSS = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function extractBlock(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start === -1) throw new Error(`Missing block: ${selector}`);

  const open = CSS.indexOf("{", start);
  const close = CSS.indexOf("\n}", open);
  const body = CSS.slice(open + 1, close);

  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(
    /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    tokens[name] = value;
  }
  return tokens;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);

  const channels = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const AA_NORMAL = 4.5;

describe.each([
  ["light", ":root {"],
  ["dark", ".dark {"],
])("%s mode meets WCAG AA", (_mode, selector) => {
  const t = extractBlock(selector);

  const pairs: [string, string, string][] = [
    ["ink on surface", "--ink", "--surface"],
    ["ink-secondary on surface", "--ink-secondary", "--surface"],
    ["ink-secondary on canvas", "--ink-secondary", "--canvas"],
    ["ink on canvas", "--ink", "--canvas"],
    ["alert on surface", "--alert", "--surface"],
    ["success on surface", "--success", "--surface"],
    ["warning on surface", "--warning", "--surface"],
    ["accent on surface", "--accent", "--surface"],
    /* The filled primary button: white label on the accent fill. */
    ["accent-ink on accent", "--accent-ink", "--accent"],
  ];

  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(t[fg], `missing token ${fg}`).toBeDefined();
    expect(t[bg], `missing token ${bg}`).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("red stays reserved for clinical urgency", () => {
  it("is not reused as the accent in either mode", () => {
    for (const selector of [":root {", ".dark {"]) {
      const t = extractBlock(selector);
      expect(t["--accent"]).not.toBe(t["--alert"]);
    }
  });
});
