import type {
  AchievementLevels,
  ElementKey,
  GraspsBundle,
  Stage1Result,
  TeacherInput,
} from "../types";
import grasps from "../knowledge/grasps.md?raw";
import ubdStage1 from "../knowledge/ubd_stage1.md?raw";
import sixFacets from "../knowledge/six_facets.md?raw";
import udl from "../knowledge/udl.md?raw";
import qualityChecklist from "../knowledge/quality_checklist.md?raw";

/** Gemini responseSchema — 파싱 에러 방지를 위한 JSON 강제 출력 스키마 */

export const STAGE1_SCHEMA = {
  type: "object",
  properties: {
    transferGoal: { type: "string" },
    understandings: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    },
    essentialQuestions: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ["transferGoal", "understandings", "essentialQuestions"],
  propertyOrdering: ["transferGoal", "understandings", "essentialQuestions"],
};

const levelsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { label: { type: "string" }, descriptor: { type: "string" } },
    required: ["label", "descriptor"],
    propertyOrdering: ["label", "descriptor"],
  },
  minItems: 3,
  maxItems: 5,
};

const criterionSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    // 값은 "stage1_understanding" 또는 "genre_convention" (프롬프트로 강제)
    source: { type: "string" },
    alignedUnderstandingIndex: { type: "integer" },
    descriptor: { type: "string" },
    levels: levelsSchema,
  },
  required: ["label", "descriptor", "source"],
  propertyOrdering: [
    "label",
    "source",
    "alignedUnderstandingIndex",
    "descriptor",
    "levels",
  ],
};

const standardsSchema = {
  type: "array",
  items: criterionSchema,
};

const productOptionsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      format: { type: "string" },
      rationale: { type: "string" },
    },
    required: ["format", "rationale"],
    propertyOrdering: ["format", "rationale"],
  },
};

/**
 * 번들 1개 스키마 (axis는 클라이언트가 축별로 지정하므로 출력에서 제외).
 * 깊은 중첩을 피하려고 번들을 축별로 1개씩 생성한다 — 3개를 배열로 한 번에
 * 받으면 스키마 중첩이 깊어져 Gemini가 거부(400)한다.
 */
export const SINGLE_BUNDLE_SCHEMA = {
  type: "object",
  properties: {
    designLogic: { type: "string" },
    role: { type: "string" },
    audience: { type: "string" },
    situation: { type: "string" },
    goal: { type: "string" },
    product: { type: "string" },
    studentPrompt: { type: "string" },
    standards: standardsSchema,
    productOptions: productOptionsSchema,
  },
  required: [
    "designLogic",
    "role",
    "audience",
    "situation",
    "goal",
    "product",
    "studentPrompt",
    "standards",
  ],
  propertyOrdering: [
    "designLogic",
    "role",
    "audience",
    "situation",
    "goal",
    "product",
    "studentPrompt",
    "standards",
    "productOptions",
  ],
};

/** 대상 요소 하나를 재생성 — studentPrompt(+product 시 UDL 옵션)도 함께 갱신 */
export function regenElementSchema(target: ElementKey): object {
  if (target === "standards") {
    return {
      type: "object",
      properties: {
        standards: standardsSchema,
        studentPrompt: { type: "string" },
      },
      required: ["standards", "studentPrompt"],
      propertyOrdering: ["standards", "studentPrompt"],
    };
  }
  const properties: Record<string, unknown> = {
    value: { type: "string" },
    studentPrompt: { type: "string" },
  };
  const ordering = ["value", "studentPrompt"];
  if (target === "product") {
    properties.productOptions = productOptionsSchema;
    ordering.push("productOptions");
  }
  return {
    type: "object",
    properties,
    required: ["value", "studentPrompt"],
    propertyOrdering: ordering,
  };
}

/** 정합성 감사 — 6개 검사를 개별 항목으로 (label·pair는 클라이언트에서 부여) */
export const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    checks: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          // key는 아래 6개 중 하나 (프롬프트로 강제)
          key: { type: "string" },
          passed: { type: "boolean" },
          explanation: { type: "string" },
        },
        required: ["key", "passed", "explanation"],
        propertyOrdering: ["key", "passed", "explanation"],
      },
    },
  },
  required: ["checks"],
  propertyOrdering: ["checks"],
};

