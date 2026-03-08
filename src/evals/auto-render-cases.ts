export type AutoRenderEvalCategory = "spa" | "static";

export type AutoRenderEvalArchetype =
  | "docs"
  | "government"
  | "knowledge"
  | "marketing"
  | "commerce"
  | "static-baseline"
  | "access-guarded";

export interface AutoRenderEvalCase {
  name: string;
  url: string;
  category: AutoRenderEvalCategory;
  archetype: AutoRenderEvalArchetype;
  requiredAny: string[];
  minTextLength: number;
  gate?: boolean;
  baselineOptional?: boolean;
}

export const AUTO_RENDER_MIN_GATED_PASS_RATE = 0.8;
export const AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE = 1;
export const AUTO_RENDER_MIN_GATED_SPA_PASS_RATE = 0.5;

export const AUTO_RENDER_EVAL_CASES: AutoRenderEvalCase[] = [
  {
    name: "Fanatico release page (known-hard SPA)",
    url: "https://store.fanatico.au/release/4651760/romar-harmonie-ephemere-ep",
    category: "spa",
    archetype: "commerce",
    requiredAny: ["romar", "harmonie", "fanatico"],
    minTextLength: 80,
    gate: false,
  },
  {
    name: "OpenAI home page",
    url: "https://openai.com/",
    category: "spa",
    archetype: "marketing",
    requiredAny: ["openai", "chatgpt", "research"],
    minTextLength: 120,
  },
  {
    name: "Apple AU home page",
    url: "https://www.apple.com/au/",
    category: "spa",
    archetype: "marketing",
    requiredAny: ["apple", "iphone", "mac"],
    minTextLength: 250,
  },
  {
    name: "GitHub Copilot landing page",
    url: "https://github.com/features/copilot",
    category: "spa",
    archetype: "marketing",
    requiredAny: ["github copilot", "developer", "code"],
    minTextLength: 500,
  },
  {
    name: "Tailwind CSS installation docs",
    url: "https://tailwindcss.com/docs/installation/using-vite",
    category: "spa",
    archetype: "docs",
    requiredAny: ["tailwind", "vite", "install"],
    minTextLength: 300,
  },
  {
    name: "Docusaurus introduction docs",
    url: "https://docusaurus.io/docs",
    category: "spa",
    archetype: "docs",
    requiredAny: ["docusaurus", "documentation", "tutorial"],
    minTextLength: 500,
  },
  {
    name: "React Router routing docs",
    url: "https://reactrouter.com/start/framework/routing",
    category: "spa",
    archetype: "docs",
    requiredAny: ["route", "routing", "loader"],
    minTextLength: 400,
  },
  {
    name: "Rebuilt product page (chrome-heavy SPA)",
    url: "https://rebuilt.eco/product/2fd68bae-5cc7-41f0-bb30-bc67f3f6f740",
    category: "spa",
    archetype: "commerce",
    requiredAny: ["primed flatsheets", "weathertex", "carbon"],
    minTextLength: 180,
    gate: false,
  },
  {
    name: "Essential Energy career page (403 to browser fallback)",
    url: "https://www.essentialenergy.com.au/careers/powerline-worker-apprenticeship",
    category: "spa",
    archetype: "access-guarded",
    requiredAny: ["apprenticeship", "powerline", "essential energy"],
    minTextLength: 120,
    gate: false,
    baselineOptional: true,
  },
  {
    name: "Example domain",
    url: "https://example.com/",
    category: "static",
    archetype: "static-baseline",
    requiredAny: ["example domain"],
    minTextLength: 40,
    gate: false,
  },
  {
    name: "httpbin HTML demo",
    url: "https://httpbin.org/html",
    category: "static",
    archetype: "static-baseline",
    requiredAny: ["herman", "moby-dick", "availing himself"],
    minTextLength: 80,
    gate: false,
  },
  {
    name: "IANA reserved domains",
    url: "https://www.iana.org/domains/reserved",
    category: "static",
    archetype: "knowledge",
    requiredAny: ["iana", "example domains"],
    minTextLength: 150,
  },
  {
    name: "MDN Array.map reference",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map",
    category: "static",
    archetype: "docs",
    requiredAny: ["array.prototype.map", "syntax", "examples"],
    minTextLength: 1000,
  },
  {
    name: "Requests quickstart docs",
    url: "https://requests.readthedocs.io/en/latest/user/quickstart/",
    category: "static",
    archetype: "docs",
    requiredAny: ["quickstart", "requests", "headers"],
    minTextLength: 1200,
  },
  {
    name: "Vite getting started guide",
    url: "https://vite.dev/guide/",
    category: "static",
    archetype: "docs",
    requiredAny: ["vite", "getting started", "install"],
    minTextLength: 800,
  },
  {
    name: "Python tutorial index",
    url: "https://docs.python.org/3/tutorial/index.html",
    category: "static",
    archetype: "docs",
    requiredAny: ["python tutorial", "whetting your appetite", "interpreter"],
    minTextLength: 500,
  },
  {
    name: "Wikipedia web scraping article",
    url: "https://en.wikipedia.org/wiki/Web_scraping",
    category: "static",
    archetype: "knowledge",
    requiredAny: ["web scraping", "history", "techniques"],
    minTextLength: 2000,
  },
  {
    name: "DVA pension rates page",
    url: "https://www.dva.gov.au/access-benefits/payment-rates/summary-of-vea-pension-rates-limits-and-allowances",
    category: "static",
    archetype: "government",
    requiredAny: ["vea", "pension", "allowances"],
    minTextLength: 1000,
  },
  {
    name: "USAGov benefits page",
    url: "https://www.usa.gov/benefits",
    category: "static",
    archetype: "government",
    requiredAny: ["government benefits", "benefits", "financial help"],
    minTextLength: 250,
  },
];
