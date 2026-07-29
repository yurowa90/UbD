import type { GraspsBundle } from "../types";
import { AXIS_LABEL, AXIS_SUB, DISPLAY_ORDER, ELEMENT_META } from "../lib/labels";

interface Props {
  bundles: GraspsBundle[];
  busy: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
}

export default function BundleCards({
  bundles,
  busy,
  onBack,
  onSelect,
}: Props) {
  return (
    <div className="rise-in mx-auto max-w-5xl">
      <div className="rounded-xl border border-thread/30 bg-thread-soft/30 px-5 py-4">
        <p className="text-sm leading-relaxed text-ink">
          <strong className="serif">
            내적으로 정합한 완성 세트 3개 중 하나를 고르세요.
          </strong>{" "}
          각 카드는 하나의 설계 논리에서 도출된 GRASPS 6요소 묶음입니다. 청중
          근접성(학급 → 학교·지역 → 전문가·공적)으로 분산돼 있습니다. 요소를
          카드끼리 섞지 않고 <strong>세트 단위로</strong> 선택합니다.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {bundles.map((b) => (
          <article
            key={b.id}
            className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-paper-line transition hover:ring-blueprint/40"
          >
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-blueprint/10 px-2.5 py-1 text-[11px] font-semibold text-blueprint">
              {AXIS_LABEL[b.axis]}
              <span className="font-normal text-blueprint/70">
                · {AXIS_SUB[b.axis]}
              </span>
            </span>

            <h3 className="serif mt-3 text-base font-bold leading-snug text-ink">
              {b.designLogic}
            </h3>

            <dl className="mt-4 flex-1 space-y-2.5">
              {DISPLAY_ORDER.map((k) => {
                const meta = ELEMENT_META[k];
                const value =
                  k === "standards"
                    ? b.standards.map((c) => c.label).join(" · ")
                    : (b[k] as string);
                return (
                  <div key={k} className="flex gap-2">
                    <dt className="serif w-5 shrink-0 text-sm font-bold text-thread">
                      {meta.letter}
                    </dt>
                    <dd className="text-[13px] leading-relaxed text-ink-soft">
                      <span className="font-semibold text-ink">
                        {meta.name.split(" ")[0]}
                      </span>{" "}
                      {value}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <button
              onClick={() => onSelect(b.id)}
              disabled={busy}
              className="mt-5 rounded-lg bg-blueprint px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blueprint-deep disabled:opacity-40"
            >
              이 세트로 다듬기 →
            </button>
          </article>
        ))}
      </div>

      <div className="mt-6">
        <button
          onClick={onBack}
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-paper-line/50 disabled:opacity-40"
        >
          ← Stage 1 수정
        </button>
      </div>
    </div>
  );
}
