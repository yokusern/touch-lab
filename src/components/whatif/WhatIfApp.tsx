"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, ExplanationCard, ParamSlider, ShareBox } from "@/components/quest-ui";
import {
  SCENARIOS,
  defaults,
  humanLen,
  humanSpeed,
  humanTime,
  plain,
  sci,
  scenarioById,
  type Param,
  type Result,
  type Scenario,
} from "@/lib/whatif";

export default function WhatIfApp() {
  const [id, setId] = useState(SCENARIOS[0].id);
  const [values, setValues] = useState<Record<string, Record<string, number>>>({});
  const [custom, setCustom] = useState("");

  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (scenarioById(h)) setId(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const s = scenarioById(id) ?? SCENARIOS[0];
  const v = values[s.id] ?? defaults(s);
  const result = useMemo(() => s.compute(v), [s, v]);

  const pick = (next: string) => {
    setId(next);
    history.replaceState(null, "", `#${next}`);
    document.getElementById("whatif-detail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setParam = (key: string, val: number) => setValues((all) => ({ ...all, [s.id]: { ...v, [key]: val } }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <p className="num text-xs font-bold tracking-[0.25em] text-amber">WHAT IF / もしも計算機</p>
        <h1 className="text-3xl font-black sm:text-4xl">地球規模の「もしも」を計算する</h1>
        <p className="max-w-2xl leading-relaxed text-muted">
          箱やボールでは試せない大きな実験は、実際の物理の式と測定値で計算します。数字を動かすと、結果とくらべる「ものさし」がその場で変わります。
        </p>
      </header>

      <section aria-label="もしもの一覧" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => pick(sc.id)}
            aria-pressed={sc.id === s.id}
            className={`rounded-2xl border p-4 text-left transition ${
              sc.id === s.id ? "border-amber bg-amber/10" : "border-line-strong bg-panel/90 hover:border-amber/70"
            }`}
          >
            <span className="block font-black leading-snug">{sc.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{sc.question}</span>
          </button>
        ))}
        <div className="rounded-2xl border border-dashed border-accent/70 bg-panel/60 p-4">
          <label htmlFor="custom-whatif" className="block font-black">
            自分の「もしも」をつくる
          </label>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            タイトルを書いて、自由実験室で世界をつくろう。重力・空気の濃さ・引き合う力も変えられる。
          </p>
          <input
            id="custom-whatif"
            value={custom}
            maxLength={80}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="例：もし摩擦がゼロの世界でドミノを倒したら"
            className="mt-2 w-full rounded-md border border-line-strong bg-bg-deep px-2 py-2 text-sm"
          />
          <Link
            href={`/sandbox#t=${encodeURIComponent(custom.trim() || "わたしのもしも実験")}`}
            className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-accent px-4 text-sm font-black text-accent-ink hover:brightness-110"
          >
            自由実験室でつくる →
          </Link>
        </div>
      </section>

      <section id="whatif-detail" className="scroll-mt-20 space-y-5">
        <div className="space-y-1">
          <h2 className="text-2xl font-black sm:text-3xl">{s.title}</h2>
          <p className="text-muted">{s.question}</p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card title="条件を変える">
            <div className="space-y-5">
              {s.params.map((p) => (
                <ParamControl key={p.key} p={p} value={v[p.key]} onChange={(x) => setParam(p.key, x)} />
              ))}
              <button
                type="button"
                onClick={() => setValues((all) => ({ ...all, [s.id]: defaults(s) }))}
                className="text-xs text-muted underline underline-offset-4 hover:text-ink"
              >
                最初の値に戻す
              </button>
            </div>
          </Card>

          <div className="space-y-5">
            <ResultCard r={result} />
            {s.visual === "tunnel" && <TunnelVisual offset={v.offset ?? 0} />}
          </div>
        </div>

        {result.ruler && <Ruler r={result.ruler} />}

        <ExplanationCard lines={s.why} formula={s.formula} assumptions={s.assumptions} />

        <ShareBox text={`${s.title}？→ ${result.headline}：${result.big}｜さわれる実験室のもしも計算機`} path={`/whatif#${s.id}`} />
      </section>
    </div>
  );
}

