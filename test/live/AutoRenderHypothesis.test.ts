import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { FetchEngine, HybridEngine } from "../../src/index.js";
import { assessHtmlRenderNeed, assessSerializedContent } from "../../src/utils/render-detection.js";

const RUN_LIVE = process.env.LIVE_NETWORK === "1";
const MIN_GATED_PASS_RATE = 0.8;
const MIN_GATED_STATIC_PASS_RATE = 1;
const MIN_GATED_SPA_PASS_RATE = 0.5;

type EvalCategory = "spa" | "static";

interface EvalCase {
  name: string;
  url: string;
  category: EvalCategory;
  requiredAny: string[];
  minTextLength: number;
  gate?: boolean;
}

interface EvalResult {
  name: string;
  url: string;
  category: EvalCategory;
  gate: boolean;
  pass: boolean;
  checks: Record<string, boolean>;
  baselineQualityScore: number;
  hybridQualityScore: number;
  baselineTextLength: number;
  hybridTextLength: number;
  renderLikelyNeeded: boolean;
  error?: string;
}

const EVAL_CASES: EvalCase[] = [
  {
    name: "Fanatico release page (known-hard SPA)",
    url: "https://store.fanatico.au/release/4651760/romar-harmonie-ephemere-ep",
    category: "spa",
    requiredAny: ["romar", "harmonie", "fanatico"],
    minTextLength: 80,
    gate: false,
  },
  {
    name: "OpenAI home page",
    url: "https://openai.com/",
    category: "spa",
    requiredAny: ["openai", "chatgpt", "research"],
    minTextLength: 120,
  },
  {
    name: "Apple AU home page",
    url: "https://www.apple.com/au/",
    category: "spa",
    requiredAny: ["apple", "macbook", "iphone"],
    minTextLength: 250,
  },
  {
    name: "Rebuilt product page (chrome-heavy SPA)",
    url: "https://rebuilt.eco/product/2fd68bae-5cc7-41f0-bb30-bc67f3f6f740",
    category: "spa",
    requiredAny: ["primed flatsheets", "upfront carbon emissions", "weathertex"],
    minTextLength: 180,
    gate: false,
  },
  {
    name: "Example domain",
    url: "https://example.com/",
    category: "static",
    requiredAny: ["example domain"],
    minTextLength: 40,
  },
  {
    name: "httpbin HTML demo",
    url: "https://httpbin.org/html",
    category: "static",
    requiredAny: ["herman", "moby-dick", "availing himself"],
    minTextLength: 80,
  },
  {
    name: "IANA reserved domains",
    url: "https://www.iana.org/domains/reserved",
    category: "static",
    requiredAny: ["iana", "example domains"],
    minTextLength: 150,
  },
];

function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function buildResultLine(result: EvalResult): string {
  const checks = Object.entries(result.checks)
    .map(([name, pass]) => `${name}=${pass ? "ok" : "fail"}`)
    .join(", ");
  const gate = result.gate ? "gate" : "observe";
  const status = result.pass ? "PASS" : "FAIL";
  const scores = `baselineQ=${result.baselineQualityScore}, hybridQ=${result.hybridQualityScore}, baselineText=${result.baselineTextLength}, hybridText=${result.hybridTextLength}`;
  const renderSignal = `renderLikelyNeeded=${result.renderLikelyNeeded}`;
  const error = result.error ? `, error=${result.error}` : "";
  return `${status} [${gate}] ${result.category} :: ${result.name} (${result.url}) :: ${checks} :: ${scores}, ${renderSignal}${error}`;
}

describe.runIf(RUN_LIVE).sequential("Auto render hypothesis", () => {
  let fetchEngine: FetchEngine;
  let hybridEngine: HybridEngine;

  beforeAll(() => {
    fetchEngine = new FetchEngine();
    hybridEngine = new HybridEngine({ markdown: true, maxRetries: 1, useHttpFallback: true });
  });

  afterAll(async () => {
    await fetchEngine.cleanup();
    await hybridEngine.cleanup();
  });

  it("meets quality thresholds across a mixed live URL matrix", async () => {
    const results: EvalResult[] = [];

    for (const evalCase of EVAL_CASES) {
      const gate = evalCase.gate !== false;
      try {
        const baselineHtmlResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: false });
        const baselineMarkdownResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: true });
        const hybridResult = await hybridEngine.fetchHTML(evalCase.url, { markdown: true });

        const renderNeed = assessHtmlRenderNeed(baselineHtmlResult.content);
        const baselineAssessment = assessSerializedContent(
          baselineMarkdownResult.content,
          baselineMarkdownResult.contentType
        );
        const hybridAssessment = assessSerializedContent(hybridResult.content, hybridResult.contentType);
        const keywordHit = includesAny(hybridResult.content, evalCase.requiredAny);

        const checks: Record<string, boolean> = {
          statusCode: hybridResult.statusCode === 200,
          markdownOutput: hybridResult.contentType === "markdown",
          minTextLength: hybridAssessment.textLength >= evalCase.minTextLength,
          keywordHit,
          noStaticRegression:
            evalCase.category === "static"
              ? hybridAssessment.qualityScore >= baselineAssessment.qualityScore - 1
              : true,
          renderNeedHandled: renderNeed.renderLikelyNeeded ? hybridAssessment.textLength >= 80 : true,
        };

        const pass = Object.values(checks).every(Boolean);
        results.push({
          name: evalCase.name,
          url: evalCase.url,
          category: evalCase.category,
          gate,
          pass,
          checks,
          baselineQualityScore: baselineAssessment.qualityScore,
          hybridQualityScore: hybridAssessment.qualityScore,
          baselineTextLength: baselineAssessment.textLength,
          hybridTextLength: hybridAssessment.textLength,
          renderLikelyNeeded: renderNeed.renderLikelyNeeded,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          name: evalCase.name,
          url: evalCase.url,
          category: evalCase.category,
          gate,
          pass: false,
          checks: { execution: false },
          baselineQualityScore: 0,
          hybridQualityScore: 0,
          baselineTextLength: 0,
          hybridTextLength: 0,
          renderLikelyNeeded: false,
          error: message,
        });
      }
    }

    const report = results.map(buildResultLine).join("\n");
    const gated = results.filter((result) => result.gate);
    const gatedStatic = gated.filter((result) => result.category === "static");
    const gatedSpa = gated.filter((result) => result.category === "spa");
    const gatedPassRate = gated.length === 0 ? 0 : gated.filter((result) => result.pass).length / gated.length;
    const gatedStaticPassRate =
      gatedStatic.length === 0 ? 1 : gatedStatic.filter((result) => result.pass).length / gatedStatic.length;
    const gatedSpaPassRate =
      gatedSpa.length === 0 ? 1 : gatedSpa.filter((result) => result.pass).length / gatedSpa.length;

    expect(gated.length, `No gated cases were evaluated.\n${report}`).toBeGreaterThan(0);
    expect(gatedPassRate, `Overall gated pass rate too low.\n${report}`).toBeGreaterThanOrEqual(MIN_GATED_PASS_RATE);
    expect(gatedStaticPassRate, `Static pass rate too low.\n${report}`).toBeGreaterThanOrEqual(
      MIN_GATED_STATIC_PASS_RATE
    );
    expect(gatedSpaPassRate, `SPA pass rate too low.\n${report}`).toBeGreaterThanOrEqual(MIN_GATED_SPA_PASS_RATE);
  }, 300000);
});