const SHARED_ROLE = `당신은 백워드 설계(Understanding by Design)와 UDL에 정통한 교육과정 설계 전문가입니다. 대한민국 중등 과학 교사를 돕습니다. 모든 출력은 한국어로, 현직 교사가 즉시 쓸 수 있는 구체적 문장으로 작성합니다. 반드시 지정된 JSON 스키마에 맞춰 응답합니다.`;

export function buildStage1System(): string {
  return `${SHARED_ROLE}

당신의 임무는 성취기준을 백워드 설계 Stage 1 요소(전이 목표·영속적 이해·본질적 질문)로 **번역**하는 것입니다. 아직 수행과제(GRASPS)를 만들지 마십시오 — 그것은 다음 단계이며, 교사가 이 Stage 1을 검토·확정한 뒤에 진행됩니다.

다음 지식을 근거로 삼으십시오.

<knowledge>
${ubdStage1}
</knowledge>

제약:
- transferGoal 1개, understandings 2개, essentialQuestions 2개.
- 영속적 이해는 주제어가 아니라 완전한 문장(통찰)으로.
- 본질적 질문은 하나의 사실로 닫히지 않는 개방형으로.
- 세 요소가 같은 큰 개념을 가리키며 서로 정렬되도록.`;
}

export function buildStage1User(input: TeacherInput): string {
  return `아래 정보로 Stage 1 요소를 생성하십시오.

교과: ${input.subject || "(미지정)"}
학년: ${input.grade || "(미지정)"}
성취기준:
${input.standard}
${input.context ? `\n수업 맥락 메모:\n${input.context}` : ""}`;
}

function stage1Block(stage1: Stage1Result): string {
  const understandings = stage1.understandings
    .map((u, i) => `  [${i}] ${u}`)
    .join("\n");
  const questions = stage1.essentialQuestions
    .map((q, i) => `  ${i + 1}. ${q}`)
    .join("\n");
  return `전이 목표:
  ${stage1.transferGoal}

영속적 이해 (rubric의 alignedUnderstandingIndex는 이 인덱스를 사용):
${understandings}

본질적 질문:
${questions}`;
}

const ELEMENT_LABEL: Record<ElementKey, string> = {
  role: "R 역할",
  audience: "A 청중",
  situation: "S 상황",
  goal: "G 목표",
  product: "P 수행·산출물",
  standards: "S 성공기준",
};

function officialLevelsBlock(lv?: AchievementLevels): string {
  if (!lv) return "";
  return `

=== 공식 성취수준 (${lv.system === 3 ? "A~C" : "A~E"}) — 루브릭 눈금의 근거 ===
<official_levels>
A: ${lv.A}
B: ${lv.B}
C: ${lv.C}${lv.system === 5 ? `\nD: ${lv.D}\nE: ${lv.E}` : ""}
</official_levels>`;
}

function rubricLevelRule(levels?: AchievementLevels): string {
  if (!levels) {
    return `- standards의 각 준거 levels는 정확히 4개 수준이며, "잘함/보통" 같은 공허한 등급이 아니라 관찰 가능한 수행 차이로 서술합니다.`;
  }
  const labels = levels.system === 3 ? "A, B, C (3수준)" : "A, B, C, D, E (5수준)";
  return `- 이 성취기준에는 공식 성취수준이 있습니다. standards 준거의 levels는 정확히 이 체계(${labels})를 따르고 label을 "${levels.system === 3 ? "A/B/C" : "A/B/C/D/E"}"로 답니다. 각 수준 서술어는 <official_levels>의 해당 수준을 이 과제 맥락으로 구체화하되 성취 눈금은 공식 수준에 맞춥니다.`;
}

/** 번들의 6요소를 잠금 상태와 함께 텍스트로 (regen/audit 컨텍스트용) */
function bundleBlock(bundle: GraspsBundle, withLocks: boolean): string {
  const line = (k: ElementKey, value: string) => {
    const mark = withLocks ? ` [${bundle.state[k]}]` : "";
    return `- ${ELEMENT_LABEL[k]}${mark}: ${value}`;
  };
  const std = bundle.standards
    .map(
      (c) =>
        `    · [${c.source}${
          c.alignedUnderstandingIndex != null
            ? `, 이해#${c.alignedUnderstandingIndex}`
            : ""
        }] ${c.label} — ${c.descriptor}`,
    )
    .join("\n");
  return `설계 논리: ${bundle.designLogic}
