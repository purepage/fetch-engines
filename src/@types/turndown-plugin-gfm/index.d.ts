declare module "turndown-plugin-gfm" {
  import { Plugin } from "turndown";

  /**
   * GitHub Flavored Markdown plugin for Turndown
   */
  export const gfm: Plugin;

  /**
   * Turndown plugin for GFM Strikethrough
   */
  export function strikethrough(turndownService: any): void;

  /**
   * Turndown plugin for GFM Tables
   */
  export function tables(turndownService: any): void;

  /**
   * Turndown plugin for GFM Task Lists
   */
  export function taskListItems(turndownService: any): void;
}
