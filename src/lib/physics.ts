// さわれる実験室 — 物理計算（式による自前計算）
// 物理エンジン（Matter.js など）は使わない。結果の正しさは scripts/verify.ts で理論値と照合する。

export const G_EARTH = 9.81; // m/s²
export const AIR_DENSITY = 1.2; // kg/m³（20℃・1気圧付近）
export const SPHERE_CD = 0.47; // 球の抗力係数

const toRad = (deg: number) => (deg * Math.PI) / 180;

/* ───────── Q1 斜面スライド ───────── */

export type SlopeParams = {
  angleDeg: number;
  mu: number; // 摩擦係数（静止・動摩擦を同じ値とみなす）
  length: number; // 斜面の長さ m
  g?: number;
};

export type SlopeResult = {
  accel: number; // 斜面に沿った加速度 m/s²（滑らない場合は 0）
  slides: boolean;
  goalTime: number | null; // ゴールまでの時間 s（滑らない場合は null）
  goalSpeed: number | null;
};

/** a = g(sinθ − μcosθ)。a ≤ 0 なら静止したまま（最大静止摩擦が勝つ）。 */
export function slope({ angleDeg, mu, length, g = G_EARTH }: SlopeParams): SlopeResult {
  const th = toRad(angleDeg);
  const a = g * (Math.sin(th) - mu * Math.cos(th));
  if (a <= 1e-9) return { accel: 0, slides: false, goalTime: null, goalSpeed: null };
  const t = Math.sqrt((2 * length) / a);
  return { accel: a, slides: true, goalTime: t, goalSpeed: a * t };
}

/** 滑り出さなくなる境目の摩擦係数 μ = tanθ */
export const criticalMu = (angleDeg: number) => Math.tan(toRad(angleDeg));

/* ───────── Q2/Q3 落下（刻みの数値計算） ───────── */

export type FallParams = {
  height: number; // m
  mass: number; // kg
  g: number; // m/s²
  drag: boolean; // 空気抵抗 ON/OFF
  radius?: number; // 球の半径 m
};

export type FallResult = {
  dt: number;
  /** i 番目の要素 = 時刻 i·dt に落ちた距離 m */
  dist: Float64Array;
  speed: Float64Array;
  landTime: number; // 着地時刻 s
  landSpeed: number; // 着地速度 m/s
};

/** 空気抵抗の係数 k（F = k v²）。k = ½ρC_dA */
export function dragCoefficient(radius: number) {
  return 0.5 * AIR_DENSITY * SPHERE_CD * Math.PI * radius * radius;
}

/** 終端速度 v_t = √(mg / k) */
export function terminalVelocity(mass: number, g: number, radius: number) {
  return Math.sqrt((mass * g) / dragCoefficient(radius));
}

/**
 * 静止状態から落とした球の運動を RK4 で数値積分する。
 * 運動方程式: m dv/dt = mg − k v|v|（空気抵抗 OFF なら k = 0）
 * 着地は「落下距離 = 高さ」を越えた刻みの中で線形補間して求める。
 */
export function simulateFall(
  { height, mass, g, drag, radius = 0.1 }: FallParams,
  dt = 0.001,
  maxTime = 120,
): FallResult {
  const kOverM = drag ? dragCoefficient(radius) / mass : 0;
  const acc = (v: number) => g - kOverM * v * Math.abs(v);

  const maxSteps = Math.ceil(maxTime / dt) + 1;
  const dist: number[] = [0];
  const speed: number[] = [0];
  let s = 0;
  let v = 0;

  for (let i = 1; i < maxSteps; i++) {
    // RK4（状態 = [s, v]）
    const k1s = v;
    const k1v = acc(v);
    const k2s = v + 0.5 * dt * k1v;
    const k2v = acc(v + 0.5 * dt * k1v);
    const k3s = v + 0.5 * dt * k2v;
    const k3v = acc(v + 0.5 * dt * k2v);
    const k4s = v + dt * k3v;
    const k4v = acc(v + dt * k3v);
    const sNext = s + (dt / 6) * (k1s + 2 * k2s + 2 * k3s + k4s);
    const vNext = v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);

    if (sNext >= height) {
      const f = (height - s) / (sNext - s);
      const landTime = (i - 1 + f) * dt;
      const landSpeed = v + f * (vNext - v);
      dist.push(height);
      speed.push(landSpeed);
      return {
        dt,
        dist: Float64Array.from(dist),
        speed: Float64Array.from(speed),
        landTime,
        landSpeed,
      };
    }
    s = sNext;
    v = vNext;
    dist.push(s);
    speed.push(v);
  }
  // maxTime 以内に着かなかった（通常の操作範囲では起きない）
  return {
    dt,
    dist: Float64Array.from(dist),
    speed: Float64Array.from(speed),
    landTime: maxTime,
    landSpeed: v,
  };
}

/** 時刻 t の落下距離（シミュ結果から補間して取り出す。着地後は高さで止める） */
export function fallDistanceAt(r: FallResult, t: number) {
  if (t >= r.landTime) return r.dist[r.dist.length - 1];
  const x = t / r.dt;
  const i = Math.floor(x);
  if (i + 1 >= r.dist.length) return r.dist[r.dist.length - 1];
  const f = x - i;
  return r.dist[i] + f * (r.dist[i + 1] - r.dist[i]);
}

export function fallSpeedAt(r: FallResult, t: number) {
  if (t >= r.landTime) return r.landSpeed;
  const i = Math.min(Math.floor(t / r.dt), r.speed.length - 1);
  return r.speed[i];
}

/* ───────── 理論値（検証用） ───────── */

/** 空気抵抗なしの落下時間 t = √(2h/g) */
export const theoryFallTime = (h: number, g: number) => Math.sqrt((2 * h) / g);

/** 2乗の空気抵抗ありの落下時間（解析解）t = (v_t/g)·arccosh(exp(gh/v_t²)) */
export function theoryFallTimeWithDrag(h: number, g: number, mass: number, radius: number) {
  const vt = terminalVelocity(mass, g, radius);
  return (vt / g) * Math.acosh(Math.exp((g * h) / (vt * vt)));
}

/** 目標時間 T で高さ h を落ちるのに必要な重力 g = 2h/T² */
export const requiredGravity = (h: number, T: number) => (2 * h) / (T * T);