function ParamControl({ p, value, onChange }: { p: Param; value: number; onChange: (v: number) => void }) {
  const presetOnly = p.unit === "";
  return (
    <div className="space-y-2">
      {presetOnly ? (
        <span className="text-sm font-bold">{p.label}</span>
      ) : p.log ? (
        <LogSlider p={p} value={value} onChange={onChange} />
      ) : (
        <ParamSlider
          label={p.label}
          value={value}
          min={p.min}
          max={p.max}
          step={p.step}
          onChange={onChange}
          display={`${plain(value)} ${p.unit}`}
        />
      )}
      {p.presets && (
        <div className="flex flex-wrap gap-1.5">
          {p.presets.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={Math.abs(o.value - value) < 1e-9}
              className={`min-h-9 rounded-lg border px-2.5 text-xs font-bold ${
                Math.abs(o.value - value) < 1e-9 ? "border-amber bg-amber/15 text-ink" : "border-line-strong text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LogSlider({ p, value, onChange }: { p: Param; value: number; onChange: (v: number) => void }) {
  const lo = Math.log10(p.min);
  const hi = Math.log10(p.max);
  const pos = Math.log10(Math.max(p.min, value));
  return (
    <ParamSlider
      label={p.label}
      value={pos}
      min={lo}
      max={hi}
      step={(hi - lo) / 300}
      onChange={(x) => onChange(Number((10 ** x).toPrecision(3)))}
      display={`${plain(value)} ${p.unit}`}
    />
  );
}

function ResultCard({ r }: { r: Result }) {
  return (
    <Card title="結果" tone="amber">
      <p className="text-sm font-bold text-muted">{r.headline}</p>
      <p className="num mt-1 break-words text-4xl font-black text-amber sm:text-5xl">{r.big}</p>
      <p className="mt-2 text-sm leading-relaxed">{r.sub}</p>
      <dl className="mt-4 divide-y divide-line border-t border-line">
        {r.rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
            <dt className="text-muted">{row.label}</dt>
            <dd className="num font-bold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const fmtBy = {
  time: humanTime,
  len: humanLen,
  speed: humanSpeed,
  energy: (x: number) => `${sci(x)} J`,
  ratio: (x: number) => `${plain(x, 3)} 倍`,
};

/** 対数の「ものさし」: 何けたちがうかを棒の長さで見る */
function Ruler({ r }: { r: NonNullable<Result["ruler"]> }) {
  const items = [...r.refs.map((x) => ({ ...x, me: false })), { label: r.valueLabel, value: r.value, me: true }].sort(
    (a, b) => a.value - b.value,
  );
  const logs = items.map((x) => Math.log10(Math.max(x.value, 1e-300)));
  const lo = Math.min(...logs) - 0.5;
  const hi = Math.max(...logs) + 0.2;
  const f = fmtBy[r.fmt];
  return (
    <Card title={`ものさし：${r.title}`}>
      <p className="-mt-1 mb-3 text-xs text-muted">棒の長さは「けた数」。1目もり右にいくごとに10倍です。</p>
      <ul className="space-y-2.5">
        {items.map((x, i) => {
          const w = ((logs[i] - lo) / (hi - lo)) * 100;
          return (
            <li key={x.label} className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className={x.me ? "font-black text-amber" : "text-ink"}>{x.me ? `▶ ${x.label}` : x.label}</span>
                <span className={`num ${x.me ? "font-black text-amber" : "text-muted"}`}>{f(x.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-bg-deep">
                <div
                  className={`h-full rounded-full ${x.me ? "bg-amber" : "bg-line-strong"}`}
                  style={{ width: `${Math.max(2, Math.min(100, w))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** 星を貫く穴を、単振動で行き来する様子（easeInOutSine は単振動の動きそのもの） */
function TunnelVisual({ offset }: { offset: number }) {
  const R = 90;
  const d = (offset / 100) * R;
  const half = Math.sqrt(Math.max(0, R * R - d * d));
  return (
    <Card title="穴の中の動き（単振動）">
      <svg viewBox="-110 -110 220 220" className="mx-auto block w-full max-w-[260px]" role="img" aria-label="星を貫く穴を行き来する様子">
        <circle r={R} fill="#12305a" stroke="var(--line-strong)" />
        <circle r={R * 0.55} fill="#18406f" />
        <circle r={R * 0.2} fill="#ffbe55" opacity="0.5" />
        <line x1={-half} y1={d} x2={half} y2={d} stroke="var(--ink)" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
        <circle r={7} cy={d} fill="var(--accent)" className="tunnel-dot" style={{ ["--half" as string]: `${half}px` }} />
      </svg>
      <style>{`
        .tunnel-dot { animation: tunnel-swing 3.2s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate; transform: translateX(calc(-1 * var(--half))); }
        @keyframes tunnel-swing { to { transform: translateX(var(--half)); } }
        @media (prefers-reduced-motion: reduce) { .tunnel-dot { animation: none; } }
      `}</style>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        まん中でいちばん速く、出口で一瞬止まって戻ってくる。通り道をずらすと穴は短くなるが、中を引く力も弱くなるので、時間は同じ。
      </p>
    </Card>
  );
}

export type { Scenario };
