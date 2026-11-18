// 検証ケース: シミュ結果と理論値の誤差を表示する。
// 実行: npm run verify（node の型ストリップ機能でそのまま動く）
import {
  G_EARTH,
  criticalMu,
  simulateFall,
  slope,
  theoryFallTime,
  theoryFallTimeWithDrag,
} from "../src/lib/physics.ts";
import { World } from "../src/lib/engine/engine.ts";
import { SCENARIOS, defaults } from "../src/lib/whatif.ts";

const fmt = (x: number, d = 6) => x.toFixed(d);
const pct = (sim: number, th: number) => ((Math.abs(sim - th) / th) * 100).toExponential(2) + " %";

let failed = 0;
const check = (label: string, sim: number, th: number, tolRel = 1e-4) => {
  const rel = Math.abs(sim - th) / th;
  const ok = rel <= tolRel;
  if (!ok) failed++;
  console.log(
    `| ${label} | ${fmt(th)} | ${fmt(sim)} | ${fmt(Math.abs(sim - th), 9)} | ${pct(sim, th)} | ${ok ? "OK" : "NG"} |`,
  );
};

console.log("\n### 1. 自由落下（空気抵抗なし）: 理論値 t = √(2h/g)\n");
console.log("| ケース | 理論値 t [s] | シミュ t [s] | 誤差 [s] | 相対誤差 | 判定 |");
console.log("|---|---|---|---|---|---|");
const vacuum: [string, number, number][] = [
  ["地球 h=20m（Q2の高さ）", 20, G_EARTH],
  ["地球 h=10m", 10, G_EARTH],
  ["月 h=10m (g=1.62)", 10, 1.62],
  ["火星 h=5m (g=3.71)", 5, 3.71],
  ["木星 h=20m (g=24.79)", 20, 24.79],
  ["重力10倍 h=15m (g=98.1)", 15, 98.1],
];
for (const [label, h, g] of vacuum) {
  for (const m of [0.05, 5]) {
    const r = simulateFall({ height: h, mass: m, g, drag: false });
    check(`${label} m=${m}kg`, r.landTime, theoryFallTime(h, g));
  }
}

console.log("\n### 2. 空気抵抗あり（2乗抵抗の解析解と比較）: t = (v_t/g)·arccosh(exp(gh/v_t²))\n");
console.log("| ケース | 理論値 t [s] | シミュ t [s] | 誤差 [s] | 相対誤差 | 判定 |");
console.log("|---|---|---|---|---|---|");
for (const m of [0.05, 0.5, 5]) {
  const r = simulateFall({ height: 20, mass: m, g: G_EARTH, drag: true, radius: 0.1 });
  check(`h=20m 半径10cm m=${m}kg`, r.landTime, theoryFallTimeWithDrag(20, G_EARTH, m, 0.1));
}

console.log("\n### 3. 斜面スライド: a = g(sinθ − μcosθ), t = √(2L/a)\n");
console.log("| ケース | 加速度 a [m/s²] | ゴール t [s] | 滑るか |");
console.log("|---|---|---|---|");
for (const mu of [0, 0.2, 0.4, 0.57, 0.58, 0.8]) {
  const r = slope({ angleDeg: 30, mu, length: 3 });
  console.log(
    `| θ=30° L=3m μ=${mu} | ${fmt(r.accel, 4)} | ${r.goalTime === null ? "—" : fmt(r.goalTime, 4)} | ${r.slides ? "滑る" : "止まる"} |`,
  );
}
console.log(`\n境目の摩擦係数 tan30° = ${fmt(criticalMu(30), 4)}`);

