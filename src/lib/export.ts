import type {
  AudienceProximity,
  CriterionSource,
  GraspsBundle,
  Stage1Result,
  TeacherInput,
} from "../types";

const AXIS_LABEL: Record<AudienceProximity, string> = {
  classroom: "학급·학년 내부",
  school_community: "학교·지역사회",
  expert_public: "전문가·공적 기관",
};

const SOURCE_LABEL: Record<CriterionSource, string> = {
  stage1_understanding: "이해 기반",
  genre_convention: "장르 관습",
};

/** Stage 1 + 선택된 GRASPS 번들을 Markdown 문서로 직렬화 */
export function toMarkdown(
  input: TeacherInput,
  stage1: Stage1Result,
  bundle: GraspsBundle,
): string {
  const lines: string[] = [];

  lines.push(`# GRASPS 수행평가 설계안`);
  lines.push("");
  lines.push(`- **교과**: ${input.subject || "-"}`);
  lines.push(`- **학년**: ${input.grade || "-"}`);
  if (input.context) lines.push(`- **수업 맥락**: ${input.context}`);
  lines.push("");
  lines.push(`## 성취기준`);
  lines.push("");
  lines.push(input.standard.trim() || "-");
  lines.push("");

  lines.push(`## Stage 1 — 바라는 결과`);
  lines.push("");
  lines.push(`### 전이 목표`);
  lines.push(stage1.transferGoal);
  lines.push("");
  lines.push(`### 영속적 이해`);
  stage1.understandings.forEach((u, i) => lines.push(`${i + 1}. ${u}`));
  lines.push("");
  lines.push(`### 본질적 질문`);
  stage1.essentialQuestions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
  lines.push("");

  lines.push(`## Stage 2 — GRASPS 수행과제`);
  lines.push("");
  lines.push(`> **설계 논리**: ${bundle.designLogic}`);
  lines.push(`> **청중 근접성**: ${AXIS_LABEL[bundle.axis]}`);
  lines.push("");
  lines.push(`| 요소 | 내용 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **G** 목표 | ${escapeCell(bundle.goal)} |`);
  lines.push(`| **R** 역할 | ${escapeCell(bundle.role)} |`);
  lines.push(`| **A** 청중 | ${escapeCell(bundle.audience)} |`);
  lines.push(`| **S** 상황 | ${escapeCell(bundle.situation)} |`);
  lines.push(`| **P** 수행·산출물 | ${escapeCell(bundle.product)} |`);
  lines.push("");

  lines.push(`### 학생용 과제 안내문`);
  lines.push("");
  lines.push(bundle.studentPrompt);
  lines.push("");

  if (bundle.productOptions && bundle.productOptions.length > 0) {
    lines.push(`### 산출물 대안 (UDL — 행동·표현의 다양화)`);
    lines.push("");
    bundle.productOptions.forEach((o) =>
      lines.push(`- **${o.format}**: ${o.rationale}`),
    );
    lines.push("");
  }

  lines.push(`### 성공기준·루브릭 (S — Standards)`);
  lines.push("");
  bundle.standards.forEach((c, idx) => {
    lines.push(`#### 준거 ${idx + 1}. ${c.label} — \`${SOURCE_LABEL[c.source]}\``);
    const aligned =
      c.alignedUnderstandingIndex != null
        ? stage1.understandings[c.alignedUnderstandingIndex]
        : undefined;
    if (aligned) lines.push(`> 대응 이해: ${aligned}`);
    lines.push("");
    lines.push(c.descriptor);
    lines.push("");
    if (c.levels && c.levels.length > 0) {
      lines.push(`| 수준 | 서술 |`);
      lines.push(`| --- | --- |`);
      c.levels.forEach((l) =>
        lines.push(`| ${escapeCell(l.label)} | ${escapeCell(l.descriptor)} |`),
      );
      lines.push("");
    }
  });

  return lines.join("\n");
}

