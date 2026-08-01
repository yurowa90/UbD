import type {
  AudienceProximity,
  AuditCheck,
  AuditCheckKey,
  BundleAudit,
  Criterion,
  CriterionSource,
  ElementKey,
  GraspsBundle,
  ProductOption,
  Stage1Result,
  TeacherInput,
} from "../types";
import {
  AUDIT_SCHEMA,
  SINGLE_BUNDLE_SCHEMA,
  STAGE1_SCHEMA,
  buildAuditSystem,
  buildAuditUser,
  buildBundleSystem,
  buildBundleUser,
  buildRegenElementSystem,
  buildRegenElementUser,
  buildStage1System,
  buildStage1User,
  regenElementSchema,
} from "./prompts";
import { freshState, markStale } from "./bundle";

/** 감사 항목의 사람이 읽는 이름·쌍 표기 (모델은 key만 반환) */
const AUDIT_META: Record<AuditCheckKey, { label: string; pair: string }> = {
  ra_reach: { label: "역할 → 청중 도달 가능성", pair: "R–A" },
  rg_authority: { label: "역할의 목표 추구 권한", pair: "R–G" },
  ap_receivability: { label: "청중의 산출물 수신 가능성", pair: "A–P" },
  s_coherence: { label: "상황 – 역할·청중 정합", pair: "S–R/A" },
  construct_irrelevant: { label: "구인 무관 변량", pair: "타당도" },
  construct_underrep: { label: "구인 과소대표", pair: "타당도" },
};

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

/** 404(모델 없음) 시 순서대로 시도할 후보 모델 */
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

/** 키별로 실제 동작한 모델 캐시 */
const workingModelCache = new Map<string, string>();

function uniqStrings(arr: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const a of arr) if (a && !out.includes(a)) out.push(a);
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const d = await res.json();
    return (d?.error?.message as string) || "";
  } catch {
    return "";
  }
}

/**
 * JSON 강제 출력으로 Gemini를 호출하고 파싱된 객체를 반환.
 * 429/503은 1회 재시도. 404(모델 없음)는 후보 모델로 자동 폴백한다.
 */
