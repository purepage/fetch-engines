import { describe, it, expect, vi } from "vitest";
import { MarkdownConverter } from "../src/utils/markdown-converter.js";

describe("MarkdownConverter", () => {
  it("converts tables without explicit header rows to GFM with promoted headers", () => {
    const html = `<table>
<tbody>
<tr>
<td><strong>Position</strong></td>
<td><strong>Weekly Pay Rate</strong></td>
<td><strong>Plus 16% Superannuation</strong></td>
<td><strong>Total Weekly Remuneration*</strong></td>
</tr>
<tr>
<td>Apprentice - under 18 years^</td>
<td>$722.16</td>
<td>$115.55</td>
<td>$837.71</td>
</tr>
</tbody>
</table>`;
    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);
    // Should not preserve raw HTML table anymore
    expect(markdown).not.toContain("<table>");
    // Should include a GFM table header row
    expect(markdown).toContain("| **Position** | **Weekly Pay Rate**");
    // Should include data row content
    expect(markdown).toContain("Apprentice - under 18 years^");
  });

  it("does not warn about missing element.matches when scoring elements", () => {
    const html = `<div><p>Content</p></div>`;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const converter = new MarkdownConverter();
    converter.convert(html);
    expect(
      warnSpy.mock.calls.find((c) =>
        c[0]?.toString().includes("Error matching selector in _calculateElementScore"),
      ),
    ).toBeUndefined();
    warnSpy.mockRestore();
  });
});
