import { MarkdownConverter } from '../dist/utils/markdown-converter.js';

const c = new MarkdownConverter();
const html = `
<div>
  <h2>Pay</h2>
  <table>
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
      <tr>
        <td>Apprentice - 18 years and over</td>
        <td>$1,437.12</td>
        <td>$229.94</td>
        <td>$1,667.06</td>
      </tr>
    </tbody>
  </table>
</div>
`;

console.log(c.convert(html));
