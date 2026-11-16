"use client";

import { useState } from "react";
import { COLORS, SimCanvas, drawGrid, label, useSimClock, type DrawFn } from "@/components/sim";
import {
  Card,
  ExplanationCard,
  Mission,
  ParamSlider,
  PredictionPanel,
  PrimaryButton,
  QuestHeader,
  ResultNav,
  RunControls,
  ScoreBoard,
  ShareBox,
  fmt,
  type Choice,
  type Phase,
  type ScoreLine,
} from "@/components/quest-ui";
import { G_EARTH, fallDistanceAt, requiredGravity, simulateFall, type FallResult } from "@/lib/physics";
import { saveResult, type QuestRecord } from "@/lib/progress";
import { questById } from "@/lib/quests";

const meta = questById("gravity");
const TOLERANCE = 0.05;

const CHALLENGES = [
  { h: 10, T: 2.5 },
  { h: 20, T: 1.2 },
  { h: 5, T: 3.0 },
  { h: 20, T: 2.0 },
  { h: 15, T: 0.8 },
];

const PRESETS = [
  { name: "月", g: 1.62 },
  { name: "火星", g: 3.71 },
  { name: "地球", g: G_EARTH },
  { name: "木星", g: 24.79 },
  { name: "重力10倍", g: 98.1 },
];

const CHOICES: Choice[] = [
  { id: "stronger", label: "地球より強くする", sub: "引っぱる力を強く" },
  { id: "same", label: "地球のままでいい", sub: "ほぼ地球の重力" },
  { id: "weaker", label: "地球より弱くする", sub: "引っぱる力を弱く" },
];

const G_MIN = 0.5;
const G_MAX = 100;
const clampG = (g: number) => Math.min(G_MAX, Math.max(G_MIN, Math.round(g * 100) / 100));

function correctChoice(h: number, T: number) {
  const need = requiredGravity(h, T);
  if (Math.abs(need - G_EARTH) / G_EARTH <= TOLERANCE) return "same";
  return need > G_EARTH ? "stronger" : "weaker";
}

/** 誤差率 → 調整の得点（50点満点）。±5%以内なら 40〜50点。 */
function tuningPoints(err: number) {
  if (err <= TOLERANCE) return Math.round(50 - (err / TOLERANCE) * 10);
  return Math.max(0, Math.round(40 * (1 - (err - TOLERANCE) / 0.25)));
}

type Run = { g: number; time: number; err: number };

