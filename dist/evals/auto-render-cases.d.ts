export type AutoRenderEvalCategory = "spa" | "static";
export type AutoRenderEvalArchetype = "docs" | "government" | "knowledge" | "marketing" | "commerce" | "static-baseline" | "access-guarded";
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
export declare const AUTO_RENDER_MIN_GATED_PASS_RATE = 0.8;
export declare const AUTO_RENDER_MIN_GATED_STATIC_PASS_RATE = 1;
export declare const AUTO_RENDER_MIN_GATED_SPA_PASS_RATE = 0.5;
export declare const AUTO_RENDER_EVAL_CASES: AutoRenderEvalCase[];
//# sourceMappingURL=auto-render-cases.d.ts.map