청중 근접성(axis): ${bundle.axis}
${line("role", bundle.role)}
${line("audience", bundle.audience)}
${line("situation", bundle.situation)}
${line("goal", bundle.goal)}
${line("product", bundle.product)}
- ${ELEMENT_LABEL.standards}${withLocks ? ` [${bundle.state.standards}]` : ""}:
${std}`;
}

/* ── 번들 1개 생성 (축별로 호출) ─────────────────────────── */

const AXIS_GUIDE: Record<string, string> = {
  classroom: "classroom — 청중이 학급·학년 내부(같은 반 동료, 후배 학년 등)",
  school_community:
    "school_community — 청중이 학교·지역사회(학부모회, 주민센터, 지역 신문 등)",
  expert_public:
    "expert_public — 청중이 전문가·공적 기관(시청 담당 부서, 학회, 시민단체 등)",
};

export function buildBundleSystem(
  axis: string,
  includeUdlOptions: boolean,
  levels?: AchievementLevels,
): string {
  return `${SHARED_ROLE}

당신의 임무는 **교사가 확정한 Stage 1**을 평가할, **내적으로 정합한 GRASPS 완성 세트(번들) 1개**를 생성하는 것입니다. 슬롯별로 요소를 따로 뽑아 조합하지 마십시오 — 하나의 정합한 세트여야 합니다.

**이 번들의 청중 근접성(axis): ${AXIS_GUIDE[axis] ?? axis}.** 이 축의 청중에 맞게 Role·Audience·Situation을 설계하십시오.

<knowledge name="grasps">
${grasps}
</knowledge>

<knowledge name="six_facets">
${sixFacets}
</knowledge>

<knowledge name="quality_checklist">
${qualityChecklist}
</knowledge>
${includeUdlOptions ? `\n<knowledge name="udl">\n${udl}\n</knowledge>\n` : ""}
각 번들의 생성 규칙:
- **먼저 designLogic(설계 논리 한 줄)을 정하고**, 그로부터 6요소를 도출합니다. 요소를 먼저 뽑고 논리를 나중에 요약하지 마십시오.
- Role·Audience·Situation은 **한 다발로 동시에** 결정합니다. Goal은 Role+Situation에서, Product는 Audience+Situation에서, Standards는 Stage 1 이해 + Product 장르에서 파생합니다.
- **쌍 정합성 필수**: (R–A) 그 역할이 그 청중에게 도달할 개연성, (R–G) 그 역할에 목표 추구 권한, (A–P) 그 청중이 실제 수신·소비하는 장르의 산출물, (S–R/A) 그 상황에서 역할·청중 공존. 하나라도 어기면 부정합입니다.
- **타당도**: 이해가 없는 학생이 장르 요령만으로 Product를 잘 만들 수 있으면 안 됩니다(구인 무관 변량). 이해를 갖춘 학생이 그 이해를 드러낼 통로가 Product 안에 있어야 합니다(구인 과소대표).
- standards: 최소 1개 준거의 source는 반드시 "stage1_understanding"이고 alignedUnderstandingIndex에 대응 이해의 0-기반 인덱스를 넣습니다. 장르 규범 준거는 source="genre_convention". 전부 genre_convention이면 실패입니다.
${rubricLevelRule(levels)}
- studentPrompt: 그 번들의 6요소를 자연스럽게 통합해 학생에게 그대로 제시할 안내문.
${includeUdlOptions ? '- productOptions: 같은 이해를 여러 산출 형태로 드러내는 UDL 대안 3개(같은 루브릭으로 채점 가능).' : "- productOptions는 넣지 않습니다."}
- standards 준거는 2~4개로. source 값은 반드시 "stage1_understanding" 또는 "genre_convention" 문자열 그대로 적습니다.`;
}

export function buildBundleUser(
  input: TeacherInput,
  stage1: Stage1Result,
  axis: string,
): string {
  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}
${input.context ? `수업 맥락: ${input.context}\n` : ""}
=== 교사가 확정한 Stage 1 ===

${stage1Block(stage1)}${officialLevelsBlock(input.achievementLevels)}

청중 근접성 축은 "${axis}"입니다. 이 축에 맞는, 내적으로 정합한 GRASPS 번들 1개를 생성하십시오.`;
}

/* ── 조건부 재생성 — 대상 요소 하나만 ──────────────────── */

