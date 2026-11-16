import Link from "next/link";
import { ModuleIcon } from "@/components/art";
import { PhysicsProgressBadge } from "@/components/ProgressBits";

const LOOP = ["予測する", "さわる", "実行", "ズレを採点", "解説で納得"];

const MODULES = [
  { kind: "physics", name: "物理", sub: "力学：摩擦・落下・重力", open: true },
  { kind: "circuit", name: "回路", sub: "電圧・電流・抵抗", open: false },
  { kind: "chem", name: "化学", sub: "中和滴定", open: false },
  { kind: "bio", name: "生物", sub: "遺伝・個体数", open: false },
  { kind: "math", name: "数学", sub: "関数・確率", open: false },
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:py-14">
      <section className="space-y-6">
        <p className="num text-xs font-bold tracking-[0.25em] text-accent">TOUCH LAB / v0</p>
        <h1 className="text-4xl font-black leading-tight sm:text-6xl">
          予想して、
          <br />
          さわって、
          <br />
          <span className="text-accent">たしかめる。</span>
        </h1>
        <p className="max-w-xl leading-relaxed text-muted">
          「さわれる実験室」は、物理の法則を<b className="text-ink">自分の手で</b>試せる学習シミュレーションです。
          結果を見る前に予想して、摩擦・質量・重力・空気抵抗のスライダーを動かし、実行して、予想とのズレで採点。
          最後に「なぜそうなるか」を前提条件つきで解説します。
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/physics/slide"
            className="inline-flex min-h-12 items-center rounded-xl bg-accent px-6 font-black text-accent-ink shadow-[0_0_0_4px_rgba(82,214,255,0.15)] hover:brightness-110"
          >
            ▶ Q1 から始める
          </Link>
          <Link
            href="/physics"
            className="inline-flex min-h-12 items-center rounded-xl border border-line-strong px-6 font-bold hover:border-accent"
          >
            クエスト一覧
          </Link>
        </div>
      </section>

      <section aria-labelledby="loop-h" className="space-y-3">
        <h2 id="loop-h" className="text-sm font-bold tracking-wide text-muted">
          どのクエストも同じ流れ
        </h2>
        <ol className="flex flex-wrap items-center gap-2">
          {LOOP.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-xl border border-line-strong bg-panel/90 px-3 py-2 text-sm font-bold">
                <span className="num grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] text-accent-ink">{i + 1}</span>
                {s}
              </span>
              {i < LOOP.length - 1 && <span className="text-muted" aria-hidden>→</span>}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="map-h" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="map-h" className="text-xl font-black">
            モジュールマップ
          </h2>
          <span className="text-xs text-muted">1分野ずつ増えていく実験室</span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODULES.map((m) => {
            const inner = (
              <>
                <ModuleIcon kind={m.kind} />
                <div>
                  <p className="text-lg font-black" style={{ color: `var(--${m.kind})` }}>
                    {m.name}
                  </p>
                  <p className="text-xs text-muted">{m.sub}</p>
                </div>
                {m.open ? (
                  <div className="mt-auto flex w-full items-center justify-between">
                    <span className="rounded-full bg-physics px-2 py-0.5 text-xs font-black text-accent-ink">開放中</span>
                    <PhysicsProgressBadge />
                  </div>
                ) : (
                  <span className="mt-auto rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">準備中</span>
                )}
              </>
            );
            return (
              <li key={m.kind} className={m.kind === "physics" ? "col-span-2 sm:col-span-1" : ""}>
                {m.open ? (
                  <Link
                    href="/physics"
                    className="flex h-full min-h-44 flex-col items-start gap-3 rounded-2xl border-2 border-physics bg-physics/10 p-4 transition hover:-translate-y-0.5 hover:bg-physics/15"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    aria-disabled
                    className="flex h-full min-h-44 flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong bg-panel/50 p-4 opacity-60"
                  >
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-amber/40 bg-amber/5 p-5 text-sm leading-relaxed">
        <h2 className="mb-2 font-black text-amber">正確さへのこだわり</h2>
        <p className="text-muted">
          見た目だけの物理エンジンではなく、<b className="text-ink">式と細かい刻みの数値計算</b>で動かしています。
          自由落下は理論値 t = √(2h/g) との差が 0.000001 秒未満であることを検証済み。
          解説には「空気抵抗なし」などの<b className="text-ink">前提条件</b>を必ず書いています。
        </p>
      </section>
    </div>
  );
}
