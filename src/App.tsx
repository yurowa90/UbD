import { useState } from "react";
import type {
  BundleAudit,
  ElementKey,
  GraspsBundle,
  Stage1Result,
  TeacherInput,
  WizardStep,
} from "./types";
import {
  DEFAULT_MODEL,
  GeminiError,
  auditBundle,
  generateBundles,
  generateStage1,
  regenerateElement,
} from "./lib/gemini";
import { API_KEY_STORAGE, MODEL_STORAGE, storage } from "./lib/storage";
import {
  copyToClipboard,
  downloadMarkdown,
  downloadXlsx,
  printResult,
  safeBaseName,
  toMarkdown,
} from "./lib/export";
import ApiKeyModal from "./components/ApiKeyModal";
import InputForm from "./components/InputForm";
import Stage1Review from "./components/Stage1Review";
import BundleCards from "./components/BundleCards";
import BundleEditor from "./components/BundleEditor";

const EMPTY_INPUT: TeacherInput = {
  subject: "",
  grade: "",
  standard: "",
  context: "",
};

const STEPS: { id: WizardStep; label: string; sub: string }[] = [
  { id: "input", label: "입력", sub: "성취기준" },
  { id: "stage1", label: "Stage 1 검토", sub: "이해 확정" },
  { id: "bundles", label: "번들 선택", sub: "정합 세트 3" },
  { id: "refine", label: "완성", sub: "감사·내보내기" },
];

