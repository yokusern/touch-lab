"use client";
/* eslint-disable react-hooks/immutability -- 物理の世界（World）は React の外で毎刻み書き換わるオブジェクト。
   画面は SandboxApp の tick で描き直すので、ここで物体・つなぎ目の値を直接書き換えるのは意図どおり。
   React Compiler は使っていない。 */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { G_REAL, MATERIALS, type Body, type Joint, type MaterialId, type World, type WorldSettings } from "@/lib/engine/engine";
import { SAMPLES, type Scene } from "@/lib/engine/scene";
import { deleteExperiment, listSaved, saveExperiment, type SavedExperiment } from "@/lib/engine/storage";

/* ───────── 共通の部品 ───────── */

export function fmtNum(x: number, digits = 3) {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return x.toExponential(2).replace("e+", "e");
  if (a >= 1000) return Math.round(x).toLocaleString("ja-JP");
  return Number(x.toPrecision(digits)).toString();
}

function NumField({
  label,
  value,
  unit,
  onCommit,
  min,
  disabled,
}: {
  label: string;
  value: number;
  unit?: string;
  onCommit: (v: number) => void;
  min?: number;
  disabled?: boolean;
}) {
  // 入力中だけ自分の文字を持ち、それ以外は今の値をそのまま表示する
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft.replace(/,/g, ""));
    setDraft(null);
    if (Number.isFinite(v) && (min === undefined || v >= min)) onCommit(v);
  };
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input
          inputMode="decimal"
          value={draft ?? fmtNum(value, 4)}
          disabled={disabled}
          onFocus={() => setDraft(fmtNum(value, 4))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="num w-24 rounded-md border border-line-strong bg-bg-deep px-2 py-1.5 text-right text-ink disabled:opacity-50"
        />
        {unit && <span className="w-12 text-xs text-muted">{unit}</span>}
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  log,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display: string;
  log?: boolean;
}) {
  const pos = log ? Math.log10(Math.max(value, min)) : value;
  const lo = log ? Math.log10(min) : min;
  const hi = log ? Math.log10(max) : max;
  const fill = ((pos - lo) / (hi - lo)) * 100;
  return (
    <label className="block text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="num text-ink">{display}</span>
      </span>
      <input
        type="range"
        className="slider"
        min={lo}
        max={hi}
        step={log ? (hi - lo) / 200 : (step ?? (max - min) / 100)}
        value={pos}
        style={{ ["--fill" as string]: `${Math.max(0, Math.min(100, fill))}%` }}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(log ? Number((10 ** v).toPrecision(3)) : v);
        }}
      />
    </label>
  );
}

function Check({ label, checked, onChange, sub }: { label: string; checked: boolean; onChange: (v: boolean) => void; sub?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </label>
  );
}