export default function GravityQuest() {
  const [ci, setCi] = useState(0);
  const { h, T } = CHALLENGES[ci];
  const [phase, setPhase] = useState<Phase>("predict");
  const [prediction, setPrediction] = useState<string | null>(null);
  const [g, setG] = useState(G_EARTH);
  const [speed, setSpeed] = useState(1);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<{ res: FallResult; g: number } | null>(null);
  const [record, setRecord] = useState<QuestRecord | null>(null);
  const clock = useSimClock();

  const answer = correctChoice(h, T);
  const need = requiredGravity(h, T);

  const run = () => {
    const res = simulateFall({ height: h, mass: 1, g, drag: false });
    setActive({ res, g });
    const play = Math.max(speed, res.landTime / 10);
    const gg = g;
    clock.start(res.landTime, play, () =>
      setRuns((rs) => [...rs, { g: gg, time: res.landTime, err: Math.abs(res.landTime - T) / T }]),
    );
  };

  const reset = () => {
    clock.reset();
    setActive(null);
  };

  const best = runs.length ? runs.reduce((a, b) => (b.err < a.err ? b : a)) : null;
  const hit = best !== null && best.err <= TOLERANCE;
  const correct = prediction === answer;
  const predLabel = CHOICES.find((c) => c.id === prediction)?.label ?? "—";
  const answerLabel = CHOICES.find((c) => c.id === answer)!.label;

  const scoreLines: ScoreLine[] = [
    { label: "予測", points: correct ? 50 : 0, max: 50, note: `あなたの予測：${predLabel}（正解：${answerLabel}）` },
    {
      label: "調整：目標タイムとの誤差",
      points: best ? tuningPoints(best.err) : 0,
      max: 50,
      note: best
        ? `ベスト ${fmt(best.time)} 秒（目標 ${fmt(T)} 秒・誤差 ${fmt(best.err * 100, 1)}%）／ ±5%以内で40点以上`
        : "まだ実行していません",
    },
  ];
  const total = scoreLines.reduce((s, l) => s + l.points, 0);

  const toResult = () => {
    clock.reset();
    setRecord(saveResult(meta.id, total));
    setPhase("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const retry = () => {
    clock.reset();
    setActive(null);
    setRuns([]);
    setPrediction(null);
    setRecord(null);
    setG(G_EARTH);
    setCi((i) => (i + 1) % CHALLENGES.length);
    setPhase("predict");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const presetName = PRESETS.find((p) => Math.abs(p.g - g) < 1e-9)?.name;
  const shareText = [
    `【さわれる実験室】${meta.number} ${meta.title} ${total}点`,
    `お題：高さ${h}mの落下を${fmt(T)}秒にせよ`,
    `予測「${predLabel}」→ ${correct ? "正解！" : "はずれ…"}`,
    best ? `重力 ${fmt(best.g)} m/s² で ${fmt(best.time)}秒（誤差${fmt(best.err * 100, 1)}%）${best.err <= TOLERANCE ? "ミッション達成！" : ""}` : "",
    "あなたは何m/s²にする？",
  ]
    .filter(Boolean)
    .join("\n");

  const draw: DrawFn = (ctx, w, hh) =>
    drawGravity(ctx, w, hh, { t: clock.t, active, g: active?.g ?? g, h, T, running: clock.running, presetName });

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <QuestHeader meta={meta} phase={phase} />

      <Card title="お題">
        <p className="leading-relaxed">
          高さ <b className="num">{h} m</b> から落とした球が、ちょうど <b className="num">{fmt(T)} 秒</b> で地面に着くようにしたい。
          重力の強さ（重力加速度 g）を変えて、落下時間を<b>目標の ±5% 以内</b>に合わせよう。
        </p>
        {phase === "predict" && (
          <button
            type="button"
            onClick={() => {
              setCi((i) => (i + 1) % CHALLENGES.length);
              setPrediction(null);
            }}
            className="mt-3 text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            別のお題にする（{ci + 1}/{CHALLENGES.length}）
          </button>
        )}
      </Card>

      {phase !== "result" && (
        <Card title="① 予測する" tone={phase === "predict" ? "accent" : "default"}>
          <PredictionPanel
            question={`地球（g = ${G_EARTH}）で落とすと ${fmt(Math.sqrt((2 * h) / G_EARTH))} 秒かかります。目標の ${fmt(T)} 秒にするには、重力をどうする？`}
            choices={CHOICES}
            value={prediction}
            onChange={setPrediction}
            locked={phase !== "predict"}
          />
          {phase === "predict" && (
            <div className="mt-4">
              <PrimaryButton onClick={() => setPhase("experiment")} disabled={!prediction}>
                この予測で実験へ進む →
              </PrimaryButton>
            </div>
          )}
        </Card>
      )}

      {phase === "experiment" && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <SimCanvas draw={draw} aspect={1.2} maxHeight={560} label="重力を変えて球を落とすシミュレーション" />
            <RunControls onRun={run} onReset={reset} running={clock.running} speed={speed} setSpeed={setSpeed} runLabel="落とす" />
          </div>
          <div className="space-y-4">
            <Card title="② パラメータをさわる" tone="accent">
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-bold">プリセット</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.name}
                        type="button"
                        disabled={clock.running}
                        onClick={() => setG(p.g)}
                        aria-pressed={presetName === p.name}
                        className={`min-h-10 rounded-lg border px-3 text-sm font-bold disabled:opacity-45 ${
                          presetName === p.name ? "border-accent bg-accent/15" : "border-line-strong hover:border-accent/60"
                        }`}
                      >
                        {p.name}
                        <span className="num ml-1 text-xs font-normal text-muted">{p.g}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <ParamSlider
                  label="重力加速度 g（カスタム）"
                  value={g}
                  min={G_MIN}
                  max={G_MAX}
                  step={0.01}
                  onChange={(v) => setG(clampG(v))}
                  display={`${fmt(g)} m/s²`}
                  disabled={clock.running}
                />
                <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="重力の微調整">
                  {[-1, -0.1, 0.1, 1].map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={clock.running}
                      onClick={() => setG((x) => clampG(x + d))}
                      className="num min-h-11 rounded-lg border border-line-strong text-sm font-bold hover:border-accent disabled:opacity-45"
                    >
                      {d > 0 ? `+${d}` : d}
                    </button>
                  ))}
                </div>
                <p className="num text-xs text-muted">この重力での予想タイム（式）：t = √(2h/g) = {fmt(Math.sqrt((2 * h) / g))} 秒</p>
              </div>
            </Card>
            <Card title="ミッション">
              <Mission items={[{ label: `落下時間を ${fmt(T * (1 - TOLERANCE))}〜${fmt(T * (1 + TOLERANCE))} 秒（±5%）に入れる`, done: hit }]} />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {runs.length > 0 && (
              <Card title="実験ノート（ためした結果）">
                <div className="overflow-x-auto">
                  <table className="num w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">重力 g</th>
                        <th className="py-1 pr-3 font-medium">落下時間</th>
                        <th className="py-1 font-medium">誤差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1.5 pr-3">{fmt(r.g)} m/s²</td>
                          <td className="py-1.5 pr-3">{fmt(r.time)} 秒</td>
                          <td className={`py-1.5 ${r.err <= TOLERANCE ? "text-ok" : "text-muted"}`}>
                            {fmt(r.err * 100, 1)}%{r.err <= TOLERANCE ? " ✓" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                {runs.length === 0 ? "1回以上実行すると採点できます。" : "いちばん誤差が小さい記録で採点します。"}
              </p>
              <PrimaryButton onClick={toResult} disabled={runs.length === 0 || clock.running}>
                ③ 採点して解説を見る →
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {phase === "result" && (
        <div className="space-y-5">
          <Card title="③ 採点" tone="accent">
            <ScoreBoard lines={scoreLines} record={record} />
          </Card>
          <Card title="予測のふりかえり">
            <PredictionPanel
              question={`目標の ${fmt(T)} 秒にするには、重力をどうする？`}
              choices={CHOICES}
              value={prediction}
              onChange={() => {}}
              locked
              correctId={answer}
            />
          </Card>
          <ExplanationCard
            lines={[
              <>空気抵抗がないとき、落下時間は <b>t = √(2h/g)</b>。重力が強いほど速く落ちるので、時間は短くなります。</>,
              <>t は g の<b>平方根に反比例</b>します。重力を4倍にしても時間は半分にしかなりません。だから「ちょっと調整」でも g は大きく動かす必要があります。</>,
              <>式を逆に解くと、必要な重力は <b>g = 2h/T²</b>。このお題なら g = 2×{h}÷{fmt(T)}² ≈ <b className="num">{fmt(need)} m/s²</b> がぴったりです。</>,
            ]}
            formula={<>t = √(2h/g)　⇔　g = 2h / T²</>}
            assumptions={[
              "空気抵抗なし（真空）。空気があると軽い物ほど遅れる（Q2で体験）",
              "落ちている間、重力の強さは一定（高さ数十 m なら十分正確）",
              "プリセットの値は各天体の表面での平均的な重力加速度",
              "計算は 0.001 秒きざみの数値計算（RK4法）。理論値との差は 0.000001 秒未満",
            ]}
          />
          <ShareBox text={shareText} path={meta.href} />
          <ResultNav meta={meta} onRetry={retry} />
        </div>
      )}
    </div>
  );
}

/* ───────── 描画 ───────── */

function drawGravity(
  ctx: CanvasRenderingContext2D,
  w: number,
  hh: number,
  p: {
    t: number;
    active: { res: FallResult; g: number } | null;
    g: number;
    h: number;
    T: number;
    running: boolean;
    presetName?: string;
  },
) {
  drawGrid(ctx, w, hh);
  const top = 66;
  const barH = 64;
  const ground = hh - barH - 16;
  const scaleY = (ground - top) / p.h;
  const cx = w * 0.42;

  // 重力の強さ = 下向きの矢印の太さ
  const strength = Math.min(1, Math.log10(p.g + 1) / 2);
  ctx.fillStyle = `rgba(180,156,255,${0.04 + strength * 0.12})`;
  ctx.fillRect(0, top - 20, w, ground - top + 20);
  for (let i = 0; i < 3; i++) {
    const x = w * (0.72 + i * 0.09);
    const len = 20 + strength * 60;
    ctx.strokeStyle = "rgba(180,156,255,0.6)";
    ctx.lineWidth = 1 + strength * 4;
    ctx.beginPath();
    ctx.moveTo(x, top + 10);
    ctx.lineTo(x, top + 10 + len);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6, top + 4 + len);
    ctx.lineTo(x, top + 14 + len);
    ctx.lineTo(x + 6, top + 4 + len);
    ctx.stroke();
  }
  label(ctx, `g = ${p.g.toFixed(2)} m/s²${p.presetName ? `（${p.presetName}）` : ""}`, 14, 20, {
    size: 15,
    mono: true,
    weight: 700,
  });
  label(ctx, `高さ ${p.h} m`, 14, 42, { size: 12, color: COLORS.muted });

  // 高さの線と地面
  ctx.strokeStyle = COLORS.gridStrong;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - 40, top + 0.5);
  ctx.lineTo(cx + 40, top + 0.5);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = COLORS.ok;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ground + 0.5);
  ctx.lineTo(w, ground + 0.5);
  ctx.stroke();

  // 球
  const r = 12;
  const d = p.active ? fallDistanceAt(p.active.res, p.t) : 0;
  ctx.beginPath();
  ctx.arc(cx, top + d * scaleY - r, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(82,214,255,0.7)";
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // タイムバー：目標の ±5% 帯
  const bx = 16;
  const bw = w - 32;
  const by = ground + 30;
  const tMax = Math.max(p.T * 1.8, p.active ? p.active.res.landTime * 1.1 : 0);
  const X = (t: number) => bx + (Math.min(t, tMax) / tMax) * bw;
  ctx.fillStyle = "rgba(130,190,255,0.12)";
  ctx.fillRect(bx, by - 6, bw, 12);
  ctx.fillStyle = "rgba(94,230,160,0.35)";
  ctx.fillRect(X(p.T * (1 - TOLERANCE)), by - 10, X(p.T * (1 + TOLERANCE)) - X(p.T * (1 - TOLERANCE)), 20);
  ctx.strokeStyle = COLORS.ok;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(p.T), by - 14);
  ctx.lineTo(X(p.T), by + 14);
  ctx.stroke();
  label(ctx, `目標 ${p.T.toFixed(2)} s`, X(p.T), by - 22, { size: 11, mono: true, align: "center", color: COLORS.ok });
  label(ctx, "0", bx, by + 20, { size: 10, mono: true, color: COLORS.muted });

  if (p.active) {
    const tt = Math.min(p.t, p.active.res.landTime);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(X(tt), by, 6, 0, Math.PI * 2);
    ctx.fill();
    const done = !p.running && p.t > 0;
    const err = Math.abs(p.active.res.landTime - p.T) / p.T;
    label(ctx, `${tt.toFixed(2)} s`, X(tt), by + 20, { size: 12, mono: true, weight: 700, align: "center" });
    if (done) {
      const ok = err <= TOLERANCE;
      label(ctx, ok ? `誤差 ${(err * 100).toFixed(1)}%  ミッション達成！` : `誤差 ${(err * 100).toFixed(1)}%  ${p.active.res.landTime > p.T ? "おそすぎ" : "はやすぎ"}`, w / 2, top + (ground - top) / 2, {
        size: 17,
        weight: 800,
        align: "center",
        color: ok ? COLORS.ok : COLORS.amber,
      });
    }
  } else {
    label(ctx, "重力を決めて ▶落とす", w / 2, top + (ground - top) / 2, { size: 13, align: "center", color: COLORS.muted });
  }
}