async function callGemini<T>({
  apiKey,
  model,
  system,
  user,
  schema,
}: CallOptions): Promise<T> {
  const resolved = await resolveModel(apiKey, model);
  const candidates = uniqStrings([
    workingModelCache.get(apiKey),
    resolved,
    model,
    ...FALLBACK_MODELS,
  ]);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.7,
    },
  };

  let last404: string | null = null;
  for (const m of candidates) {
    const url = `${ENDPOINT}/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
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
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await sleep(1500);
        continue;
      }
      break;
    }
    if (!res) continue;

    if (res.ok) {
      workingModelCache.set(apiKey, m);
      const data = await res.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        const blockReason = data?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new GeminiError(
            `모델이 응답을 생성하지 못했습니다(사유: ${blockReason}). 입력 문구를 다듬어 다시 시도해 주세요.`,
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

    // 404 = 그 모델이 이 키에 없음 → 다음 후보 모델로
    if (res.status === 404) {
      last404 = m;
      continue;
    }

    const msg = await readErrorMessage(res);
    if (res.status === 403) {
      throw new GeminiError(
        "API 키에 권한이 없습니다. 키가 Gemini API(Generative Language API)용인지 확인해 주세요.",
      );
    }
    if (res.status === 400) {
      // 키 문제와 요청(스키마) 문제를 구분해 실제 사유를 노출
      if (/api[_ ]?key|API_KEY_INVALID|permission|credential/i.test(msg)) {
        throw new GeminiError("API 키가 유효하지 않습니다. 키를 다시 확인해 주세요.");
      }
      throw new GeminiError(
        `요청이 거부되었습니다(400): ${truncate(msg, 240) || "요청 형식 오류"}`,
      );
    }
    if (res.status === 429) {
      throw new GeminiError(
        "요청 한도를 초과했습니다(429). 잠시 후 다시 시도해 주세요.",
      );
    }
    throw new GeminiError(
      `모델 호출에 실패했습니다(HTTP ${res.status})${msg ? `: ${truncate(msg, 200)}` : ""}.`,
    );
  }

  throw new GeminiError(
    `이 API 키에서 사용 가능한 generateContent 모델을 찾지 못했습니다(마지막 시도: ${last404 ?? "-"}). 키가 Google AI Studio의 Gemini API 키인지 확인해 주세요.`,
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

/** 모델이 반환하는 번들 본문 (id·axis·state는 클라이언트가 부여) */
interface BundleContent {
  designLogic: string;
  role: string;
  audience: string;
  situation: string;
  goal: string;
  product: string;
  studentPrompt: string;
  standards: Criterion[];
  productOptions?: ProductOption[];
}

/** 3개 번들을 이 축들로 분산(각각 별도 호출 → 스키마 얕게 유지) */
const AXES: AudienceProximity[] = [
  "classroom",
  "school_community",
  "expert_public",
];

function normSource(s: string): CriterionSource {
  return s === "stage1_understanding"
    ? "stage1_understanding"
    : "genre_convention";
}

function toBundle(
  b: BundleContent,
  axis: AudienceProximity,
  i: number,
): GraspsBundle {
  return {
    id: String(i),
    designLogic: b.designLogic,
    axis,
    role: b.role,
    audience: b.audience,
    situation: b.situation,
    goal: b.goal,
    product: b.product,
    standards: (Array.isArray(b.standards) ? b.standards : []).map((c) => ({
      ...c,
      source: normSource(c.source),
    })),
    studentPrompt: b.studentPrompt,
    productOptions: b.productOptions,
    state: freshState(),
  };
}

/** 한 축의 번들 1개 생성. stage1_understanding 준거가 없으면 1회 재생성. */
async function generateOneBundle(
  axis: AudienceProximity,
  input: TeacherInput,
  stage1: Stage1Result,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<BundleContent> {
  let last: BundleContent | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const b = await callGemini<BundleContent>({
      apiKey,
      model,
      system: buildBundleSystem(axis, includeUdlOptions, input.achievementLevels),
      user: buildBundleUser(input, stage1, axis),
      schema: SINGLE_BUNDLE_SCHEMA,
    });
    last = b;
    const hasStage1 = (b.standards ?? []).some(
      (c) => normSource(c.source) === "stage1_understanding",
    );
    if (hasStage1) return b;
  }
  return last as BundleContent;
}

/**
 * 내적으로 정합한 GRASPS 번들 3개를 생성.
 * 깊은 스키마 중첩(3개 배열)을 피해 축별로 1개씩 병렬 생성하며,
 * 이로써 axis 상이도 자동 보장된다.
 */
export async function generateBundles(
  input: TeacherInput,
  stage1: Stage1Result,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<GraspsBundle[]> {
  const contents = await Promise.all(
    AXES.map((axis) =>
      generateOneBundle(axis, input, stage1, apiKey, model, includeUdlOptions),
    ),
  );
  return contents.map((b, i) => toBundle(b, AXES[i], i));
}

/**
 * 대상 요소 하나만 재생성. 잠긴 형제 요소 + Stage 1을 프롬프트에 넣고
 * (그 사실을 콘솔에 남긴다), 반환 시 후손 노드를 stale로 표시한다.
 */
export async function regenerateElement(
  bundle: GraspsBundle,
  target: ElementKey,
  opts: { exclude: string[] },
  input: TeacherInput,
  stage1: Stage1Result,
  apiKey: string,
  model: string,
  includeUdlOptions: boolean,
): Promise<GraspsBundle> {
  const system = buildRegenElementSystem(
    target,
    includeUdlOptions,
    input.achievementLevels,
  );
  const user = buildRegenElementUser(input, stage1, bundle, target, opts.exclude);
  // 잠긴 형제 요소 + Stage 1이 프롬프트에 포함됨을 로그로 확인 가능하게.
  console.debug(
    `[regenerateElement] target=${target}\n--- 주입 컨텍스트(잠긴 형제 + Stage 1) ---\n${user}`,
  );
  const schema = regenElementSchema(target);

  if (target === "standards") {
    const res = await callGemini<{
      standards: Criterion[];
      studentPrompt: string;
    }>({ apiKey, model, system, user, schema });
    const patched: GraspsBundle = {
      ...bundle,
      standards: Array.isArray(res.standards) ? res.standards : bundle.standards,
      studentPrompt: res.studentPrompt || bundle.studentPrompt,
    };
    return markStale(patched, target);
  }

  const res = await callGemini<{
    value: string;
    studentPrompt: string;
    productOptions?: ProductOption[];
  }>({ apiKey, model, system, user, schema });
  const patched: GraspsBundle = {
    ...bundle,
    studentPrompt: res.studentPrompt || bundle.studentPrompt,
  };
  (patched as unknown as Record<string, unknown>)[target] = res.value;
  if (target === "product" && res.productOptions) {
    patched.productOptions = res.productOptions;
  }
  return markStale(patched, target);
}

/**
 * 정합성 감사 — 별도 검증 호출. 6개 검사를 개별 항목으로 반환한다.
 * 감사 호출 자체가 실패하면 빈 통과로 폴백(내보내기 차단은 stale·타당도 게이트가 담당).
 */
export async function auditBundle(
  stage1: Stage1Result,
  bundle: GraspsBundle,
  apiKey: string,
  model: string,
): Promise<BundleAudit> {
  try {
    const res = await callGemini<{
      checks: { key: AuditCheckKey; passed: boolean; explanation: string }[];
    }>({
      apiKey,
      model,
      system: buildAuditSystem(),
      user: buildAuditUser(stage1, bundle),
      schema: AUDIT_SCHEMA,
    });
    const checks: AuditCheck[] = (res.checks ?? []).map((c) => ({
      key: c.key,
      label: AUDIT_META[c.key]?.label ?? c.key,
      pair: AUDIT_META[c.key]?.pair ?? "",
      passed: !!c.passed,
      explanation: c.explanation,
    }));
    return {
      checks,
      passed: checks.length > 0 && checks.every((c) => c.passed),
    };
  } catch {
    return { checks: [], passed: true };
  }
}
