/** 2022 개정 과학과 성취수준 (5수준 A~E 또는 3수준 A~C) */
export interface AchievementLevels {
  /** 5 = A~E, 3 = A~C(과학탐구실험 등 수행 중심 과목) */
  system: 3 | 5;
  A: string;
  B: string;
  C: string;
  D: string;
  E: string;
}

/** 공식 과학 성취기준 한 건 (science_standards.json) */
export interface ScienceStandard {
  /** 학교급: 초등학교 / 중학교 / 고등학교 */
  level: string;
  /** 과목유형: 공통 / 일반선택 / 진로선택 / 융합선택 */
  type: string;
  /** 과목명 (예: 통합과학1, 생명과학) */
  subject: string;
  /** 영역 */
  domain: string;
  /** 성취기준 코드 (예: 10통과1-01-01) */
  code: string;
  /** 성취기준 원문 */
  text: string;
  /** 성취수준 A~E (없을 수 있음 — 초등 등) */
  levels?: AchievementLevels;
}

export interface TeacherInput {
  /** 교과명 (예: 통합과학, 생명과학) */
  subject: string;
  /** 학년/학교급 */
  grade: string;
  /** 성취기준 원문 (선택 또는 직접 입력) */
  standard: string;
  /** 수업 맥락 메모 (선택) — 수업 목표·핵심 활동, 단원, 가용 시수 등 */
  context: string;
  /** 공식 성취기준에서 고른 경우의 코드 */
  standardCode?: string;
  /** 공식 성취기준의 A~E 성취수준 (있으면 루브릭을 이 체계에 정렬) */
  achievementLevels?: AchievementLevels;
}

/** Pass 1 산출물 — 백워드 설계 Stage 1 요소 */
export interface Stage1Result {
  /** 전이 목표 1개: 학생이 배운 것을 새로운 맥락에 자율적으로 적용하는 장기 목표 */
  transferGoal: string;
  /** 영속적 이해 2개: 단원 종료 후에도 남아야 할 핵심 일반화 (문장형) */
  understandings: string[];
  /** 본질적 질문 2개: 탐구를 여는 개방형 질문 */
  essentialQuestions: string[];
}

/** 어디서 도출된 준거인지 — 감사 대상 (전부 genre_convention이면 Stage 1을 못 잼) */
export type CriterionSource = "stage1_understanding" | "genre_convention";

/** 루브릭 준거 하나 */
export interface Criterion {
  /** 평가 준거 이름 */
  label: string;
  /** 이 준거가 무엇을 재는지 서술 */
  descriptor: string;
  /** 도출 출처 */
  source: CriterionSource;
  /** stage1_understanding일 때 대응 이해 인덱스 (정렬 마커·감사용) */
  alignedUnderstandingIndex?: number;
  /** 성취수준 서술 (상위→하위, 3~5수준). 공식 A~E 연동 시 사용 */
  levels?: { label: string; descriptor: string }[];
}

/** UDL 기반 산출물 대안 하나 */
export interface ProductOption {
  /** 산출물 형태 (예: 인포그래픽, 발표 영상, 실물 모형) */
  format: string;
  /** 이 형태가 지원하는 표현 수단 및 대상 학생 */
  rationale: string;
}

/**
 * GRASPS 요소 키 = 의존 그래프 노드.
 * P는 Product/Performance/Purpose로 혼용되므로 내부 키는 product 하나로
 * 통일하고 UI 라벨만 "수행·산출물"로 병기한다. S는 Situation·Standards
 * 두 곳에 쓰이므로 situation·standards로 분리한다.
 */
export type ElementKey =
  | "role"
  | "audience"
  | "situation"
  | "goal"
  | "product"
  | "standards";

export type ElementState = "generated" | "locked" | "stale";

/** 청중 근접성 축 — 3개 번들을 이 축으로 강제 분산 */
export type AudienceProximity =
  | "classroom"
  | "school_community"
  | "expert_public";

/**
 * 내적으로 정합한 GRASPS 완성 세트(번들) — 1급 객체.
 * 슬롯별 독립 생성 대신 이 번들을 생성 단위로 삼는다.
 * Role↔Audience↔Situation은 결합 다발로 동시 생성되고,
 * Goal(R+S)·Product(A+S)·Standards(Stage1+Product 장르)는 파생된다.
 */
export interface GraspsBundle {
  id: string;
  /** 이 번들의 설계 논리 한 줄 — 먼저 정하고 그로부터 요소를 도출 */
  designLogic: string;
  axis: AudienceProximity;
  role: string;
  audience: string;
  situation: string;
  goal: string;
  /** P — Product/Performance/Purpose (수행·산출물) */
  product: string;
  standards: Criterion[];
  /** 파생: 6요소를 통합한 학생용 안내문 */
  studentPrompt: string;
  /** 파생: UDL 산출물 대안 (선택) */
  productOptions?: ProductOption[];
  /** 요소별 상태 */
  state: Record<ElementKey, ElementState>;
}

/** 정합성 감사 — 검사 항목 키 */
export type AuditCheckKey =
  | "ra_reach"
  | "rg_authority"
  | "ap_receivability"
  | "s_coherence"
  | "construct_irrelevant"
  | "construct_underrep";

export interface AuditCheck {
  key: AuditCheckKey;
  /** 사람이 읽는 검사 이름 */
  label: string;
  /** 관련 요소쌍 표기 (예: "R–A") */
  pair: string;
  passed: boolean;
  /** 통과/실패 이유 문장 */
  explanation: string;
}

export interface BundleAudit {
  checks: AuditCheck[];
  passed: boolean;
}

export type WizardStep = "input" | "stage1" | "bundles" | "refine";
