import type {
  GraspsCandidates,
  GraspsFinal,
  GraspsSelection,
  Stage1Result,
  TeacherInput,
} from "../types";
import {
  GRASPS_CANDIDATES_SCHEMA,
  GRASPS_FINAL_SCHEMA,
  STAGE1_SCHEMA,
  VERIFY_SCHEMA,
  buildCandidatesSystem,
  buildCandidatesUser,
  buildFinalSystem,
  buildFinalUser,
  buildStage1System,
  buildStage1User,
  buildVerifySystem,
  buildVerifyUser,
} from "./prompts";

/** 자기검증 결과 — 교정된 최종본 + 수정 내역 */
export interface VerifiedFinal {
  final: GraspsFinal;
  /** 자기검증에서 고친 점 (없으면 빈 배열) */
  issues: string[];
}

export const DEFAULT_MODEL = "gemini-2.5-flash";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 사용자에게 그대로 보여줄 한국어 오류 */
export class GeminiError extends Error {}

interface CallOptions {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: unknown;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 키가 실제로 지원하는 generateContent 모델을 조회해 캐시.
 * 모델명이 키/프로젝트에서 안 먹혀 404가 나는 문제를 근본적으로 없앤다.
 */
const modelListCache = new Map<string, string[]>();

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  const cached = modelListCache.get(apiKey);
  if (cached) return cached;
  try {
    const res = await fetch(
      `${ENDPOINT}?key=${encodeURIComponent(apiKey)}&pageSize=1000`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const names: string[] = (data?.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent"),
      )
      .map((m: { name?: string }) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    modelListCache.set(apiKey, names);
    return names;
  } catch {
    return [];
  }
}

/** 선호 모델이 지원되면 그대로, 아니면 사용 가능한 최적 모델로 대체 */
async function resolveModel(apiKey: string, preferred: string): Promise<string> {
  const available = await listGenerateContentModels(apiKey);
  if (available.length === 0) return preferred; // 목록 조회 실패 → 그대로 시도
  if (preferred && available.includes(preferred)) return preferred;
  const prefs = [
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ];
  for (const p of prefs) if (available.includes(p)) return p;
  const flash = available.find((m) => m.includes("flash"));
  return flash ?? available[0];
}

/** JSON 강제 출력으로 Gemini를 호출하고 파싱된 객체를 반환. 429/503은 1회 재시도. */
async function callGemini<T>({
  apiKey,
  model,
  system,
  user,
  schema,
}: CallOptions): Promise<T> {
  const usableModel = await resolveModel(apiKey, model);
  const url = `${ENDPOINT}/${encodeURIComponent(usableModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.7,
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new GeminiError(
        "네트워크 연결에 실패했습니다. 인터넷 상태를 확인한 뒤 다시 시도해 주세요.",
      );
    }

    if (res.ok) {
      const data = await res.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new GeminiError(
            `모델이 응답을 생성하지 못했습니다(사유: ${blockReason}). 성취기준 문구를 다듬어 다시 시도해 주세요.`,
          );
        }
        throw new GeminiError(
          "모델이 빈 응답을 반환했습니다. 다시 시도해 주세요.",
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new GeminiError(
          "모델 응답을 해석하지 못했습니다(JSON 형식 오류). 다시 시도해 주세요.",
        );
      }
    }

    // 재시도 가능한 상태 코드
    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      lastError = res.status;
      await sleep(1500);
      continue;
    }

    if (res.status === 400 || res.status === 403) {
      throw new GeminiError(
        "API 키가 유효하지 않거나 권한이 없습니다. 키를 다시 확인해 주세요.",
      );
    }
    if (res.status === 404) {
      throw new GeminiError(
        `이 API 키에서 사용할 수 있는 모델('${usableModel}')을 찾지 못했습니다. 키가 Gemini API(Generative Language API)용인지 확인하거나, API 키 설정에서 다른 모델을 선택해 주세요.`,
      );
    }
    if (res.status === 429) {
      throw new GeminiError(
        "요청 한도를 초과했습니다(429). 잠시 후 다시 시도해 주세요.",
      );
    }
    throw new GeminiError(
      `모델 호출에 실패했습니다(HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  throw new GeminiError(
    `모델이 일시적으로 혼잡합니다(${lastError}). 잠시 후 다시 시도해 주세요.`,
  );
}

export async function generateStage1(
  input: TeacherInput,
  apiKey: string,
  model: string,
): Promise<Stage1Result> {
  return callGemini<Stage1Result>({
    apiKey,
    model,
    system: buildStage1System(),
    user: buildStage1User(input),
    schema: STAGE1_SCHEMA,
  });
}

/** Pass 2a — 6요소 각각의 후보(2~3개)를 생성 */
export async function generateGraspsCandidates(
  input: TeacherInput,
  stage1: Stage1Result,
  apiKey: string,
  model: string,
): Promise<GraspsCandidates> {
  return callGemini<GraspsCandidates>({
    apiKey,
    model,
    system: buildCandidatesSystem(),
    user: buildCandidatesUser(input, stage1),
    schema: GRASPS_CANDIDATES_SCHEMA,
  });
}

/** Pass 2b — 확정된 6요소로 학생 안내문·루브릭을 생성 */
export async function generateGraspsFinal(
  input: TeacherInput,
  stage1: Stage1Result,
  selection: GraspsSelection,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<GraspsFinal> {
  const final = await callGemini<GraspsFinal>({
    apiKey,
    model,
    system: buildFinalSystem(includeUdlOptions, input.achievementLevels),
    user: buildFinalUser(input, stage1, selection),
    schema: GRASPS_FINAL_SCHEMA,
  });
  if (!final.studentPrompt || !Array.isArray(final.rubric) || final.rubric.length === 0) {
    throw new GeminiError(
      "안내문·루브릭 생성이 불완전합니다. 다시 시도해 주세요.",
    );
  }
  return final;
}

/**
 * Pass 2c — 자기검증 루프.
 * 초안을 quality_checklist에 대조해 정렬·진짜성·수준을 점검하고,
 * 문제가 있으면 그 부분만 교정한 최종본과 수정 내역을 돌려준다.
 * 검증 호출이 실패해도 초안은 유효하므로, 초안을 그대로 반환한다(폴백).
 */
export async function verifyGraspsFinal(
  input: TeacherInput,
  stage1: Stage1Result,
  selection: GraspsSelection,
  draft: GraspsFinal,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<VerifiedFinal> {
  try {
    const result = await callGemini<{ issues: string[]; revised: GraspsFinal }>({
      apiKey,
      model,
      system: buildVerifySystem(includeUdlOptions, input.achievementLevels),
      user: buildVerifyUser(input, stage1, selection, draft),
      schema: VERIFY_SCHEMA,
    });
    const revised = result.revised;
    const valid =
      revised &&
      revised.studentPrompt &&
      Array.isArray(revised.rubric) &&
      revised.rubric.length > 0;
    return {
      final: valid ? revised : draft,
      issues: Array.isArray(result.issues) ? result.issues : [],
    };
  } catch {
    // 검증 실패는 치명적이지 않다 — 초안을 그대로 쓴다.
    return { final: draft, issues: [] };
  }
}
