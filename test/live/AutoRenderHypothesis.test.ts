/** @vitest-environment node */

import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { FetchEngine, HybridEngine } from "../../src/index.js";
import { assessHtmlRenderNeed, assessSerializedContent } from "../../src/utils/render-detection.js";
import {
  AUTO_RENDER_EVAL_CASES,
  AUTO_RENDER_MIN_GATED_PASS_RATE,
  AUTO_RENDER_MIN_GATED_SPA_PASS_RATE,
  AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE,
  type AutoRenderEvalArchetype,
  type AutoRenderEvalCategory,
} from "../../src/evals/auto-render-cases.js";

const RUN_LIVE = process.env.LIVE_NETWORK === "1";

interface EvalResult {
  name: string;
  url: string;
  category: AutoRenderEvalCategory;
  archetype: AutoRenderEvalArchetype;
  gate: boolean;
  pass: boolean;
  checks: Record<string, boolean>;
  baselineQualityScore: number;
  hybridQualityScore: number;
  baselineTextLength: number;
  hybridTextLength: number;
  renderLikelyNeeded: boolean | null;
  baselineError?: string;
  error?: string;
}

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
  const baselineError = result.baselineError ? `, baselineError=${result.baselineError}` : "";
  const error = result.error ? `, error=${result.error}` : "";
  return `${status} [${gate}] ${result.category}/${result.archetype} :: ${result.name} (${result.url}) :: ${checks} :: ${scores}, ${renderSignal}${baselineError}${error}`;
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

    for (const evalCase of AUTO_RENDER_EVAL_CASES) {
      const gate = evalCase.gate !== false;
      try {
        const hybridResult = await hybridEngine.fetchHTML(evalCase.url, { markdown: true });
        let baselineHtmlResult: Awaited<ReturnType<FetchEngine["fetchHTML"]>> | null = null;
        let baselineMarkdownResult: Awaited<ReturnType<FetchEngine["fetchHTML"]>> | null = null;
        let baselineError: string | undefined;

        try {
          baselineHtmlResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: false });
          baselineMarkdownResult = await fetchEngine.fetchHTML(evalCase.url, { markdown: true });
        } catch (error: unknown) {
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
        const keywordHit = includesAny(hybridResult.content, evalCase.requiredAny);

        const checks: Record<string, boolean> = {
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

        const pass = Object.values(checks).every(Boolean);
        results.push({
          name: evalCase.name,
          url: evalCase.url,
          category: evalCase.category,
          archetype: evalCase.archetype,
          gate,
          pass,
          checks,
          baselineError,
          baselineQualityScore: baselineAssessment.qualityScore,
          hybridQualityScore: hybridAssessment.qualityScore,
          baselineTextLength: baselineAssessment.textLength,
          hybridTextLength: hybridAssessment.textLength,
          renderLikelyNeeded: renderNeed?.renderLikelyNeeded ?? null,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          name: evalCase.name,
          url: evalCase.url,
          category: evalCase.category,
          archetype: evalCase.archetype,
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
    expect(gatedPassRate, `Overall gated pass rate too low.\n${report}`).toBeGreaterThanOrEqual(
      AUTO_RENDER_MIN_GATED_PASS_RATE
    );
    expect(gatedStaticPassRate, `Static pass rate too low.\n${report}`).toBeGreaterThanOrEqual(
      AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE
    );
    expect(gatedSpaPassRate, `SPA pass rate too low.\n${report}`).toBeGreaterThanOrEqual(
      AUTO_RENDER_MIN_GATED_SPA_PASS_RATE
    );
  }, 300000);
});