export default function App() {
  const [step, setStep] = useState<WizardStep>("input");
  const [input, setInput] = useState<TeacherInput>(EMPTY_INPUT);
  const [stage1, setStage1] = useState<Stage1Result | null>(null);
  const [bundles, setBundles] = useState<GraspsBundle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [audit, setAudit] = useState<BundleAudit | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [busyElement, setBusyElement] = useState<ElementKey | null>(null);
  const [udlOptions, setUdlOptions] = useState(false);

  const [apiKey, setApiKey] = useState(
    () => storage.get(API_KEY_STORAGE) ?? "",
  );
  const [model, setModel] = useState(
    () => storage.get(MODEL_STORAGE) ?? DEFAULT_MODEL,
  );
  const [keyModalOpen, setKeyModalOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const selected = bundles.find((b) => b.id === selectedId) ?? null;

  function saveKey(key: string, m: string) {
    setApiKey(key);
    setModel(m);
    storage.set(API_KEY_STORAGE, key);
    storage.set(MODEL_STORAGE, m);
    setKeyModalOpen(false);
  }

  function reportError(e: unknown) {
    if (e instanceof GeminiError) setError(e.message);
    else setError("알 수 없는 오류가 발생했습니다. 다시 시도해 주세요.");
  }

  // Pass 1: 성취기준 → Stage 1
  async function handleInputSubmit(next: TeacherInput) {
    setInput(next);
    setError(null);
    setBusy(true);
    try {
      const result = await generateStage1(next, apiKey, model);
      setStage1(result);
      setStep("stage1");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  // Stage 1 확정 → 정합 번들 3개 생성
  async function handleStage1Confirm(confirmed: Stage1Result) {
    setStage1(confirmed);
    setError(null);
    setBusy(true);
    try {
      const result = await generateBundles(
        input,
        confirmed,
        apiKey,
        model,
        udlOptions,
      );
      setBundles(result);
      setSelectedId(null);
      setAudit(null);
      setStep("bundles");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  async function runAudit(bundle: GraspsBundle) {
    if (!stage1) return;
    setAuditing(true);
    try {
      const result = await auditBundle(stage1, bundle, apiKey, model);
      setAudit(result);
    } finally {
      setAuditing(false);
    }
  }

  // 번들 카드 선택 → refine + 감사(선택 번들만)
  function handleSelectBundle(id: string) {
    setSelectedId(id);
    setAudit(null);
    setStep("refine");
    const b = bundles.find((x) => x.id === id);
    if (b) void runAudit(b);
  }

  function handleToggleLock(key: ElementKey) {
    if (!selected) return;
    if (selected.state[key] === "stale") return;
    const nextState = selected.state[key] === "locked" ? "generated" : "locked";
    const updated: GraspsBundle = {
      ...selected,
      state: { ...selected.state, [key]: nextState },
    };
    setBundles((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
  }

  async function handleRegenElement(key: ElementKey) {
    if (!selected || !stage1) return;
    setError(null);
    setBusyElement(key);
    try {
      const exclude =
        key === "standards" ? [] : [selected[key] as string].filter(Boolean);
      const updated = await regenerateElement(
        selected,
        key,
        { exclude },
        input,
        stage1,
        apiKey,
        model,
        udlOptions,
      );
      setBundles((bs) => bs.map((b) => (b.id === updated.id ? updated : b)));
      await runAudit(updated);
    } catch (e) {
      reportError(e);
    } finally {
      setBusyElement(null);
    }
  }

  function handleReaudit() {
    if (selected) void runAudit(selected);
  }

  function handleCopy() {
    if (stage1 && selected) copyToClipboard(toMarkdown(input, stage1, selected));
  }
  function handleDownloadMd() {
    if (stage1 && selected)
      downloadMarkdown(
        `${safeBaseName(input)}.md`,
        toMarkdown(input, stage1, selected),
      );
  }
  function handleDownloadXlsx() {
    if (stage1 && selected)
      void downloadXlsx(input, stage1, selected, `${safeBaseName(input)}.xlsx`);
  }
  function handlePrint() {
    printResult(safeBaseName(input));
  }

  function handleRestart() {
    setStep("input");
    setStage1(null);
    setBundles([]);
    setSelectedId(null);
    setAudit(null);
    setError(null);
  }

  return (
    <div className="min-h-screen">
      {/* 헤더 / 히어로 */}
      <header className="blueprint-grid relative overflow-hidden text-paper print:hidden">
        <div className="relative mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blueprint-line">
                Understanding by Design · 정합 GRASPS 설계
              </p>
              <h1 className="serif mt-3 text-3xl font-bold leading-tight sm:text-[2.6rem]">
                이해를 먼저 정하고,
                <br className="hidden sm:block" /> 그 다음에 과제를 설계합니다.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper/80 sm:text-base">
                GRASPS 6요소는 서로 결합돼 있습니다. 슬롯별로 따로 뽑아 조합하면
                부정합 과제가 됩니다. 이 도구는 Stage 1을 확정한 뒤,{" "}
                <strong className="text-white">내적으로 정합한 완성 세트 3개</strong>
                를 만들어 하나를 고르고 정합성을 감사합니다.
              </p>
            </div>
            <button
              onClick={() => setKeyModalOpen(true)}
              className="shrink-0 rounded-lg border border-blueprint-line/60 bg-white/5 px-3 py-2 text-xs font-semibold text-paper/90 backdrop-blur hover:bg-white/10"
            >
              {apiKey ? "API 키 ✓" : "API 키 설정"}
            </button>
          </div>

          {/* 진행 스파인 */}
          <nav aria-label="진행 단계" className="mt-10">
            <ol className="flex items-center gap-2 sm:gap-3">
              {STEPS.map((s, i) => {
                const state =
                  i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
                return (
                  <li
                    key={s.id}
                    className="flex flex-1 items-center gap-2 sm:gap-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-1 transition",
                          state === "active"
                            ? "bg-thread text-white ring-thread"
                            : state === "done"
                              ? "bg-white/90 text-blueprint ring-white/90"
                              : "bg-transparent text-paper/50 ring-blueprint-line/60",
                        ].join(" ")}
                      >
                        {state === "done" ? "✓" : i + 1}
                      </span>
                      <span className="hidden sm:block">
                        <span
                          className={[
                            "block text-sm font-semibold",
                            state === "todo" ? "text-paper/50" : "text-paper",
                          ].join(" ")}
                        >
                          {s.label}
                        </span>
                        <span className="block text-[11px] text-paper/50">
                          {s.sub}
                        </span>
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <span
                        className={[
                          "h-px flex-1",
                          i < stepIndex ? "bg-thread" : "bg-blueprint-line/50",
                        ].join(" ")}
                        aria-hidden
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </header>

      <main className="px-5 py-8 sm:px-8 sm:py-12">
        {error && (
          <div
            role="alert"
            className="mx-auto mb-6 max-w-3xl rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {step === "input" && (
          <InputForm
            initial={input}
            hasApiKey={!!apiKey}
            busy={busy}
            onOpenKey={() => setKeyModalOpen(true)}
            onSubmit={handleInputSubmit}
          />
        )}

        {step === "stage1" && stage1 && (
          <Stage1Review
            value={stage1}
            busy={busy}
            udlOptions={udlOptions}
            onToggleUdl={setUdlOptions}
            onBack={() => setStep("input")}
            onConfirm={handleStage1Confirm}
          />
        )}

        {step === "bundles" && (
          <BundleCards
            bundles={bundles}
            busy={busy}
            onBack={() => setStep("stage1")}
            onSelect={handleSelectBundle}
          />
        )}

        {step === "refine" && stage1 && selected && (
          <BundleEditor
            bundle={selected}
            stage1={stage1}
            audit={audit}
            auditing={auditing}
            busyElement={busyElement}
            onToggleLock={handleToggleLock}
            onRegenerate={handleRegenElement}
            onReaudit={handleReaudit}
            onBack={() => setStep("bundles")}
            onCopy={handleCopy}
            onDownloadMd={handleDownloadMd}
            onDownloadXlsx={handleDownloadXlsx}
            onPrint={handlePrint}
            onRestart={handleRestart}
          />
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-10 text-center text-xs text-ink-soft sm:px-8 print:hidden">
        <p>
          백워드 설계(Wiggins &amp; McTighe, 2005) · UDL Guidelines 3.0(CAST,
          2024) 기반 · BYOK Gemini · 데이터는 브라우저에만 저장됩니다.
        </p>
      </footer>

      <ApiKeyModal
        open={keyModalOpen}
        initialKey={apiKey}
        initialModel={model}
        onSave={saveKey}
        onClose={() => setKeyModalOpen(false)}
      />
    </div>
  );
}
