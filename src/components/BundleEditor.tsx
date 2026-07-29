import { useState } from "react";
import type { BundleAudit, ElementKey, GraspsBundle, Stage1Result } from "../types";
import { canExport } from "../lib/bundle";
import { markerFor } from "../lib/markers";
import {
  AXIS_LABEL,
  AXIS_SUB,
  DISPLAY_ORDER,
  ELEMENT_META,
  SOURCE_LABEL,
} from "../lib/labels";

interface Props {
  bundle: GraspsBundle;
  stage1: Stage1Result;
  audit: BundleAudit | null;
  auditing: boolean;
  busyElement: ElementKey | null;
  onToggleLock: (key: ElementKey) => void;
  onRegenerate: (key: ElementKey) => void;
  onReaudit: () => void;
  onBack: () => void;
  onCopy: () => void;
  onDownloadMd: () => void;
  onDownloadXlsx: () => void;
  onPrint: () => void;
  onRestart: () => void;
}

export default function BundleEditor(props: Props) {
  const {
    bundle,
    stage1,
    audit,
    auditing,
    busyElement,
    onToggleLock,
    onRegenerate,
    onReaudit,
    onBack,
    onCopy,
    onDownloadMd,
    onDownloadXlsx,
    onPrint,
    onRestart,
  } = props;
  const [copied, setCopied] = useState(false);

  const gate = canExport(bundle);
  const busy = busyElement !== null;

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const stateBadge = (k: ElementKey) => {
    const st = bundle.state[k];
    if (st === "stale")
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300">
          ⚠ 갱신 필요
        </span>
      );
    if (st === "locked")
      return (
        <span className="rounded-full bg-blueprint/10 px-2 py-0.5 text-[11px] font-semibold text-blueprint">
          🔒 잠김
        </span>
      );
    return null;
  };

  const controls = (k: ElementKey) => {
    const st = bundle.state[k];
    const stale = st === "stale";
    const isBusy = busyElement === k;
    return (
      <div className="flex shrink-0 items-center gap-1.5 print:hidden">
        <button
          onClick={() => onToggleLock(k)}
          disabled={busy || stale}
          title={stale ? "먼저 갱신하세요" : "잠그면 다른 요소 재생성 시 컨텍스트로 유지됩니다"}
          className="rounded-md px-2 py-1 text-xs font-semibold text-ink-soft ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          {st === "locked" ? "잠금 해제" : "잠금"}
        </button>
        <button
          onClick={() => onRegenerate(k)}
          disabled={busy}
          className={[
            "rounded-md px-2 py-1 text-xs font-semibold ring-1 disabled:opacity-40",
            stale
              ? "bg-amber-500 text-white ring-amber-500 hover:bg-amber-600"
              : "text-ink ring-paper-line hover:bg-paper",
          ].join(" ")}
        >
          {isBusy ? "생성 중…" : stale ? "이 항목 갱신" : "이것만 다시 생성"}
        </button>
      </div>
    );
  };

  return (
    <div className="rise-in mx-auto max-w-4xl">
      {/* 액션 바 */}
      <div className="sticky top-2 z-10 mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-paper-line bg-paper/90 p-2 shadow-sm backdrop-blur print:hidden">
        <button
          onClick={onPrint}
          disabled={!gate.ok}
          className="rounded-lg bg-blueprint px-3 py-2 text-sm font-semibold text-white hover:bg-blueprint-deep disabled:opacity-40"
        >
          PDF로 저장
        </button>
        <button
          onClick={onDownloadXlsx}
          disabled={!gate.ok}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          엑셀(.xlsx)
        </button>
        <button
          onClick={onDownloadMd}
          disabled={!gate.ok}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          .md 다운로드
        </button>
        <button
          onClick={handleCopy}
          disabled={!gate.ok}
          className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ink ring-1 ring-paper-line hover:bg-paper disabled:opacity-40"
        >
          {copied ? "복사됨 ✓" : "Markdown 복사"}
        </button>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onBack}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
          >
            번들 다시 고르기
          </button>
          <button
            onClick={onRestart}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-line/50"
          >
            새 과제
          </button>
        </div>
      </div>

      {/* 인쇄 전용 제목 */}
      <div className="mb-4 hidden print:block">
        <h1 className="serif text-xl font-bold text-ink">GRASPS 수행평가 설계안</h1>
      </div>

      {/* 내보내기 차단 사유 */}
      {!gate.ok && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden"
        >
          <p className="font-semibold">내보내기가 아직 막혀 있습니다.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {gate.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 설계 논리 헤더 */}
      <section className="mb-6 rounded-xl bg-blueprint p-5 text-paper shadow-sm print:bg-white print:text-ink print:shadow-none print:ring-1 print:ring-paper-line">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-paper print:bg-paper-line/40 print:text-ink-soft">
          {AXIS_LABEL[bundle.axis]} · {AXIS_SUB[bundle.axis]}
        </span>
        <h2 className="serif mt-2 text-lg font-bold leading-snug print:text-ink">
          {bundle.designLogic}
        </h2>
      </section>

      {/* 정합성 감사 */}
      <section
        className={[
          "mb-6 rounded-xl border p-4",
          audit && !audit.passed
            ? "border-rose-300 bg-rose-50/60"
            : "border-emerald-300/60 bg-emerald-50/50",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">
            정합성 감사{" "}
            <span className="font-normal text-ink-soft">
              (쌍 수준 4 + 타당도 2)
            </span>
          </h3>
          <button
            onClick={onReaudit}
            disabled={auditing || busy}
            className="rounded-md px-2 py-1 text-xs font-semibold text-ink-soft ring-1 ring-paper-line hover:bg-white disabled:opacity-40 print:hidden"
          >
            {auditing ? "감사 중…" : "다시 감사"}
          </button>
        </div>
        {auditing && !audit ? (
          <p className="mt-2 text-sm text-ink-soft">감사를 수행하고 있습니다…</p>
        ) : audit && audit.checks.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {audit.checks.map((c) => (
              <li key={c.key} className="flex gap-2 text-sm leading-relaxed">
                <span
                  className={[
                    "mt-0.5 shrink-0 font-bold",
                    c.passed ? "text-emerald-600" : "text-rose-600",
                  ].join(" ")}
                >
                  {c.passed ? "✓" : "✕"}
                </span>
                <span className="text-ink">
                  <span className="font-semibold">
                    [{c.pair}] {c.label}
                  </span>{" "}
                  — {c.explanation}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            감사 결과가 없습니다.
          </p>
        )}
      </section>

      {/* GRASPS 요소 — 잠금 · 재생성 · stale */}
      <section className="space-y-3">
        {DISPLAY_ORDER.map((k) => {
          const meta = ELEMENT_META[k];
          const stale = bundle.state[k] === "stale";
          return (
            <div
              key={k}
              className={[
                "break-inside-avoid rounded-xl bg-white p-4 shadow-sm ring-1",
                stale ? "ring-2 ring-amber-400" : "ring-paper-line",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="serif text-2xl font-bold text-thread">
                  {meta.letter}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {meta.name}
                </span>
                {stateBadge(k)}
                <div className="ml-auto">{controls(k)}</div>
              </div>

              {k === "standards" ? (
                <ul className="mt-3 space-y-3">
                  {bundle.standards.map((c, i) => {
                    const hasU = c.alignedUnderstandingIndex != null;
                    const m = hasU
                      ? markerFor(c.alignedUnderstandingIndex as number)
                      : null;
                    return (
                      <li
                        key={i}
                        className={[
                          "rounded-lg border-l-4 p-3",
                          m ? `${m.edge} ${m.surface}` : "border-paper-line bg-paper/40",
                        ].join(" ")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {m && (
                            <span
                              className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-bold ring-1 ${m.chip}`}
                            >
                              {m.label}
                            </span>
                          )}
                          <span className="font-bold text-ink">{c.label}</span>
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              c.source === "stage1_understanding"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-paper-line/60 text-ink-soft",
                            ].join(" ")}
                          >
                            {SOURCE_LABEL[c.source]}
                          </span>
                        </div>
                        {hasU &&
                          stage1.understandings[
                            c.alignedUnderstandingIndex as number
                          ] && (
                            <p className="mt-1 text-xs text-ink-soft">
                              대응 이해:{" "}
                              {
                                stage1.understandings[
                                  c.alignedUnderstandingIndex as number
                                ]
                              }
                            </p>
                          )}
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                          {c.descriptor}
                        </p>
                        {c.levels && c.levels.length > 0 && (
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full border-collapse text-[13px]">
                              <tbody>
                                {c.levels.map((l, li) => (
                                  <tr
                                    key={li}
                                    className="border-t border-paper-line align-top"
                                  >
                                    <th
                                      scope="row"
                                      className="w-20 whitespace-nowrap py-1.5 pr-3 text-left font-semibold text-blueprint"
                                    >
                                      {l.label}
                                    </th>
                                    <td className="py-1.5 leading-relaxed text-ink">
                                      {l.descriptor}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed text-ink">
                  {bundle[k] as string}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* 학생용 안내문 */}
      <section className="mt-6 break-inside-avoid rounded-xl bg-blueprint p-6 text-paper shadow-sm print:bg-white print:text-ink print:shadow-none print:ring-1 print:ring-paper-line">
        <h3 className="serif text-sm font-bold tracking-wide text-white/80 print:text-ink-soft">
          학생용 과제 안내문
        </h3>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-paper/95 print:text-ink">
          {bundle.studentPrompt}
        </p>
      </section>

      {/* UDL 산출물 옵션 */}
      {bundle.productOptions && bundle.productOptions.length > 0 && (
        <section className="mt-6 rounded-xl bg-white p-5 shadow-sm ring-1 ring-paper-line">
          <h3 className="serif text-sm font-bold text-blueprint">
            산출물 대안 — UDL 행동·표현의 다양화
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {bundle.productOptions.map((o, i) => (
              <li
                key={i}
                className="rounded-lg border border-paper-line bg-paper/50 p-3"
              >
                <p className="text-sm font-semibold text-ink">{o.format}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {o.rationale}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