function Chips<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: { label: string; value: T }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onPick(o.value)}
          className={`min-h-9 rounded-lg border px-2.5 text-xs font-bold ${
            o.value === value ? "border-accent bg-accent/15 text-ink" : "border-line-strong text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

/* ───────── サンプル ───────── */

export type AiControls = {
  prompt: string;
  setPrompt: (s: string) => void;
  busy: boolean;
  error: string | null;
  onGenerate: (prompt: string) => void;
};

export function SamplesPanel({
  ai,
  onOpen,
  onBlank,
}: {
  ai: AiControls;
  onOpen: (s: Scene) => void;
  onBlank: () => void;
}) {
  return (
    <div className="space-y-3">
      <form
        className="space-y-2 rounded-xl border-2 border-amber/70 bg-amber/5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          ai.onGenerate(ai.prompt);
        }}
      >
        <label htmlFor="ai-prompt" className="block font-black">
          AI に世界をつくってもらう
        </label>
        <textarea
          id="ai-prompt"
          value={ai.prompt}
          maxLength={120}
          rows={2}
          disabled={ai.busy}
          onChange={(e) => ai.setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              ai.onGenerate(ai.prompt);
            }
          }}
          placeholder="例：もし摩擦がゼロの世界でドミノを倒したら"
          className="w-full rounded-md border border-line-strong bg-bg-deep px-2 py-2 text-sm disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={ai.busy || ai.prompt.trim().length < 2}
          className="w-full rounded-xl bg-amber py-2.5 text-sm font-black text-accent-ink hover:brightness-110 disabled:opacity-50"
        >
          {ai.busy ? "AI が組み立て中…（10〜40秒）" : "AI でつくる"}
        </button>
        {ai.error && (
          <p role="alert" className="rounded-lg border border-bad/60 bg-bad/10 px-2.5 py-2 text-sm">
            {ai.error}
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          書いた文章は Google の AI（Gemini、無料枠）に送られ、Google のサービス改善に使われることがあります。名前や住所など個人的なことは書かないでね。AI のつくる世界はまちがうこともあるので、できたら道具で直してね。
        </p>
      </form>
      <p className="text-sm leading-relaxed text-muted">
        まっさらな世界から、道具で円・箱・坂・ばね・モーターを置いて▶再生。重力や空気の濃さも「世界」タブで自由に変えられます。
      </p>
      <button
        type="button"
        onClick={onBlank}
        className="w-full rounded-xl border border-dashed border-accent/70 px-3 py-3 text-left hover:bg-accent/10"
      >
        <span className="font-black">＋ まっさらな世界からつくる</span>
        <span className="block text-xs text-muted">地面だけがある世界。タイトルは上の欄に好きに書けます</span>
      </button>
      <ul className="space-y-2">
        {SAMPLES.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s.make())}
              className="w-full rounded-xl border border-line-strong px-3 py-2.5 text-left hover:border-accent"
            >
              <span className="font-bold">{s.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        「全人類が東へ走ったら」のような地球規模の実験は{" "}
        <Link href="/whatif" className="text-accent underline underline-offset-2">
          もしも計算機
        </Link>{" "}
        へ。
      </p>
    </div>
  );
}

/* ───────── 物体 ───────── */

const JOINT_NAME: Record<Joint["kind"], string> = { pin: "ピン", rod: "棒", rope: "ひも", spring: "ばね" };

export function InspectorPanel({
  world,
  body,
  playing,
  onBefore,
  onChange,
  onDelete,
}: {
  world: World;
  body: Body | null;
  playing: boolean;
  onBefore: () => void;
  onChange: () => void;
  onDelete: (b: Body) => void;
}) {
  if (!body) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        「つかむ」道具で物体をタップすると、ここで<b className="text-ink">重さ・材質・初速・はねかえり・摩擦</b>を変えたり、
        動いている間の<b className="text-ink">速さやエネルギー</b>を見たりできます。
      </p>
    );
  }
  const b = body;
  const speed = Math.hypot(b.vx, b.vy);
  const ke = 0.5 * b.mass * speed * speed + 0.5 * b.I * b.w * b.w;
  const pe = b.mass * world.settings.gravity * b.y;
  const joints = world.joints.filter((j) => j.a === b || j.b === b);
  const commit = (fn: () => void) => {
    onBefore();
    fn();
    onChange();
  };

  return (
    <div className="space-y-4">
      <Section title="この物体">
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-4 rounded-full border border-line-strong" style={{ background: b.color }} />
          <input
            value={b.label}
            maxLength={40}
            placeholder={b.shape.kind === "circle" ? "円（名前をつけられる）" : "多角形（名前をつけられる）"}
            onChange={(e) => {
              b.label = e.target.value;
              onChange();
            }}
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-bg-deep px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <MaterialPicker value={b.material} onChange={(m) => commit(() => world.setMaterial(b, m))} />
          <Check label="固定する" checked={b.isStatic} onChange={(v) => commit(() => world.setStatic(b, v))} />
        </div>
        <NumField label="質量" unit="kg" value={b.mass} min={1e-6} onCommit={(v) => v > 0 && commit(() => world.setMass(b, v))} />
        <p className="text-[11px] leading-relaxed text-muted">
          {MATERIALS[b.material].name}の密度 {fmtNum(MATERIALS[b.material].density)} kg/m³ × 面積 {fmtNum(b.area)} m² × 奥行き1m
          {Math.abs(b.density - MATERIALS[b.material].density) > 1e-6 && "（質量を直接変更済み）"}
        </p>
      </Section>

      <Section title={playing ? "いまの動き" : "動き（再生すると、この速さで動き出す）"}>
        <div className="grid grid-cols-2 gap-2">
          <Readout label="速さ" value={`${fmtNum(speed)} m/s`} />
          <Readout label="高さ" value={`${fmtNum(b.y)} m`} />
          <Readout label="運動エネルギー" value={`${fmtNum(ke)} J`} />
          <Readout label="位置エネルギー" value={`${fmtNum(pe)} J`} />
        </div>
        {!b.isStatic && (
          <>
            <NumField label="横の速さ（右が＋）" unit="m/s" value={b.vx} disabled={playing} onCommit={(v) => commit(() => (b.vx = v))} />
            <NumField label="縦の速さ（上が＋）" unit="m/s" value={b.vy} disabled={playing} onCommit={(v) => commit(() => (b.vy = v))} />
            <NumField
              label="回転（反時計回りが＋）"
              unit="rad/s"
              value={b.w}
              disabled={playing}
              onCommit={(v) => commit(() => (b.w = v))}
            />
          </>
        )}
      </Section>

      <Section title="ぶつかったとき">
        <Slider
          label="はねかえり（0=くっつく, 1=同じ速さではね返る）"
          value={b.restitution}
          min={0}
          max={1}
          step={0.01}
          display={b.restitution.toFixed(2)}
          onChange={(v) => {
            b.restitution = v;
            onChange();
          }}
        />
        <Slider
          label="摩擦係数 μ（0=つるつる）"
          value={b.friction}
          min={0}
          max={1.5}
          step={0.01}
          display={b.friction.toFixed(2)}
          onChange={(v) => {
            b.friction = v;
            onChange();
          }}
        />
      </Section>

      {joints.length > 0 && (
        <Section title="つなぎ目">
          <ul className="space-y-3">
            {joints.map((j) => (
              <li key={j.id} className="space-y-2 rounded-lg border border-line p-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold">
                    {j.motor ? "モーター" : JOINT_NAME[j.kind]}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {j.b ? "物体どうし" : "空中に固定"}
                      {j.kind !== "pin" && ` ・ 長さ ${fmtNum(j.length)} m`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => commit(() => world.removeJoint(j))}
                    className="text-xs text-bad underline underline-offset-2"
                  >
                    外す
                  </button>
                </div>
                {j.kind === "spring" && (
                  <>
                    <Slider
                      label="ばね定数 k（かたさ）"
                      value={j.k}
                      min={1}
                      max={1e6}
                      log
                      display={`${fmtNum(j.k)} N/m`}
                      onChange={(v) => {
                        j.k = v;
                        onChange();
                      }}
                    />
                    <Slider
                      label="減衰（ゆれが止まりやすい）"
                      value={j.c}
                      min={0.01}
                      max={1e5}
                      log
                      display={`${fmtNum(j.c)} N·s/m`}
                      onChange={(v) => {
                        j.c = v;
                        onChange();
                      }}
                    />
                  </>
                )}
                {(j.kind === "spring" || j.kind === "rod" || j.kind === "rope") && (
                  <NumField
                    label={j.kind === "spring" ? "自然の長さ" : "長さ"}
                    unit="m"
                    value={j.length}
                    min={0}
                    onCommit={(v) => commit(() => (j.length = v))}
                  />
                )}
                {j.kind === "pin" && (
                  <>
                    <Check
                      label="モーターで回す"
                      checked={j.motor}
                      onChange={(v) =>
                        commit(() => {
                          j.motor = v;
                          if (v && j.motorSpeed === 0) j.motorSpeed = -4;
                        })
                      }
                    />
                    {j.motor && (
                      <>
                        <Slider
                          label="回転の速さ（＋は反時計回り）"
                          value={j.motorSpeed}
                          min={-30}
                          max={30}
                          step={0.5}
                          display={`${fmtNum(j.motorSpeed)} rad/s`}
                          onChange={(v) => {
                            j.motorSpeed = v;
                            onChange();
                          }}
                        />
                        <Slider
                          label="モーターの強さ（最大トルク）"
                          value={j.maxTorque}
                          min={10}
                          max={1e7}
                          log
                          display={`${fmtNum(j.maxTorque)} N·m`}
                          onChange={(v) => {
                            j.maxTorque = v;
                            onChange();
                          }}
                        />
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <button
        type="button"
        onClick={() => onDelete(b)}
        className="w-full rounded-xl border border-bad/60 py-2.5 text-sm font-bold text-bad hover:bg-bad/10"
      >
        この物体を消す
      </button>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg-deep/60 px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num text-sm font-bold">{value}</div>
    </div>
  );
}

/* ───────── 世界 ───────── */

const GRAVITY_PRESETS = [
  { label: "無重力", value: 0 },
  { label: "月 1.62", value: 1.62 },
  { label: "火星 3.71", value: 3.71 },
  { label: "地球 9.81", value: 9.81 },
  { label: "木星 24.8", value: 24.79 },
  { label: "太陽の表面 274", value: 274 },
];

const AIR_PRESETS = [
  { label: "火星 0.02", value: 0.02 },
  { label: "地球 1.2", value: 1.2 },
  { label: "10倍 12", value: 12 },
  { label: "金星 65", value: 65 },
];

export function WorldPanel({
  settings,
  onChange,
  showTrails,
  setShowTrails,
  showVectors,
  setShowVectors,
}: {
  settings: WorldSettings;
  onChange: (p: Partial<WorldSettings>) => void;
  showTrails: boolean;
  setShowTrails: (v: boolean) => void;
  showVectors: boolean;
  setShowVectors: (v: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Section title="重力（下向き）">
        <Chips options={GRAVITY_PRESETS} value={settings.gravity} onPick={(v) => onChange({ gravity: v })} />
        <NumField
          label="重力加速度（マイナスで上向き）"
          unit="m/s²"
          value={settings.gravity}
          onCommit={(v) => onChange({ gravity: Math.max(-1000, Math.min(1000, v)) })}
        />
      </Section>

      <Section title="空気抵抗">
        <Check
          label="空気抵抗あり"
          sub="F = ½ρC_dAv²（C_d=1、奥行き1mの物体として計算）"
          checked={settings.airOn}
          onChange={(v) => onChange({ airOn: v })}
        />
        {settings.airOn && (
          <>
            <Chips options={AIR_PRESETS} value={settings.airDensity} onPick={(v) => onChange({ airDensity: v })} />
            <Slider
              label="空気の濃さ ρ"
              value={settings.airDensity}
              min={0.001}
              max={1000}
              log
              display={`${fmtNum(settings.airDensity)} kg/m³`}
              onChange={(v) => onChange({ airDensity: v })}
            />
          </>
        )}
      </Section>

      <Section title="万有引力（物体どうしが引き合う）">
        <Check
          label="物体どうしが引き合う"
          sub="F = G·m₁m₂/r²。星や惑星の動きの実験に"
          checked={settings.attraction > 0}
          onChange={(v) => onChange({ attraction: v ? 1e-6 : 0 })}
        />
        {settings.attraction > 0 && (
          <>
            <Slider
              label="引き合う強さ G"
              value={settings.attraction}
              min={1e-11}
              max={1e-1}
              log
              display={`${settings.attraction.toExponential(1)}`}
              onChange={(v) => onChange({ attraction: v })}
            />
            <p className="text-[11px] leading-relaxed text-muted">
              本物の G は {G_REAL.toExponential(3)}。身近な重さでは弱すぎて見えないので、大きくして観察できます（約
              {fmtNum(settings.attraction / G_REAL)} 倍）。
            </p>
          </>
        )}
      </Section>

      <Section title="時間と表示">
        <Slider
          label="再生速度"
          value={settings.timeScale}
          min={0.05}
          max={8}
          log
          display={`×${fmtNum(settings.timeScale, 2)}`}
          onChange={(v) => onChange({ timeScale: v })}
        />
        <Check label="通ったあと（軌跡）を表示" checked={showTrails} onChange={setShowTrails} />
        <Check label="速度の矢印を表示" sub="矢印の先 = 0.25秒後にいる場所の目安" checked={showVectors} onChange={setShowVectors} />
      </Section>
    </div>
  );
}

/* ───────── 保存・共有 ───────── */

export function SavePanel({
  title,
  setTitle,
  note,
  setNote,
  getScene,
  encode,
  onOpen,
}: {
  title: string;
  setTitle: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  getScene: () => Scene;
  encode: (s: Scene) => Promise<string>;
  onOpen: (s: Scene) => void;
}) {
  // このパネルはタブを開いたとき（ブラウザの中）でだけ表示されるので、最初から読み込める
  const [saved, setSaved] = useState<SavedExperiment[]>(() => (typeof window === "undefined" ? [] : listSaved()));
  const [url, setUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((x) => (x === m ? null : x)), 2500);
  };

  const makeLink = async () => {
    const code = await encode(getScene());
    const u = `${window.location.origin}/sandbox#w=${code}`;
    setUrl(u);
    try {
      await navigator.clipboard.writeText(u);
      flash("共有リンクをコピーしました");
    } catch {
      flash("下のリンクを長押し（右クリック）でコピーしてね");
    }
  };

  return (
    <div className="space-y-4">
      <Section title="実験の名前とメモ">
        <input
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：もし重力が月くらいだったら積み木はどうくずれる？"
          className="w-full rounded-md border border-line-strong bg-bg-deep px-2 py-2 text-sm"
        />
        <textarea
          value={note}
          maxLength={600}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="予想・条件・わかったことのメモ"
          className="w-full rounded-md border border-line-strong bg-bg-deep px-2 py-2 text-sm"
        />
      </Section>

      <Section title="この端末に保存">
        <button
          type="button"
          onClick={() => {
            const rec = saveExperiment(getScene());
            if (rec) {
              setSaved(listSaved());
              flash(`「${rec.title}」を保存しました`);
            } else flash("保存できませんでした（ブラウザの保存領域が使えない設定かもしれません）");
          }}
          className="w-full rounded-xl bg-accent py-2.5 text-sm font-black text-accent-ink hover:brightness-110"
        >
          保存する
        </button>
        <p className="text-[11px] text-muted">再生中なら、再生を始める前の状態を保存します。</p>
        {saved.length > 0 && (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.title}</span>
                  <span className="num text-[11px] text-muted">{new Date(s.savedAt).toLocaleString("ja-JP")}</span>
                </span>
                <button type="button" onClick={() => onOpen(s.scene)} className="text-xs font-bold text-accent">
                  開く
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`「${s.title}」を消しますか？`)) return;
                    deleteExperiment(s.id);
                    setSaved(listSaved());
                  }}
                  className="text-xs text-muted hover:text-bad"
                >
                  消す
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="友だちに送る">
        <button
          type="button"
          onClick={makeLink}
          className="w-full rounded-xl border border-line-strong py-2.5 text-sm font-bold hover:border-accent"
        >
          共有リンクをつくってコピー
        </button>
        {url && (
          <>
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="num w-full rounded-md border border-line bg-bg-deep px-2 py-1.5 text-[11px] text-muted"
            />
            <a
              href={`https://line.me/R/share?text=${encodeURIComponent(`${title}｜さわれる実験室でつくった実験\n${url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-xl bg-[#06c755] py-2.5 text-center text-sm font-black text-white"
            >
              LINEで送る
            </a>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-muted">
          リンクの中に実験の中身がまるごと入っています。サーバーには何も保存されません。
        </p>
      </Section>
      {msg && (
        <p role="status" className="rounded-lg border border-accent/60 bg-accent/10 px-3 py-2 text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}

export function MaterialPicker({ value, onChange }: { value: MaterialId; onChange: (m: MaterialId) => void }) {
  return (
    <label className="flex items-center gap-1">
      材質
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MaterialId)}
        className="rounded border border-line-strong bg-bg-deep px-1 py-0.5 text-ink"
      >
        {MATERIAL_OPTIONS.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

const MATERIAL_OPTIONS: [MaterialId, string][] = [
  ["wood", "木"],
  ["metal", "鉄"],
  ["rubber", "ゴム"],
  ["ice", "氷"],
  ["stone", "石"],
  ["foam", "発泡スチロール"],
];