function escapeCell(text: string): string {
  return (text ?? "").replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Blob을 지정한 파일명으로 내려받기 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(filename: string, content: string): void {
  downloadBlob(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
    filename,
  );
}

/** 파일명에 쓸 안전한 기본 이름 */
export function safeBaseName(input: TeacherInput): string {
  const raw = `grasps_${input.subject || "과제"}_${input.grade || ""}`;
  const cleaned = raw.replace(/\s+/g, "").replace(/[^\p{L}\p{N}_-]/gu, "");
  return cleaned || "grasps";
}

/**
 * 브라우저 인쇄로 PDF 저장. 인쇄 대화상자에서 "PDF로 저장"을 선택.
 * 한글 렌더·선택 가능 텍스트를 그대로 유지(라이브러리 불필요).
 */
export function printResult(name: string): void {
  const prev = document.title;
  document.title = name;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  setTimeout(restore, 2000);
  window.print();
}

/** Stage 1 + 번들을 .xlsx(개요·GRASPS·루브릭 3시트)로 저장 */
export async function downloadXlsx(
  input: TeacherInput,
  stage1: Stage1Result,
  bundle: GraspsBundle,
  filename: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  type Cell = {
    value: string;
    type: StringConstructor;
    fontWeight?: "bold";
    wrap?: boolean;
  };
  const cell = (value: string, bold = false): Cell => ({
    value: value ?? "",
    type: String,
    ...(bold ? { fontWeight: "bold" as const } : {}),
    wrap: true,
  });
  const kv = (k: string, v: string) => [cell(k, true), cell(v)];

  // 시트 1 — 개요
  const overview: Cell[][] = [
    [cell("항목", true), cell("내용", true)],
    kv("교과", input.subject || "-"),
    kv("학년", input.grade || "-"),
  ];
  if (input.standardCode) overview.push(kv("성취기준 코드", input.standardCode));
  overview.push(
    kv("성취기준", input.standard || "-"),
    kv("설계 논리", bundle.designLogic),
    kv("청중 근접성", AXIS_LABEL[bundle.axis]),
    kv("전이 목표", stage1.transferGoal),
    ...stage1.understandings.map((u, i) => kv(`영속적 이해 ${i + 1}`, u)),
    ...stage1.essentialQuestions.map((q, i) => kv(`본질적 질문 ${i + 1}`, q)),
  );

  // 시트 2 — GRASPS
  const grasps: Cell[][] = [
    [cell("요소", true), cell("내용", true)],
    kv("G 목표", bundle.goal),
    kv("R 역할", bundle.role),
    kv("A 청중", bundle.audience),
    kv("S 상황", bundle.situation),
    kv("P 수행·산출물", bundle.product),
    [cell("학생용 안내문", true), cell(bundle.studentPrompt)],
  ];
  if (bundle.productOptions?.length) {
    grasps.push(
      ...bundle.productOptions.map((o, i) =>
        kv(`산출물 대안 ${i + 1}`, `${o.format} — ${o.rationale}`),
      ),
    );
  }

  // 시트 3 — 루브릭 (준거 × 수준 격자, 출처 열 포함)
  const maxLevels = Math.max(
    0,
    ...bundle.standards.map((c) => c.levels?.length ?? 0),
  );
  const leveled = maxLevels > 0;
  const labelSource = bundle.standards.find(
    (c) => (c.levels?.length ?? 0) === maxLevels,
  );
  const levelLabels = leveled
    ? Array.from(
        { length: maxLevels },
        (_, i) => labelSource?.levels?.[i]?.label ?? `수준 ${i + 1}`,
      )
    : [];
  const rubricHeader = [
    cell("준거", true),
    cell("출처", true),
    cell("대응 이해", true),
    ...(leveled ? levelLabels.map((l) => cell(l, true)) : [cell("서술", true)]),
  ];
  const rubricRows = bundle.standards.map((c) => {
    const aligned =
      c.alignedUnderstandingIndex != null
        ? (stage1.understandings[c.alignedUnderstandingIndex] ?? "")
        : "";
    const tail = leveled
      ? Array.from({ length: maxLevels }, (_, i) =>
          cell(c.levels?.[i]?.descriptor ?? ""),
        )
      : [cell(c.descriptor)];
    return [cell(c.label), cell(SOURCE_LABEL[c.source]), cell(aligned), ...tail];
  });
  const rubric: Cell[][] = [rubricHeader, ...rubricRows];
  const rubricCols = leveled
    ? [
        { width: 26 },
        { width: 12 },
        { width: 30 },
        ...levelLabels.map(() => ({ width: 38 })),
      ]
    : [{ width: 26 }, { width: 12 }, { width: 30 }, { width: 60 }];

  const blob = await writeXlsxFile(
    [
      { data: overview, sheet: "개요", columns: [{ width: 18 }, { width: 80 }] },
      { data: grasps, sheet: "GRASPS", columns: [{ width: 18 }, { width: 90 }] },
      { data: rubric, sheet: "루브릭", columns: rubricCols },
    ] as never,
    {},
  ).toBlob();
  downloadBlob(blob, filename);
}