export function buildRegenElementSystem(
  target: ElementKey,
  includeUdlOptions: boolean,
  levels?: AchievementLevels,
): string {
  const label = ELEMENT_LABEL[target];
  return `${SHARED_ROLE}

당신은 이미 만들어진 **정합한 GRASPS 번들에서 '${label}' 요소 하나만** 다시 생성합니다. 나머지 요소는 바꾸지 말고 반환하지도 마십시오.

<knowledge name="grasps">
${grasps}
</knowledge>

<knowledge name="quality_checklist">
${qualityChecklist}
</knowledge>
${target === "product" && includeUdlOptions ? `\n<knowledge name="udl">\n${udl}\n</knowledge>\n` : ""}${target === "standards" ? `\n<knowledge name="six_facets">\n${sixFacets}\n</knowledge>\n` : ""}
규칙:
- 잠긴(locked) 형제 요소와 Stage 1을 **반드시 지키며 그에 정합**하도록 새 값을 냅니다. 쌍 정합성(R–A 도달, R–G 권한, A–P 수신, S–R/A 공존)을 유지하십시오.
- 제시된 "제외할 값"(직전 값)은 다시 내지 않습니다. 표현만 바꾼 게 아니라 **실질적으로 다른** 선택지를 냅니다.
- studentPrompt는 갱신된 요소를 반영해 다시 씁니다.
${target === "standards" ? "- standards: 최소 1개 준거의 source는 stage1_understanding이고 alignedUnderstandingIndex를 정확히 넣습니다.\n" + rubricLevelRule(levels) : ""}${target === "product" && includeUdlOptions ? "- productOptions(UDL 대안 3개)도 갱신합니다." : ""}
${target === "standards" ? "" : "- value에 '" + label + "'의 새 값(문장)을 담습니다."}`;
}

export function buildRegenElementUser(
  input: TeacherInput,
  stage1: Stage1Result,
  bundle: GraspsBundle,
  target: ElementKey,
  exclude: string[],
): string {
  const label = ELEMENT_LABEL[target];
  const excludeBlock =
    exclude.length > 0
      ? `\n\n제외할 값(다시 내지 말 것):\n${exclude.map((e) => `- ${e}`).join("\n")}`
      : "";
  const officialBlock =
    target === "standards" ? officialLevelsBlock(input.achievementLevels) : "";
  return `교과: ${input.subject || "(미지정)"} / 학년: ${input.grade || "(미지정)"}

=== 교사가 확정한 Stage 1 ===

${stage1Block(stage1)}

=== 현재 번들 (locked 요소는 반드시 유지) ===

${bundleBlock(bundle, true)}${officialBlock}${excludeBlock}

'${label}' 요소만 다시 생성하고, 갱신된 studentPrompt와 함께 반환하십시오.`;
}

/* ── 정합성 감사 — 별도 검증 호출 ──────────────────────── */

export function buildAuditSystem(): string {
  return `${SHARED_ROLE}

당신은 **GRASPS 정합성 감사자**입니다. 아래 quality_checklist의 §6 쌍 수준 검사와 §7 타당도 검사, 총 6개를 **각각 독립 항목**으로 수행합니다.

<knowledge name="quality_checklist">
${qualityChecklist}
</knowledge>

<knowledge name="grasps">
${grasps}
</knowledge>

6개 검사(각 key에 대해 passed와 explanation을 반환):
- ra_reach: 그 역할이 그 청중에게 실제로 도달할 개연성이 있는가.
- rg_authority: 그 역할에 그 목표를 추구할 지위·권한이 있는가.
- ap_receivability: 그 청중이 실제로 수신·소비하는 장르의 산출물인가.
- s_coherence: 그 상황에서 그 역할과 청중이 함께 존재할 수 있는가.
- construct_irrelevant: Stage 1 이해가 **없는** 학생이 장르 요령만으로 Product를 잘 만들 수 있으면 **passed=false**(구인 무관 변량).
- construct_underrep: Stage 1 이해를 **갖춘** 학생이 그 이해를 드러낼 통로가 Product 안에 **없으면 passed=false**(구인 과소대표).

explanation은 **어떤 쌍이 왜 통과/실패인지 한 문장**으로 구체적으로 씁니다(통과/실패 판정만 내지 말 것).`;
}

export function buildAuditUser(
  stage1: Stage1Result,
  bundle: GraspsBundle,
): string {
  return `=== 교사가 확정한 Stage 1 ===

${stage1Block(stage1)}

=== 감사할 GRASPS 번들 ===

${bundleBlock(bundle, false)}

위 6개 검사를 수행해 checks를 반환하십시오.`;
}
