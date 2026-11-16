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

if (failed > 0) {
  console.error(`\n${failed} 件が許容誤差（相対 1e-4）を超えました`);
  process.exit(1);
}
console.log("\nすべて許容誤差（相対 1e-4）以内");