console.log("\n### 4. 自由実験室の自作物理エンジン（1刻み 1/240 秒）: 教科書の式と比較\n");
console.log("| ケース | 理論値 | エンジン | 相対誤差 | 許容 | 判定 |");
console.log("|---|---|---|---|---|---|");
const H = 1 / 240;
let engineFailed = 0;
const checkE = (label: string, sim: number, th: number, tol: number, unit = "") => {
  const rel = Math.abs(sim - th) / Math.abs(th);
  const ok = rel <= tol;
  if (!ok) engineFailed++;
  console.log(`| ${label} | ${th.toPrecision(6)}${unit} | ${sim.toPrecision(6)}${unit} | ${(rel * 100).toFixed(3)} % | ${(tol * 100).toFixed(1)} % | ${ok ? "OK" : "NG"} |`);
};
/** y がしきい値を下から/上から横切る時刻を線形補間で求める */
const runUntil = (w: World, f: () => number, maxT: number) => {
  let prev = f();
  for (let t = 0; t < maxT; t += H) {
    w.step(H);
    const cur = f();
    if (prev > 0 && cur <= 0) return w.time - H * (cur / (cur - prev));
    prev = cur;
  }
  return NaN;
};

// (a) 自由落下 h=20m（地球）・h=10m（月）
for (const [h, g, name] of [
  [20, 9.81, "地球"],
  [10, 1.62, "月"],
] as const) {
  const w = new World();
  w.settings.gravity = g;
  const b = w.addCircle(0, h, 0.1);
  checkE(`自由落下 ${name} h=${h}m: t=√(2h/g)`, runUntil(w, () => b.y, 30), Math.sqrt((2 * h) / g), 0.005, " s");
}

// (b) ふりこ（棒 L=2m, 振れ幅5°）: T ≈ 2π√(L/g)(1+θ²/16)
{
  const w = new World();
  const L = 2;
  const th = (5 * Math.PI) / 180;
  const bob = w.addCircle(L * Math.sin(th), -L * Math.cos(th), 0.05, { material: "metal" });
  w.addJoint("rod", bob, null, { x: bob.x, y: bob.y }, { x: 0, y: 0 });
  // x が + → − に変わる時刻を2回はかる（半周期×2 = 1周期）
  const t1 = runUntil(w, () => bob.x, 10);
  const t2 = runUntil(w, () => -bob.x, 10);
  const t3 = runUntil(w, () => bob.x, 10);
  void t2;
  checkE("ふりこ L=2m 5°: T=2π√(L/g)(1+θ²/16)", t3 - t1, 2 * Math.PI * Math.sqrt(L / 9.81) * (1 + (th * th) / 16), 0.01, " s");
}

// (c) ばね（無重力, k=500 N/m）: T = 2π√(m/k)
{
  const w = new World();
  w.settings.gravity = 0;
  const b = w.addCircle(1.2, 0, 0.1, { material: "metal" });
  w.addJoint("spring", b, null, { x: 1.2, y: 0 }, { x: 0, y: 0 }, { length: 1, k: 500, c: 0 });
  const t1 = runUntil(w, () => b.x - 1, 10);
  runUntil(w, () => 1 - b.x, 10);
  const t3 = runUntil(w, () => b.x - 1, 10);
  checkE(`ばね k=500 m=${b.mass.toFixed(1)}kg: T=2π√(m/k)`, t3 - t1, 2 * Math.PI * Math.sqrt(b.mass / 500), 0.01, " s");
}

// (d) 弾性衝突（はねかえり1, 無重力, 質量比 1:3）: 運動量保存と衝突後の速さ
{
  const w = new World();
  w.settings.gravity = 0;
  const a = w.addCircle(-2, 0, 0.3, { vx: 4, restitution: 1, friction: 0 });
  const b = w.addCircle(2, 0, 0.3, { restitution: 1, friction: 0, density: a.density * 3 });
  const p0 = a.mass * a.vx + b.mass * b.vx;
  for (let i = 0; i < 240 * 2; i++) w.step(H);
  const p1 = a.mass * a.vx + b.mass * b.vx;
  const m1 = a.mass;
  const m2 = b.mass;
  checkE("弾性衝突 1:3 運動量 m₁v₁+m₂v₂", p1, p0, 1e-9, " kg·m/s");
  checkE("弾性衝突 1:3 後ろの球 v₁'=(m₁−m₂)/(m₁+m₂)·v", a.vx, ((m1 - m2) / (m1 + m2)) * 4, 0.01, " m/s");
  checkE("弾性衝突 1:3 前の球 v₂'=2m₁/(m₁+m₂)·v", b.vx, ((2 * m1) / (m1 + m2)) * 4, 0.01, " m/s");
}

