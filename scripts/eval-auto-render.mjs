import { FetchEngine, HybridEngine } from "../dist/index.js";
import { assessHtmlRenderNeed, assessSerializedContent } from "../dist/utils/render-detection.js";

const MIN_GATED_PASS_RATE = 0.8;
const MIN_GATED_STATIC_PASS_RATE = 1;
const MIN_GATED_SPA_PASS_RATE = 0.5;

const DEFAULT_CASES = [
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

function includesAny(haystack, needles) {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function toAdHocCase(url) {
  return {
    name: `Ad-hoc URL ${url}`,
    url,
    category: "static",
    requiredAny: [],
    minTextLength: 40,
    gate: false,
  };
}

function summarize(results) {
  const gated = results.filter((result) => result.gate);
  const gatedStatic = gated.filter((result) => result.category === "static");
  const gatedSpa = gated.filter((result) => result.category === "spa");

  const gatedPassRate = gated.length === 0 ? 0 : gated.filter((result) => result.pass).length / gated.length;
  const gatedStaticPassRate =
    gatedStatic.length === 0 ? 1 : gatedStatic.filter((result) => result.pass).length / gatedStatic.length;
  const gatedSpaPassRate =
    gatedSpa.length === 0 ? 1 : gatedSpa.filter((result) => result.pass).length / gatedSpa.length;

  return {
    gatedCases: gated.length,
    gatedPassRate,
    gatedStaticPassRate,
    gatedSpaPassRate,
    thresholds: {
      gatedPassRate: MIN_GATED_PASS_RATE,
      gatedStaticPassRate: MIN_GATED_STATIC_PASS_RATE,
      gatedSpaPassRate: MIN_GATED_SPA_PASS_RATE,
    },
    thresholdPass:
      gatedPassRate >= MIN_GATED_PASS_RATE &&
      gatedStaticPassRate >= MIN_GATED_STATIC_PASS_RATE &&
      gatedSpaPassRate >= MIN_GATED_SPA_PASS_RATE,
  };
}

async function evaluateCase(evalCase, fetchEngine, hybridEngine) {
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
    const keywordHit = evalCase.requiredAny.length === 0 || includesAny(hybridResult.content, evalCase.requiredAny);

    const checks = {
      statusCode: hybridResult.statusCode === 200,
      markdownOutput: hybridResult.contentType === "markdown",
      minTextLength: hybridAssessment.textLength >= evalCase.minTextLength,
      keywordHit,
      noStaticRegression:
        evalCase.category === "static" ? hybridAssessment.qualityScore >= baselineAssessment.qualityScore - 1 : true,
      renderNeedHandled: renderNeed.renderLikelyNeeded ? hybridAssessment.textLength >= 80 : true,
    };

    return {
      name: evalCase.name,
      url: evalCase.url,
      category: evalCase.category,
      gate,
      pass: Object.values(checks).every(Boolean),
      checks,
      baseline: {
        title: baselineMarkdownResult.title,
        contentType: baselineMarkdownResult.contentType,
        statusCode: baselineMarkdownResult.statusCode,
        qualityScore: baselineAssessment.qualityScore,
        textLength: baselineAssessment.textLength,
      },
      hybrid: {
        title: hybridResult.title,
        contentType: hybridResult.contentType,
        statusCode: hybridResult.statusCode,
        qualityScore: hybridAssessment.qualityScore,
        textLength: hybridAssessment.textLength,
      },
      renderLikelyNeeded: renderNeed.renderLikelyNeeded,
      renderLikelyNeededScore: renderNeed.renderLikelyNeededScore,
      renderNeedQualityScore: renderNeed.qualityScore,
    };
  } catch (error) {
    return {
      name: evalCase.name,
      url: evalCase.url,
      category: evalCase.category,
      gate,
      pass: false,
      checks: { execution: false },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const urls = process.argv.slice(2);
  const cases = urls.length > 0 ? urls.map(toAdHocCase) : DEFAULT_CASES;
  const results = [];
  const fetchEngine = new FetchEngine();
  const hybridEngine = new HybridEngine({ markdown: true, maxRetries: 1, useHttpFallback: true });

  try {
    for (const evalCase of cases) {
      results.push(await evaluateCase(evalCase, fetchEngine, hybridEngine));
    }
  } finally {
    await fetchEngine.cleanup();
    await hybridEngine.cleanup();
  }

  const summary = summarize(results);
  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        results,
      },
      null,
      2
    )
  );

  if (urls.length === 0 && !summary.thresholdPass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
