import { FetchEngine, HybridEngine } from "../dist/index.js";
import { assessHtmlRenderNeed, assessSerializedContent } from "../dist/utils/render-detection.js";
import {
  AUTO_RENDER_EVAL_CASES,
  AUTO_RENDER_MIN_GATED_PASS_RATE,
  AUTO_RENDER_MIN_GATED_SPA_PASS_RATE,
  AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE,
} from "../dist/evals/auto-render-cases.js";

function includesAny(haystack, needles) {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function toAdHocCase(url) {
  return {
    name: `Ad-hoc URL ${url}`,
    url,
    category: "static",
    archetype: "static-baseline",
    requiredAny: [],
    minTextLength: 40,
    gate: false,
  };
}

function summarize(results) {
  const gated = results.filter((result) => result.gate);
  const gatedStatic = gated.filter((result) => result.category === "static");
  const gatedSpa = gated.filter((result) => result.category === "spa");
  const archetypeCounts = Object.fromEntries(
    Object.entries(
      results.reduce((acc, result) => {
        acc[result.archetype] = (acc[result.archetype] || 0) + 1;
        return acc;
      }, {})
    ).sort(([left], [right]) => left.localeCompare(right))
  );

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
    archetypeCounts,
    thresholds: {
      gatedPassRate: AUTO_RENDER_MIN_GATED_PASS_RATE,
      gatedStaticPassRate: AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE,
      gatedSpaPassRate: AUTO_RENDER_MIN_GATED_SPA_PASS_RATE,
    },
    thresholdPass:
      gatedPassRate >= AUTO_RENDER_MIN_GATED_PASS_RATE &&
      gatedStaticPassRate >= AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE &&
      gatedSpaPassRate >= AUTO_RENDER_MIN_GATED_SPA_PASS_RATE,
  };
}

async function evaluateCase(evalCase, fetchEngine, hybridEngine) {
  const gate = evalCase.gate !== false;
  try {
    const hybridResult = await hybridEngine.fetchHTML(evalCase.url, { markdown: true });
    let baselineHtmlResult = null;
    let baselineMarkdownResult = null;
    let baselineError = null;

    try {
      baselineHtmlResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: false });
      baselineMarkdownResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: true });
    } catch (error) {
      baselineError = error instanceof Error ? error.message : String(error);
      if (!evalCase.baselineOptional) {
        throw error;
      }
    }

    const renderNeed = baselineHtmlResult ? assessHtmlRenderNeed(baselineHtmlResult.content) : null;
    const baselineAssessment = baselineMarkdownResult
      ? assessSerializedContent(baselineMarkdownResult.content, baselineMarkdownResult.contentType)
      : { qualityScore: 0, textLength: 0, titleLength: 0 };
    const hybridAssessment = assessSerializedContent(hybridResult.content, hybridResult.contentType);
    const keywordHit = evalCase.requiredAny.length === 0 || includesAny(hybridResult.content, evalCase.requiredAny);

    const checks = {
      statusCode: hybridResult.statusCode === 200,
      markdownOutput: hybridResult.contentType === "markdown",
      minTextLength: hybridAssessment.textLength >= evalCase.minTextLength,
      keywordHit,
      noStaticRegression:
        evalCase.category === "static" && baselineMarkdownResult
          ? hybridAssessment.qualityScore >= baselineAssessment.qualityScore - 1
          : true,
      renderNeedHandled: renderNeed?.renderLikelyNeeded ? hybridAssessment.textLength >= 80 : true,
    };

    return {
      name: evalCase.name,
      url: evalCase.url,
      category: evalCase.category,
      archetype: evalCase.archetype,
      gate,
      pass: Object.values(checks).every(Boolean),
      checks,
      baselineError,
      baseline: {
        title: baselineMarkdownResult?.title ?? null,
        contentType: baselineMarkdownResult?.contentType ?? null,
        statusCode: baselineMarkdownResult?.statusCode ?? null,
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
      renderLikelyNeeded: renderNeed?.renderLikelyNeeded ?? null,
      renderLikelyNeededScore: renderNeed?.renderLikelyNeededScore ?? null,
      renderNeedQualityScore: renderNeed?.qualityScore ?? null,
    };
  } catch (error) {
    return {
      name: evalCase.name,
      url: evalCase.url,
      category: evalCase.category,
      archetype: evalCase.archetype,
      gate,
      pass: false,
      checks: { execution: false },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const urls = process.argv.slice(2);
  const cases = urls.length > 0 ? urls.map(toAdHocCase) : AUTO_RENDER_EVAL_CASES;
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
