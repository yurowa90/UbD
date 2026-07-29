import type { AudienceProximity, CriterionSource, ElementKey } from "../types";

export const AXIS_LABEL: Record<AudienceProximity, string> = {
  classroom: "학급·학년 내부",
  school_community: "학교·지역사회",
  expert_public: "전문가·공적 기관",
};

export const AXIS_SUB: Record<AudienceProximity, string> = {
  classroom: "같은 반 동료·후배 학년",
  school_community: "학부모회·주민센터·지역 신문",
  expert_public: "시청 부서·학회·시민단체",
};

export const SOURCE_LABEL: Record<CriterionSource, string> = {
  stage1_understanding: "이해 기반",
  genre_convention: "장르 관습",
};

export const ELEMENT_META: Record<ElementKey, { letter: string; name: string }> =
  {
    goal: { letter: "G", name: "목표 Goal" },
    role: { letter: "R", name: "역할 Role" },
    audience: { letter: "A", name: "청중 Audience" },
    situation: { letter: "S", name: "상황 Situation" },
    product: { letter: "P", name: "수행·산출물 Product" },
    standards: { letter: "S", name: "성공기준 Standards" },
  };

/** GRASPS 표기 순서 (G·R·A·S·P·S) */
export const DISPLAY_ORDER: ElementKey[] = [
  "goal",
  "role",
  "audience",
  "situation",
  "product",
  "standards",
];
