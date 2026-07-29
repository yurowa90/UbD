import type { ElementKey, GraspsBundle } from "../types";

/**
 * 요소 간 의존 그래프. 각 키의 값은 그 노드가 바뀌면 stale이 되는
 * 모든 후손 노드다(직접+간접). 캐스케이드 무효화의 단일 기준.
 */
export const DEPENDENTS: Record<ElementKey, ElementKey[]> = {
  role: ["goal", "product", "standards"],
  audience: ["goal", "product", "standards"],
  situation: ["goal", "product", "standards"],
  goal: ["standards"],
  product: ["standards"],
  standards: [],
};

export const ELEMENT_ORDER: ElementKey[] = [
  "role",
  "audience",
  "situation",
  "goal",
  "product",
  "standards",
];

/**
 * changed 요소를 새로 확정하고, 그 후손을 모두 stale로 표시한 상태를 반환.
 * (LLM 아님 — 순수 함수)
 */
export function markStale(
  bundle: GraspsBundle,
  changed: ElementKey,
): GraspsBundle {
  const state = { ...bundle.state };
  state[changed] = "generated";
  for (const dep of DEPENDENTS[changed]) state[dep] = "stale";
  return { ...bundle, state };
}

/** 모든 요소를 generated로 (번들 최초 생성 시) */
export function freshState(): GraspsBundle["state"] {
  return {
    role: "generated",
    audience: "generated",
    situation: "generated",
    goal: "generated",
    product: "generated",
    standards: "generated",
  };
}

export function hasStale(bundle: GraspsBundle): boolean {
  return ELEMENT_ORDER.some((k) => bundle.state[k] === "stale");
}

/** standards 중 Stage 1 이해에서 도출된 준거가 하나라도 있는가 */
export function hasStage1Criterion(bundle: GraspsBundle): boolean {
  return bundle.standards.some((c) => c.source === "stage1_understanding");
}

export interface ExportBlock {
  ok: boolean;
  reasons: string[];
}

/** 내보내기 가능 여부 — stale 잔존/타당도 위반이면 차단 */
export function canExport(bundle: GraspsBundle): ExportBlock {
  const reasons: string[] = [];
  if (hasStale(bundle)) {
    reasons.push("아직 갱신되지 않은(stale) 요소가 있습니다. 먼저 갱신하세요.");
  }
  if (!hasStage1Criterion(bundle)) {
    reasons.push(
      "평가 준거가 전부 장르 관습에서만 도출됐습니다. Stage 1 이해를 재는 준거가 최소 1개 필요합니다.",
    );
  }
  return { ok: reasons.length === 0, reasons };
}
