import type { GraspsTask, Stage1Result, TeacherInput } from "../types";

/** Stage 1 + GRASPS 결과를 Markdown 문서로 직렬화 */
export function toMarkdown(
  input: TeacherInput,
  stage1: Stage1Result,
  task: GraspsTask,
): string {
  const lines: string[] = [];

  lines.push(`# GRASPS 수행과제 설계안`);
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
  lines.push(`| 요소 | 내용 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| **G** 목표 | ${escapeCell(task.goal)} |`);
  lines.push(`| **R** 역할 | ${escapeCell(task.role)} |`);
  lines.push(`| **A** 청중 | ${escapeCell(task.audience)} |`);
  lines.push(`| **S** 상황 | ${escapeCell(task.situation)} |`);
  lines.push(`| **P** 수행·산출물 | ${escapeCell(task.performanceProduct)} |`);
  lines.push(`| **S** 성공기준 | ${escapeCell(task.standards)} |`);
  lines.push("");

  lines.push(`### 학생용 과제 안내문`);
  lines.push("");
  lines.push(task.studentPrompt);
  lines.push("");

  if (task.productOptions && task.productOptions.length > 0) {
    lines.push(`### 산출물 대안 (UDL — 행동·표현의 다양화)`);
    lines.push("");
    task.productOptions.forEach((o) =>
      lines.push(`- **${o.format}**: ${o.rationale}`),
    );
    lines.push("");
  }

  lines.push(`### 루브릭`);
  lines.push("");
  task.rubric.forEach((c, idx) => {
    const aligned = stage1.understandings[c.alignedUnderstandingIndex];
    lines.push(`#### 준거 ${idx + 1}. ${c.criterion}`);
    if (aligned) lines.push(`> 대응 이해: ${aligned}`);
    lines.push("");
    lines.push(`| 수준 | 서술 |`);
    lines.push(`| --- | --- |`);
    c.levels.forEach((l) =>
      lines.push(`| ${escapeCell(l.label)} | ${escapeCell(l.descriptor)} |`),
    );
    lines.push("");
  });

  return lines.join("\n");
}

function escapeCell(text: string): string {
  return text.replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
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

/** Stage 1 + GRASPS 결과를 .xlsx(개요·GRASPS·루브릭 3시트)로 저장 */
export async function downloadXlsx(
  input: TeacherInput,
  stage1: Stage1Result,
  task: GraspsTask,
  filename: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  type Cell = { value: string; type: StringConstructor; fontWeight?: "bold"; wrap?: boolean };
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
    kv("전이 목표", stage1.transferGoal),
    ...stage1.understandings.map((u, i) => kv(`영속적 이해 ${i + 1}`, u)),
    ...stage1.essentialQuestions.map((q, i) => kv(`본질적 질문 ${i + 1}`, q)),
  );

  // 시트 2 — GRASPS
  const grasps: Cell[][] = [
    [cell("요소", true), cell("내용", true)],
    kv("G 목표", task.goal),
    kv("R 역할", task.role),
    kv("A 청중", task.audience),
    kv("S 상황", task.situation),
    kv("P 수행·산출물", task.performanceProduct),
    kv("S 성공기준", task.standards),
    [cell("학생용 안내문", true), cell(task.studentPrompt)],
  ];
  if (task.productOptions?.length) {
    grasps.push(
      ...task.productOptions.map((o, i) =>
        kv(`산출물 대안 ${i + 1}`, `${o.format} — ${o.rationale}`),
      ),
    );
  }

  // 시트 3 — 루브릭 (준거 × 수준 격자)
  const maxLevels = Math.max(...task.rubric.map((c) => c.levels.length), 0);
  const labelSource =
    task.rubric.find((c) => c.levels.length === maxLevels) ?? task.rubric[0];
  const levelLabels = Array.from({ length: maxLevels }, (_, i) =>
    labelSource?.levels[i]?.label ?? `수준 ${i + 1}`,
  );
  const rubric: Cell[][] = [
    [cell("준거", true), cell("대응 이해", true), ...levelLabels.map((l) => cell(l, true))],
    ...task.rubric.map((c) => [
      cell(c.criterion),
      cell(stage1.understandings[c.alignedUnderstandingIndex] ?? ""),
      ...Array.from({ length: maxLevels }, (_, i) =>
        cell(c.levels[i]?.descriptor ?? ""),
      ),
    ]),
  ];

  const blob = await writeXlsxFile(
    [
      { data: overview, sheet: "개요", columns: [{ width: 18 }, { width: 80 }] },
      { data: grasps, sheet: "GRASPS", columns: [{ width: 18 }, { width: 90 }] },
      {
        data: rubric,
        sheet: "루브릭",
        columns: [
          { width: 30 },
          { width: 30 },
          ...levelLabels.map(() => ({ width: 40 })),
        ],
      },
    ] as never,
    {},
  ).toBlob();
  downloadBlob(blob, filename);
}