// (e) 円軌道（万有引力 G=1e-6, GM=60, r=5）: T = 2π√(r³/GM)
{
  const w = new World();
  w.settings.gravity = 0;
  w.settings.attraction = 1e-6;
  const R = 1;
  w.addCircle(0, 0, R, { isStatic: true, density: 60 / 1e-6 / (Math.PI * R * R) });
  const r = 5;
  const p = w.addCircle(r, 0, 0.05, { vy: Math.sqrt(60 / r), density: 1 });
  runUntil(w, () => p.y, 30); // 半周（y が + → − に変わるところ）
  const tHalf = w.time;
  checkE("円軌道 r=5 GM=60: T=2π√(r³/GM)", tHalf * 2, 2 * Math.PI * Math.sqrt(r ** 3 / 60), 0.01, " s");
  checkE("円軌道 半周後の半径", Math.hypot(p.x, p.y), r, 0.01, " m");
}

// (f) 斜面を滑る箱（30°, μ=0.2）: 1秒で進む距離 ½·g(sinθ−μcosθ)·t²
{
  const w = new World();
  const th = Math.PI / 6;
  const len = 30;
  w.addPoly(0, 0, [
    { x: 0, y: 0 },
    { x: len * Math.cos(th), y: 0 },
    { x: 0, y: len * Math.sin(th) },
  ], { isStatic: true, friction: 0.2 });
  // 斜面の上に箱を置く（面に沿って傾ける）
  const s0 = 5;
  const nx = Math.sin(th);
  const ny = Math.cos(th);
  const px = s0 * Math.cos(th);
  const py = len * Math.sin(th) - s0 * Math.sin(th);
  const box = w.addBox(px + nx * 0.25, py + ny * 0.25, 0.5, 0.5, { angle: -th, friction: 0.2 })!;
  for (let i = 0; i < 24; i++) w.step(H); // 置いた直後の落ち着き（0.1秒）
  const x0 = box.x;
  const y0 = box.y;
  const t0 = w.time;
  for (let i = 0; i < 240; i++) w.step(H);
  const d = Math.hypot(box.x - x0, box.y - y0);
  const a = 9.81 * (Math.sin(th) - 0.2 * Math.cos(th));
  const v0 = 0; // 置いた直後はほぼ止まっている前提で、0.1秒分の速さを補う
  const dt = w.time - t0;
  const dTheory = v0 * dt + 0.5 * a * ((dt + 0.1) ** 2 - 0.1 ** 2);
  checkE("斜面 30° μ=0.2: s=½·g(sinθ−μcosθ)·t²", d, dTheory, 0.03, " m");
}

console.log("\n### 5. もしも計算機（初期値での結果）\n");
for (const sc of SCENARIOS) {
  const r = sc.compute(defaults(sc));
  console.log(`- ${sc.title}: ${r.headline} → **${r.big}**`);
}

if (engineFailed > 0) {
  console.error(`\nエンジンの検証で ${engineFailed} 件が許容誤差を超えました`);
  failed += engineFailed;
}

if (failed > 0) {
  console.error(`\n${failed} 件が許容誤差（相対 1e-4）を超えました`);
  process.exit(1);
}
console.log("\nすべて許容誤差以内（クエストの計算: 相対 1e-4、自由実験室のエンジン: 表の「許容」列）");
