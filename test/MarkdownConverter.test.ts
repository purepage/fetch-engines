import { describe, it, expect } from "vitest";
import { MarkdownConverter } from "../src/utils/markdown-converter.js";

describe("MarkdownConverter", () => {
  it("retains tables without explicit header rows", () => {
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
    expect(markdown).toContain("<table>");
    expect(markdown).toContain("Apprentice - under 18 years^");
  });
});
