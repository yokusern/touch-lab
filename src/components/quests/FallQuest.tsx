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
  Toggle,
  fmt,
  type Choice,
  type Phase,
  type ScoreLine,
} from "@/components/quest-ui";
import {
  AIR_DENSITY,
  G_EARTH,
  SPHERE_CD,
  fallDistanceAt,
  fallSpeedAt,
  simulateFall,
  terminalVelocity,
  type FallResult,
} from "@/lib/physics";
import { saveResult, type QuestRecord } from "@/lib/progress";
import { questById } from "@/lib/quests";

const meta = questById("fall");
const HEIGHT = 20;
const RADIUS = 0.1;

const CHOICES: Choice[] = [
  { id: "heavy", label: "重い球が先", sub: "重いほうが強く引っぱられる" },
  { id: "same", label: "同時に着く", sub: "重さは関係ない" },
  { id: "light", label: "軽い球が先", sub: "軽いほうが身軽" },
];
const CORRECT = "same";

// 質量スライダーは対数目盛り（0.01kg〜10kg）
const toMass = (x: number) => Math.pow(10, -2 + 3 * x);
const toX = (m: number) => (Math.log10(m) + 2) / 3;
const fmtMass = (m: number) => (m >= 1 ? `${fmt(m, 1)} kg` : m >= 0.1 ? `${fmt(m, 2)} kg` : `${Math.round(m * 1000)} g`);
const roundMass = (m: number) => (m >= 1 ? Math.round(m * 10) / 10 : m >= 0.1 ? Math.round(m * 100) / 100 : Math.round(m * 1000) / 1000);

type Run = { mA: number; mB: number; drag: boolean; tA: number; tB: number };

