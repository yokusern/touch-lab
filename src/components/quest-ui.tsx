"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { CLEAR_SCORE, type QuestRecord } from "@/lib/progress";
import { nextQuest, type QuestMeta } from "@/lib/quests";

export type Phase = "predict" | "experiment" | "result";

export function QuestHeader({ meta, phase }: { meta: QuestMeta; phase: Phase }) {
  return (
    <div className="space-y-4">
      <Link href="/physics" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        ← クエスト一覧
      </Link>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="num rounded-md border border-physics/50 bg-physics/10 px-2 py-0.5 text-sm font-bold text-physics">
          物理 {meta.number}
        </span>
        <h1 className="text-2xl font-black sm:text-3xl">{meta.title}</h1>
      </div>
      <Stepper phase={phase} />
    </div>
  );
}

const STEPS: { id: Phase; label: string }[] = [
  { id: "predict", label: "予測する" },
  { id: "experiment", label: "さわって実行" },
  { id: "result", label: "採点と解説" },
];

function Stepper({ phase }: { phase: Phase }) {
  const cur = STEPS.findIndex((s) => s.id === phase);
  return (
    <ol className="grid grid-cols-3 gap-2 text-xs sm:text-sm" aria-label="進み具合">
      {STEPS.map((s, i) => {
        const state = i < cur ? "done" : i === cur ? "now" : "todo";
        return (
          <li
            key={s.id}
            aria-current={state === "now" ? "step" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-2 py-2 sm:px-3 ${
              state === "now"
                ? "border-accent bg-accent/10 text-ink"
                : state === "done"
                  ? "border-line-strong text-muted"
                  : "border-line text-muted/70"
            }`}
          >
            <span
              className={`num grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                state === "now" ? "bg-accent text-accent-ink" : "border border-line-strong"
              }`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="truncate font-medium">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Card({
  title,
  children,
  tone = "default",
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  tone?: "default" | "accent" | "amber";
  className?: string;
}) {
  const border = tone === "accent" ? "border-accent/60" : tone === "amber" ? "border-amber/60" : "border-line-strong";
  return (
    <section className={`rounded-2xl border ${border} bg-panel/90 p-4 sm:p-5 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-bold tracking-wide text-muted">{title}</h2>}
      {children}
    </section>
  );
}

export type Choice = { id: string; label: string; sub?: string };

export function PredictionPanel({
  question,
  choices,
  value,
  onChange,
  locked,
  correctId,
}: {
  question: ReactNode;
  choices: Choice[];
  value: string | null;
  onChange: (id: string) => void;
  locked: boolean;
  correctId?: string; // 結果フェーズで正解を見せる
}) {
  return (
    <div className="space-y-3">
      <p className="font-bold">{question}</p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="予測">
        {choices.map((c) => {
          const selected = value === c.id;
          const isCorrect = correctId !== undefined && c.id === correctId;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => onChange(c.id)}
              className={`min-h-14 rounded-xl border px-3 py-3 text-left transition ${
                isCorrect
                  ? "border-ok bg-ok/10"
                  : selected
                    ? "border-accent bg-accent/20 ring-2 ring-accent/40"
                    : "border-line-strong bg-bg-deep/60 hover:border-accent/60"
              } ${locked && !selected && !isCorrect ? "opacity-50" : ""}`}
            >
              <span className="block font-bold">{c.label}</span>
              {c.sub && <span className="mt-0.5 block text-xs text-muted">{c.sub}</span>}
              {selected && <span className="mt-1 block text-xs font-bold text-accent">✓ あなたの予測</span>}
              {isCorrect && <span className="mt-1 block text-xs font-bold text-ok">正解</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="num text-lg font-bold text-accent">{display}</span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-9 w-20 shrink-0 rounded-full border transition disabled:opacity-45 ${
          checked ? "border-amber bg-amber/25" : "border-line-strong bg-bg-deep"
        }`}
      >
        <span
          className={`num absolute top-1 grid h-7 w-9 place-items-center rounded-full text-xs font-bold transition-all ${
            checked ? "left-10 bg-amber text-accent-ink" : "left-1 bg-panel-2 text-muted"
          }`}
        >
          {checked ? "ON" : "OFF"}
        </span>
      </button>
    </div>
  );
}

export const SPEEDS = [1, 0.5, 0.25] as const;

export function RunControls({
  onRun,
  onReset,
  running,
  speed,
  setSpeed,
  runLabel = "実行する",
}: {
  onRun: () => void;
  onReset: () => void;
  running: boolean;
  speed: number;
  setSpeed: (s: number) => void;
  runLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onRun}
        disabled={running}
        className="min-h-12 flex-1 rounded-xl bg-accent px-5 font-black text-accent-ink shadow-[0_0_0_4px_rgba(82,214,255,0.15)] transition hover:brightness-110 disabled:opacity-50 sm:flex-none"
      >
        {running ? "実行中…" : `▶ ${runLabel}`}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="min-h-12 rounded-xl border border-line-strong px-4 font-bold text-muted hover:text-ink"
      >
        ↺ リセット
      </button>
      <div className="flex items-center gap-1 rounded-xl border border-line-strong p-1" role="group" aria-label="再生速度">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            className={`num min-h-10 rounded-lg px-2.5 text-sm font-bold ${
              speed === s ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {s === 1 ? "等速" : `×${s}`}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Mission({ items }: { items: { label: string; done: boolean }[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((m) => (
        <li key={m.label} className="flex items-start gap-2">
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs font-bold ${
              m.done ? "border-ok bg-ok/20 text-ok" : "border-line-strong text-transparent"
            }`}
            aria-hidden
          >
            ✓
          </span>
          <span className={m.done ? "text-ink" : "text-muted"}>
            {m.label}
            <span className="sr-only">{m.done ? "（達成）" : "（未達成）"}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 w-full rounded-xl bg-ink px-5 font-black text-bg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
    >
      {children}
    </button>
  );
}

/* ───────── 結果 ───────── */

export type ScoreLine = { label: string; points: number; max: number; note?: string };

export function ScoreBoard({ lines, record }: { lines: ScoreLine[]; record: QuestRecord | null }) {
  const total = lines.reduce((s, l) => s + l.points, 0);
  const cleared = total >= CLEAR_SCORE;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">スコア</p>
          <p className="num text-5xl font-black leading-none">
            {total}
            <span className="text-xl text-muted"> / 100</span>
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-black ${
              cleared ? "bg-ok text-accent-ink" : "border border-amber text-amber"
            }`}
          >
            {cleared ? "クリア！" : `あと少し（${CLEAR_SCORE}点でクリア）`}
          </span>
          {record && (
            <p className="num mt-1 text-xs text-muted">
              自己ベスト {record.best} 点 ・ {record.plays} 回目
            </p>
          )}
        </div>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {lines.map((l) => (
          <li key={l.label} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <span>
              <span className="font-bold">{l.label}</span>
              {l.note && <span className="block text-xs text-muted">{l.note}</span>}
            </span>
            <span className="num shrink-0 font-bold">
              {l.points}
              <span className="text-muted">/{l.max}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExplanationCard({
  lines,
  formula,
  assumptions,
}: {
  lines: ReactNode[];
  formula: ReactNode;
  assumptions: string[];
}) {
  return (
    <Card title="解説：なぜそうなる？" tone="accent">
      <ol className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2.5 leading-relaxed">
            <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
              {i + 1}
            </span>
            <span>{l}</span>
          </li>
        ))}
      </ol>
      <div className="num my-4 overflow-x-auto rounded-xl border border-line-strong bg-bg-deep px-4 py-3 text-center text-lg font-bold text-accent">
        {formula}
      </div>
      <div className="rounded-xl border border-amber/40 bg-amber/5 p-3">
        <p className="mb-1 text-xs font-bold text-amber">前提条件（この実験が成り立つ条件）</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
          {assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

const noopSubscribe = () => () => {};

export function ShareBox({ text, path }: { text: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
  const url = `${origin}${path}`;
  const full = `${text}\n${url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = full;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card title="友だちに送る">
      <pre className="whitespace-pre-wrap break-all rounded-xl border border-line bg-bg-deep p-3 text-sm leading-relaxed text-ink">
        {full}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="min-h-11 rounded-xl border border-accent px-4 font-bold text-accent hover:bg-accent/10"
        >
          {copied ? "コピーしました ✓" : "テキストをコピー"}
        </button>
        <a
          href={`https://line.me/R/share?text=${encodeURIComponent(full)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-[#06C755] px-4 font-bold text-white hover:brightness-110"
        >
          LINEで送る
        </a>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? "コピーしました" : ""}
      </p>
    </Card>
  );
}

export function ResultNav({ meta, onRetry }: { meta: QuestMeta; onRetry: () => void }) {
  const next = nextQuest(meta.id);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onRetry}
        className="min-h-12 rounded-xl border border-line-strong px-5 font-bold hover:border-accent"
      >
        ↺ もう一度
      </button>
      {next ? (
        <Link
          href={next.href}
          className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-black text-accent-ink hover:brightness-110"
        >
          次へ：{next.number} {next.title} →
        </Link>
      ) : (
        <Link
          href="/physics"
          className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-black text-accent-ink hover:brightness-110"
        >
          クエスト一覧へ →
        </Link>
      )}
    </div>
  );
}

export const fmt = (x: number, d = 2) => x.toFixed(d);
