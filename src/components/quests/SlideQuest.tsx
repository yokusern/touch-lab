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
import { G_EARTH, criticalMu, slope } from "@/lib/physics";
import { saveResult, type QuestRecord } from "@/lib/progress";
import { questById } from "@/lib/quests";

const meta = questById("slide");
const ANGLE = 30;
const LENGTH = 3;
const MAX_REAL_SECONDS = 10; // 再生がこれより長くなるときは自動で早送り

const CHOICES: Choice[] = [
  { id: "0.3", label: "μ ≈ 0.3", sub: "少しザラザラで止まる" },
  { id: "0.6", label: "μ ≈ 0.6", sub: "かなりザラザラで止まる" },
  { id: "1.0", label: "μ ≈ 1.0", sub: "ゴムくらいザラザラで止まる" },
];
const CORRECT = "0.6";

type Run = { mu: number; time: number | null; accel: number };

export default function SlideQuest() {
  const [phase, setPhase] = useState<Phase>("predict");
  const [prediction, setPrediction] = useState<string | null>(null);
  const [mu, setMu] = useState(0.2);
  const [speed, setSpeed] = useState(1);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<{ mu: number; accel: number; time: number | null; fast: number } | null>(null);
  const [record, setRecord] = useState<QuestRecord | null>(null);
  const clock = useSimClock();

  const live = slope({ angleDeg: ANGLE, mu, length: LENGTH });

  const run = () => {
    const r = slope({ angleDeg: ANGLE, mu, length: LENGTH });
    if (r.slides && r.goalTime) {
      const play = Math.max(speed, r.goalTime / MAX_REAL_SECONDS);
      setActive({ mu, accel: r.accel, time: r.goalTime, fast: play > speed ? play / speed : 1 });
      clock.start(r.goalTime, play, () => setRuns((rs) => [...rs, { mu, time: r.goalTime, accel: r.accel }]));
    } else {
      setActive({ mu, accel: 0, time: null, fast: 1 });
      clock.start(1.2, 1, () => setRuns((rs) => [...rs, { mu, time: null, accel: 0 }]));
    }
  };

  const reset = () => {
    clock.reset();
    setActive(null);
  };

  const sawSlide = runs.some((r) => r.time !== null);
  const sawStop = runs.some((r) => r.time === null);
  const correct = prediction === CORRECT;

  const scoreLines: ScoreLine[] = [
    {
      label: "予測",
      points: correct ? 50 : 0,
      max: 50,
      note: `あなたの予測：${CHOICES.find((c) => c.id === prediction)?.label ?? "—"}（正解は μ ≈ 0.6）`,
    },
    { label: "実験：滑る μ を確かめた", points: sawSlide ? 25 : 0, max: 25 },
    { label: "実験：止まる μ を確かめた", points: sawStop ? 25 : 0, max: 25 },
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
    setPhase("predict");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 描画用の現在値
  const showMu = active ? active.mu : mu;
  const s = active && active.time !== null ? Math.min(0.5 * active.accel * clock.t * clock.t, LENGTH) : 0;
  const v = active && active.time !== null ? active.accel * clock.t : 0;
  const stuck = active !== null && active.time === null;
  const finished = active !== null && !clock.running && clock.t > 0;

  const draw: DrawFn = (ctx, w, h) => drawSlope(ctx, w, h, { mu: showMu, s, v, t: clock.t, stuck, finished, active: !!active });

  const sortedRuns = [...runs].sort((a, b) => a.mu - b.mu);
  const lastSlide = [...runs].filter((r) => r.time !== null).sort((a, b) => b.mu - a.mu)[0];
  const firstStop = [...runs].filter((r) => r.time === null).sort((a, b) => a.mu - b.mu)[0];
  const shareText = [
    `【さわれる実験室】${meta.number} ${meta.title} ${total}点`,
    `予測「${CHOICES.find((c) => c.id === prediction)?.label ?? "—"}で止まる」→ ${correct ? "正解！" : "はずれ…"}`,
    lastSlide ? `傾き30°の斜面、μ=${fmt(lastSlide.mu)}では${fmt(lastSlide.time!)}秒でゴール。` : "",
    firstStop ? `μ=${fmt(firstStop.mu)}では止まって動かなかった。` : "",
    "あなたはどこで止まると思う？",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <QuestHeader meta={meta} phase={phase} />

      <Card title="お題">
        <p className="leading-relaxed">
          長さ <b className="num">3 m</b>・傾き <b className="num">30°</b> の斜面に箱を置いて手をはなします。
          斜面の<b>摩擦係数 μ</b>（ザラザラ度）を 0 から少しずつ大きくしていくと、
          どこかで箱は<b>滑り出さなくなります</b>。
        </p>
      </Card>

      {phase !== "result" && (
        <Card title="① 予測する" tone={phase === "predict" ? "accent" : "default"}>
          <PredictionPanel
            question="箱が滑らなくなるのは、摩擦係数 μ がいくつくらいのとき？"
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
            <SimCanvas draw={draw} aspect={1.45} label="斜面を箱が滑る様子のシミュレーション" />
            <RunControls onRun={run} onReset={reset} running={clock.running} speed={speed} setSpeed={setSpeed} />
            {active && active.fast > 1 && clock.running && (
              <p className="text-xs text-amber">ゆっくりすぎるので ×{fmt(active.fast, 1)} 倍の早送りで再生中</p>
            )}
          </div>
          <div className="space-y-4">
            <Card title="② パラメータをさわる" tone="accent">
              <div className="space-y-4">
                <ParamSlider
                  label="摩擦係数 μ"
                  value={mu}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={setMu}
                  display={fmt(mu)}
                  disabled={clock.running}
                  hint="0 = ツルツルの氷 / 1 = ゴムのようにザラザラ"
                />
                <div className="num rounded-xl border border-line bg-bg-deep p-3 text-sm leading-relaxed">
                  <div className="text-muted">a = g(sinθ − μcosθ)</div>
                  <div>
                    = {G_EARTH} × (0.500 − {fmt(mu)} × 0.866)
                  </div>
                  <div className={live.slides ? "text-accent" : "text-bad"}>
                    = {live.slides ? `${fmt(live.accel)} m/s²` : "0 以下 → 滑り出さない"}
                  </div>
                </div>
              </div>
            </Card>
            <Card title="ミッション">
              <Mission
                items={[
                  { label: "箱が滑ってゴールする μ をためす", done: sawSlide },
                  { label: "箱が止まって動かない μ をためす", done: sawStop },
                ]}
              />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {runs.length > 0 && (
              <Card title="実験ノート（ためした結果）">
                <div className="overflow-x-auto">
                  <table className="num w-full text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">摩擦係数 μ</th>
                        <th className="py-1 pr-3 font-medium">加速度 a</th>
                        <th className="py-1 font-medium">ゴールタイム</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRuns.map((r, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="py-1.5 pr-3">{fmt(r.mu)}</td>
                          <td className="py-1.5 pr-3">{r.time === null ? "0" : `${fmt(r.accel)} m/s²`}</td>
                          <td className={`py-1.5 ${r.time === null ? "text-bad" : "text-accent"}`}>
                            {r.time === null ? "止まった" : `${fmt(r.time)} 秒`}
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
                {runs.length === 0 ? "1回以上実行すると採点できます。" : "納得いくまで何度でも試せます。"}
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
              question="箱が滑らなくなるのは、摩擦係数 μ がいくつくらいのとき？"
              choices={CHOICES}
              value={prediction}
              onChange={() => {}}
              locked
              correctId={CORRECT}
            />
          </Card>
          <ExplanationCard
            lines={[
              <>箱を斜面に沿って下へ引く力は <b>mg sinθ</b>、摩擦はその逆向きに <b>μ mg cosθ</b> のブレーキをかけます。</>,
              <>差し引きの加速度は <b>a = g(sinθ − μcosθ)</b>。μ が大きいほど a が小さくなり、ゴールが遅れます。質量 m は両方の力に入っているので打ち消し合い、結果に関係しません。</>,
              <>μ が <b>tanθ</b> 以上になると、ブレーキが勝って滑り出しません。30° なら tan30° ≈ <b className="num">{fmt(criticalMu(ANGLE), 3)}</b>。だから「μ ≈ 0.6」が正解です。</>,
            ]}
            formula={<>a = g(sinθ − μcosθ)　→　止まる条件 μ ≥ tanθ</>}
            assumptions={[
              "静止摩擦係数と動摩擦係数を同じ値とみなしています（現実の物体では静止摩擦のほうが少し大きいことが多い）",
              "空気抵抗なし。箱は転がらずに滑るだけ",
              `重力加速度 g = ${G_EARTH} m/s²（地球）`,
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

function drawSlope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: { mu: number; s: number; v: number; t: number; stuck: boolean; finished: boolean; active: boolean },
) {
  drawGrid(ctx, w, h);
  const th = (ANGLE * Math.PI) / 180;
  const mx = Math.max(24, w * 0.06);
  const top = Math.max(40, h * 0.16);
  const bottom = h - 34;
  const scale = Math.min((w - 2 * mx) / (LENGTH * Math.cos(th)), (bottom - top) / (LENGTH * Math.sin(th)));
  const x0 = mx;
  const y0 = bottom - LENGTH * Math.sin(th) * scale;
  const x1 = x0 + LENGTH * Math.cos(th) * scale;
  const y1 = bottom;

  // 地面
  ctx.strokeStyle = COLORS.gridStrong;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y1 + 0.5);
  ctx.lineTo(w, y1 + 0.5);
  ctx.stroke();

  // 斜面（三角形）
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x0, y1);
  ctx.closePath();
  ctx.fillStyle = "rgba(82,214,255,0.08)";
  ctx.fill();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  // 摩擦の大きさ = 表面のギザギザ
  const n = 60;
  const amp = 1 + p.mu * 5;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const x = x0 + (x1 - x0) * f;
    const y = y0 + (y1 - y0) * f;
    const off = i % 2 === 0 ? -amp : 0;
    const nx = -Math.sin(th) * off;
    const ny = -Math.cos(th) * off;
    if (i === 0) ctx.moveTo(x + nx, y + ny);
    else ctx.lineTo(x + nx, y + ny);
  }
  ctx.strokeStyle = COLORS.amber;
  ctx.globalAlpha = 0.35 + p.mu * 0.6;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 角度の表示
  ctx.beginPath();
  ctx.arc(x1, y1, 38, Math.PI, Math.PI + th, false);
  ctx.strokeStyle = COLORS.muted;
  ctx.lineWidth = 1;
  ctx.stroke();
  label(ctx, "30°", x1 - 60, y1 - 12, { color: COLORS.muted, size: 12, mono: true });

  // スタート・ゴール
  label(ctx, "START", x0, y0 - Math.max(22, 0.42 * scale) - 16, { color: COLORS.muted, size: 11, mono: true });
  ctx.strokeStyle = COLORS.ok;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1 - 4, y1 - 46);
  ctx.lineTo(x1 - 4, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  label(ctx, "GOAL", x1 - 6, y1 - 56, { color: COLORS.ok, size: 11, mono: true, align: "right" });

  // 箱（斜面に乗せて回転）
  const box = Math.max(22, 0.42 * scale);
  const along = (p.s / LENGTH) * (LENGTH * scale - box);
  const cx = x0 + Math.cos(th) * (along + box / 2);
  const cy = y0 + Math.sin(th) * (along + box / 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(th);
  ctx.fillStyle = p.stuck ? "rgba(255,122,122,0.25)" : "rgba(82,214,255,0.25)";
  ctx.strokeStyle = p.stuck ? COLORS.bad : COLORS.accent;
  ctx.lineWidth = 2;
  ctx.fillRect(-box / 2, -box - 2, box, box);
  ctx.strokeRect(-box / 2, -box - 2, box, box);

  // 力の矢印（斜面方向）：下向き = 重力の成分、上向き = 摩擦
  const fg = Math.sin(th);
  const ff = Math.min(p.mu * Math.cos(th), p.stuck ? fg : p.mu * Math.cos(th));
  const unit = box * 2.2;
  const arrowY = -box / 2 - 2;
  arrow(ctx, box / 2, arrowY, box / 2 + fg * unit, arrowY, COLORS.accent);
  if (p.mu > 0) arrow(ctx, -box / 2, arrowY, -box / 2 - ff * unit, arrowY, COLORS.amber);
  ctx.restore();

  // 計測と凡例（斜面の上の空いている右上にまとめる）
  const lx = w - 12;
  label(ctx, `t = ${p.t.toFixed(2)} s`, lx, 20, { size: 18, mono: true, weight: 700, align: "right" });
  label(ctx, `μ = ${p.mu.toFixed(2)}   v = ${p.v.toFixed(2)} m/s`, lx, 42, { size: 12, mono: true, color: COLORS.muted, align: "right" });
  label(ctx, "↘ 斜面を下る力 mg sinθ", lx, 64, { color: COLORS.accent, size: 11, align: "right" });
  label(ctx, "↖ 摩擦のブレーキ μmg cosθ", lx, 82, { color: COLORS.amber, size: 11, align: "right" });

  if (p.stuck) {
    label(ctx, "止まったまま動かない！", w / 2, h / 2 + 20, { size: 18, weight: 800, color: COLORS.bad, align: "center" });
  } else if (p.finished) {
    label(ctx, `GOAL  ${p.t.toFixed(2)} 秒`, w / 2, h / 2 + 20, { size: 20, weight: 800, color: COLORS.ok, align: "center", mono: true });
  } else if (!p.active) {
    label(ctx, "μ を決めて ▶実行", w / 2, h / 2 + 20, { size: 14, color: COLORS.muted, align: "center" });
  }
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 2) return;
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 9 * Math.cos(a - 0.45), y1 - 9 * Math.sin(a - 0.45));
  ctx.lineTo(x1 - 9 * Math.cos(a + 0.45), y1 - 9 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}