export default function FallQuest() {
  const [phase, setPhase] = useState<Phase>("predict");
  const [prediction, setPrediction] = useState<string | null>(null);
  const [mA, setMA] = useState(5);
  const [mB, setMB] = useState(0.05);
  const [drag, setDrag] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [runs, setRuns] = useState<Run[]>([]);
  const [active, setActive] = useState<{ a: FallResult; b: FallResult; drag: boolean; mA: number; mB: number } | null>(null);
  const [record, setRecord] = useState<QuestRecord | null>(null);
  const clock = useSimClock();

  const run = () => {
    const a = simulateFall({ height: HEIGHT, mass: mA, g: G_EARTH, drag, radius: RADIUS });
    const b = simulateFall({ height: HEIGHT, mass: mB, g: G_EARTH, drag, radius: RADIUS });
    const snapshot = { mA, mB, drag };
    setActive({ a, b, ...snapshot });
    const duration = Math.max(a.landTime, b.landTime);
    const play = Math.max(speed, duration / 10);
    clock.start(duration, play, () =>
      setRuns((rs) => [...rs, { ...snapshot, tA: a.landTime, tB: b.landTime }]),
    );
  };

  const reset = () => {
    clock.reset();
    setActive(null);
  };

  const differ = (r: Run) => Math.max(r.mA, r.mB) / Math.min(r.mA, r.mB) >= 1.5;
  const offDone = runs.some((r) => !r.drag && differ(r));
  const onDone = runs.some((r) => r.drag && differ(r));
  const correct = prediction === CORRECT;

  const scoreLines: ScoreLine[] = [
    {
      label: "予測",
      points: correct ? 50 : 0,
      max: 50,
      note: `あなたの予測：${CHOICES.find((c) => c.id === prediction)?.label ?? "—"}（空気抵抗なしなら「同時に着く」が正解）`,
    },
    { label: "実験：質量のちがう球を 空気抵抗OFF で落とした", points: offDone ? 25 : 0, max: 25 },
    { label: "実験：質量のちがう球を 空気抵抗ON で落とした", points: onDone ? 25 : 0, max: 25 },
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
    setDrag(false);
    setPhase("predict");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const lastOff = [...runs].reverse().find((r) => !r.drag && differ(r));
  const lastOn = [...runs].reverse().find((r) => r.drag && differ(r));
  const describe = (r: Run) => {
    const diff = Math.abs(r.tA - r.tB);
    if (diff < 0.005) return `${fmtMass(r.mA)}と${fmtMass(r.mB)}は同時に着地（${fmt(r.tA)}秒）`;
    const lighterLate = (r.mA < r.mB ? r.tA : r.tB) > (r.mA < r.mB ? r.tB : r.tA);
    return `軽い球が${fmt(diff)}秒${lighterLate ? "おくれた" : "先に着いた"}`;
  };
  const shareText = [
    `【さわれる実験室】${meta.number} ${meta.title} ${total}点`,
    `予測「${CHOICES.find((c) => c.id === prediction)?.label ?? "—"}」→ ${correct ? "正解！" : "はずれ…"}`,
    lastOff ? `空気抵抗OFF：${describe(lastOff)}` : "",
    lastOn ? `空気抵抗ON：${describe(lastOn)}` : "",
    "重い球と軽い球、どっちが先だと思う？",
  ]
    .filter(Boolean)
    .join("\n");

  const draw: DrawFn = (ctx, w, h) =>
    drawRace(ctx, w, h, {
      t: clock.t,
      active,
      mA: active?.mA ?? mA,
      mB: active?.mB ?? mB,
      drag: active?.drag ?? drag,
      running: clock.running,
    });

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <QuestHeader meta={meta} phase={phase} />

      <Card title="お題">
        <p className="leading-relaxed">
          高さ <b className="num">20 m</b>（ビル6階くらい）から、<b>同じ大きさ</b>（直径 20 cm）の
          <b>重い球 5 kg</b> と <b>軽い球 50 g</b> を同時に手放します。
          まずは<b>空気がない世界</b>で考えてみましょう。
        </p>
      </Card>

      {phase !== "result" && (
        <Card title="① 予測する" tone={phase === "predict" ? "accent" : "default"}>
          <PredictionPanel
            question="空気抵抗がないとき、先に地面に着くのはどっち？"
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
            <SimCanvas draw={draw} aspect={1.2} maxHeight={560} label="2つの球が落下するレースのシミュレーション" />
            <RunControls onRun={run} onReset={reset} running={clock.running} speed={speed} setSpeed={setSpeed} runLabel="同時に落とす" />
          </div>
          <div className="space-y-4">
            <Card title="② パラメータをさわる" tone="accent">
              <div className="space-y-4">
                <ParamSlider
                  label="球A の質量"
                  value={toX(mA)}
                  min={0}
                  max={1}
                  step={0.001}
                  onChange={(x) => setMA(roundMass(toMass(x)))}
                  display={fmtMass(mA)}
                  disabled={clock.running}
                />
                <ParamSlider
                  label="球B の質量"
                  value={toX(mB)}
                  min={0}
                  max={1}
                  step={0.001}
                  onChange={(x) => setMB(roundMass(toMass(x)))}
                  display={fmtMass(mB)}
                  disabled={clock.running}
                  hint="10 g 〜 10 kg（どちらも直径 20 cm の同じ形）"
                />
                <Toggle
                  label="空気抵抗"
                  checked={drag}
                  onChange={setDrag}
                  disabled={clock.running}
                  hint={drag ? "空気あり：F = ½ρC_dAv²" : "空気なし（真空）"}
                />
                {drag && (
                  <p className="num rounded-xl border border-line bg-bg-deep p-3 text-xs leading-relaxed text-muted">
                    終端速度（これ以上速くならない速さ）
                    <br />A: {fmt(terminalVelocity(mA, G_EARTH, RADIUS), 1)} m/s ／ B: {fmt(terminalVelocity(mB, G_EARTH, RADIUS), 1)} m/s
                  </p>
                )}
              </div>
            </Card>
            <Card title="ミッション">
              <Mission
                items={[
                  { label: "質量のちがう2球を 空気抵抗OFF で落とす", done: offDone },
                  { label: "質量のちがう2球を 空気抵抗ON で落とす", done: onDone },
                ]}
              />
            </Card>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {runs.length > 0 && (
              <Card title="実験ノート（ためした結果）">
                <div className="overflow-x-auto">
                  <table className="num w-full min-w-[420px] text-sm">
                    <thead className="text-left text-xs text-muted">
                      <tr>
                        <th className="py-1 pr-3 font-medium">空気抵抗</th>
                        <th className="py-1 pr-3 font-medium">球A</th>
                        <th className="py-1 pr-3 font-medium">球B</th>
                        <th className="py-1 font-medium">着地の差</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className={`py-1.5 pr-3 ${r.drag ? "text-amber" : "text-muted"}`}>{r.drag ? "ON" : "OFF"}</td>
                          <td className="py-1.5 pr-3">
                            {fmtMass(r.mA)} → {fmt(r.tA)} 秒
                          </td>
                          <td className="py-1.5 pr-3">
                            {fmtMass(r.mB)} → {fmt(r.tB)} 秒
                          </td>
                          <td className="py-1.5">{Math.abs(r.tA - r.tB) < 0.005 ? "同時" : `${fmt(Math.abs(r.tA - r.tB))} 秒`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">
                {runs.length === 0 ? "1回以上実行すると採点できます。" : "空気抵抗ON/OFFを切りかえて比べてみよう。"}
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
              question="空気抵抗がないとき、先に地面に着くのはどっち？"
              choices={CHOICES}
              value={prediction}
              onChange={() => {}}
              locked
              correctId={CORRECT}
            />
          </Card>
          <ExplanationCard
            lines={[
              <>重い球ほど重力で強く引かれますが、そのぶん<b>動かしにくさ（慣性）</b>も同じ割合で大きい。割り算すると加速度はどちらも <b>g</b> になり、空気がなければ<b>同時</b>に着きます。</>,
              <>空気抵抗の力は<b>速さの2乗と球の大きさ</b>で決まり、質量には関係しません。同じ大きさなら軽い球ほど「抵抗 ÷ 質量」が大きく、減速が目立ちます。</>,
              <>だから空気があると<b>重い球が先</b>に着きます。結論は「空気があるかどうか」という<b>前提</b>で変わるのです。</>,
            ]}
            formula={<>空気なし：t = √(2h/g)　／　空気あり：m·dv/dt = mg − ½ρC_dAv²</>}
            assumptions={[
              "2つの球は同じ大きさ（直径 20 cm）。形が同じだから空気抵抗の式も同じになる",
              `空気の密度 ρ = ${AIR_DENSITY} kg/m³・球の抗力係数 C_d = ${SPHERE_CD}・風なし`,
              `重力加速度 g = ${G_EARTH} m/s²・空気の浮力は無視`,
              "計算は 0.001 秒きざみの数値計算（RK4法）。空気なしの場合、理論値との差は 0.000001 秒未満",
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

function drawRace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: {
    t: number;
    active: { a: FallResult; b: FallResult } | null;
    mA: number;
    mB: number;
    drag: boolean;
    running: boolean;
  },
) {
  drawGrid(ctx, w, h);
  const top = 70;
  const ground = h - 40;
  const scaleY = (ground - top) / HEIGHT;
  const axisX = 40;

  // 空気
  if (p.drag) {
    ctx.fillStyle = "rgba(255,190,85,0.05)";
    ctx.fillRect(axisX, top - 20, w - axisX, ground - top + 20);
    ctx.strokeStyle = "rgba(255,190,85,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = top + ((i * 53) % (ground - top));
      const x = axisX + 12 + ((i * 97) % Math.max(1, w - axisX - 40));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y);
      ctx.stroke();
    }
    label(ctx, "空気あり", axisX + 6, top - 10, { color: COLORS.amber, size: 11, weight: 700 });
  } else {
    label(ctx, "真空（空気なし）", axisX + 6, top - 10, { color: COLORS.muted, size: 11 });
  }

  // 高さの目盛り
  ctx.strokeStyle = COLORS.gridStrong;
  ctx.lineWidth = 1;
  for (let m = 0; m <= HEIGHT; m += 5) {
    const y = ground - m * scaleY;
    ctx.beginPath();
    ctx.moveTo(axisX - 6, y + 0.5);
    ctx.lineTo(axisX, y + 0.5);
    ctx.stroke();
    label(ctx, `${m}m`, axisX - 9, y, { color: COLORS.muted, size: 10, align: "right", mono: true });
  }
  ctx.beginPath();
  ctx.moveTo(axisX + 0.5, top);
  ctx.lineTo(axisX + 0.5, ground);
  ctx.stroke();

  // 地面
  ctx.strokeStyle = COLORS.ok;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(axisX, ground + 0.5);
  ctx.lineTo(w, ground + 0.5);
  ctx.stroke();

  const r = Math.max(9, Math.min(16, 0.1 * scaleY * 4));
  const lanes = [
    { x: axisX + (w - axisX) * 0.33, m: p.mA, name: "A", res: p.active?.a },
    { x: axisX + (w - axisX) * 0.72, m: p.mB, name: "B", res: p.active?.b },
  ];
  const heavier = p.mA >= p.mB ? 0 : 1;

  lanes.forEach((ln, i) => {
    const d = ln.res ? fallDistanceAt(ln.res, p.t) : 0;
    const y = top + d * scaleY - r;
    const landed = ln.res ? p.t >= ln.res.landTime : false;
    // 球（同じ大きさ。重い球は中身が詰まって見える）
    const density = (Math.log10(ln.m) + 2) / 3;
    ctx.beginPath();
    ctx.arc(ln.x, Math.max(top - r, y), r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(82,214,255,${0.12 + density * 0.75})`;
    ctx.fill();
    ctx.strokeStyle = i === heavier ? COLORS.accent : COLORS.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    label(ctx, `${ln.name}  ${fmtMass(ln.m)}`, ln.x, 22, { size: 13, weight: 700, align: "center" });
    if (ln.res) {
      const tt = Math.min(p.t, ln.res.landTime);
      label(ctx, `${tt.toFixed(2)} s`, ln.x, 44, {
        size: 15,
        mono: true,
        weight: 700,
        align: "center",
        color: landed ? COLORS.ok : COLORS.ink,
      });
      if (!landed) {
        label(ctx, `${fallSpeedAt(ln.res, p.t).toFixed(1)} m/s`, ln.x + r + 6, Math.max(top - r, y), {
          size: 10,
          mono: true,
          color: COLORS.muted,
        });
      }
    }
  });

  if (p.active && !p.running && p.t > 0) {
    const da = p.active.a.landTime;
    const db = p.active.b.landTime;
    const diff = Math.abs(da - db);
    const msg = diff < 0.005 ? "同時に着地！" : `${da < db ? "A" : "B"} が ${diff.toFixed(2)} 秒 先に着地`;
    label(ctx, msg, (axisX + w) / 2, ground + 22, { size: 15, weight: 800, align: "center", color: COLORS.ok });
  } else if (!p.active) {
    label(ctx, "▶ 同時に落とす で実験", (axisX + w) / 2, ground + 22, { size: 13, align: "center", color: COLORS.muted });
  }
}
