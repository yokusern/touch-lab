// さわれる実験室の自作 2D 物理エンジン（物理エンジンのライブラリは使っていない）
//
// - 単位: メートル・キログラム・秒。y は上向きが正。
// - 物体は「奥行き 1m の板」として扱う（質量 = 密度 × 面積 × 1m、空気抵抗の受ける面も幅 × 1m）。
// - 解き方: 速度→衝突・つなぎ目の拘束を「逐次インパルス法」で反復して解き、位置を進める（半陰的オイラー）。
//   衝突は分離軸判定 + 辺のクリッピングで最大 2 点の接触を作り、前の刻みの力を引き継いで（ウォームスタート）安定させる。

export type Vec = { x: number; y: number };

export type MaterialId = "wood" | "metal" | "rubber" | "ice" | "stone" | "foam";

export const MATERIALS: Record<
  MaterialId,
  { name: string; density: number; friction: number; restitution: number; color: string }
> = {
  wood: { name: "木", density: 600, friction: 0.5, restitution: 0.2, color: "#d9a066" },
  metal: { name: "鉄", density: 7800, friction: 0.4, restitution: 0.15, color: "#aab7c9" },
  rubber: { name: "ゴム", density: 1100, friction: 0.9, restitution: 0.8, color: "#ff8fb8" },
  ice: { name: "氷", density: 920, friction: 0.03, restitution: 0.05, color: "#9fe6ff" },
  stone: { name: "石", density: 2600, friction: 0.7, restitution: 0.1, color: "#8f9bb0" },
  foam: { name: "発泡スチロール", density: 30, friction: 0.5, restitution: 0.3, color: "#f4f7fb" },
};

export type Shape = { kind: "circle"; r: number } | { kind: "poly"; verts: Vec[] };

export interface Body {
  id: number;
  shape: Shape;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  area: number;
  density: number;
  mass: number;
  invMass: number;
  I: number;
  invI: number;
  isStatic: boolean;
  friction: number;
  restitution: number;
  material: MaterialId;
  color: string;
  label: string;
  /** 形の中心からいちばん遠い点までの距離 */
  bound: number;
  /** 多角形の世界座標の頂点と辺の外向き法線（毎刻み更新） */
  wv: Vec[];
  wn: Vec[];
  ln: Vec[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type JointKind = "pin" | "rod" | "rope" | "spring";

export interface Joint {
  id: number;
  kind: JointKind;
  a: Body;
  /** null のときは世界（動かない背景）に固定 */
  b: Body | null;
  /** a 上のつなぎ目（a のローカル座標） */
  la: Vec;
  /** b 上のつなぎ目（b のローカル座標）。b が null なら世界座標 */
  lb: Vec;
  /** 棒・ひも・ばねの長さ [m] */
  length: number;
  /** ばね定数 [N/m] */
  k: number;
  /** ばねの減衰 [N·s/m] */
  c: number;
  /** モーター（ピンのみ）。回転速度 [rad/s]、反時計回りが正 */
  motor: boolean;
  motorSpeed: number;
  maxTorque: number;
  // ソルバー用の作業領域
  _rA: Vec;
  _rB: Vec;
  _n: Vec;
  _mass: number;
  _bias: number;
  _gamma: number;
  _acc: number;
  _accP: Vec;
  _M: [number, number, number, number];
  _biasV: Vec;
  _motorMass: number;
  _motorAcc: number;
  _active: boolean;
}

export interface WorldSettings {
  /** 重力加速度 [m/s²]（下向き） */
  gravity: number;
  /** 空気抵抗 */
  airOn: boolean;
  /** 空気の密度 [kg/m³]（地球の地表 ≈ 1.2） */
  airDensity: number;
  /** 万有引力定数 G [N·m²/kg²]。0 なら物体どうしは引き合わない */
  attraction: number;
  /** 再生速度（1 = 実時間） */
  timeScale: number;
}

export const DEFAULT_SETTINGS: WorldSettings = {
  gravity: 9.81,
  airOn: false,
  airDensity: 1.2,
  attraction: 0,
  timeScale: 1,
};

export const DRAG_CD = 1.0; // 奥行きのある柱・板の抗力係数のおおよその値
export const G_REAL = 6.674e-11;

interface Contact {
  px: number;
  py: number;
  sep: number;
  id: number;
  rAx: number;
  rAy: number;
  rBx: number;
  rBy: number;
  Pn: number;
  Pt: number;
  massN: number;
  massT: number;
  bias: number;
}

interface Arbiter {
  a: Body;
  b: Body;
  nx: number;
  ny: number;
  contacts: Contact[];
  friction: number;
  restitution: number;
}

interface Manifold {
  nx: number;
  ny: number;
  pts: { x: number; y: number; sep: number; id: number }[];
}

interface Drag {
  body: Body;
  local: Vec;
  target: Vec;
  acc: Vec;
  M: [number, number, number, number];
  rx: number;
  ry: number;
  gamma: number;
  bx: number;
  by: number;
}

const SLOP = 0.002;
const BAUMGARTE = 0.2;
const ITERATIONS = 10;
const BOUNCE_THRESHOLD = 0.5;

/* ───────── ベクトルの小道具 ───────── */

const rot = (v: Vec, a: number): Vec => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * v.x - s * v.y, y: s * v.x + c * v.y };
};
const invRot = (v: Vec, a: number): Vec => rot(v, -a);

/* ───────── 形の計算 ───────── */

/** 凸包（アンドリューの単調鎖法）。反時計回りで返す。 */
export function convexHull(points: Vec[]): Vec[] {
  const p = points
    .map((v) => ({ x: v.x, y: v.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (p.length < 3) return p;
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 1e-12) lower.pop();
    lower.push(v);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 1e-12) upper.pop();
    upper.push(v);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** 多角形の面積・重心・重心まわりの断面二次モーメント（密度1あたり） */
export function polyMassProps(verts: Vec[]) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  let I = 0;
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i];
    const q = verts[(i + 1) % verts.length];
    const cr = p.x * q.y - p.y * q.x;
    area += cr / 2;
    cx += ((p.x + q.x) * cr) / 6;
    cy += ((p.y + q.y) * cr) / 6;
    I += (cr * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y)) / 12;
  }
  cx /= area;
  cy /= area;
  I -= area * (cx * cx + cy * cy);
  return { area, cx, cy, I };
}

function setMassFromDensity(b: Body) {
  if (b.shape.kind === "circle") {
    b.area = Math.PI * b.shape.r * b.shape.r;
    b.mass = b.density * b.area;
    b.I = 0.5 * b.mass * b.shape.r * b.shape.r;
  } else {
    const mp = polyMassProps(b.shape.verts);
    b.area = mp.area;
    b.mass = b.density * mp.area;
    b.I = b.density * mp.I;
  }
  b.invMass = b.isStatic ? 0 : 1 / b.mass;
  b.invI = b.isStatic ? 0 : 1 / b.I;
}

export function updateBodyGeometry(b: Body) {
  if (b.shape.kind === "circle") {
    const r = b.shape.r;
    b.minX = b.x - r;
    b.maxX = b.x + r;
    b.minY = b.y - r;
    b.maxY = b.y + r;
    return;
  }
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  const vs = b.shape.verts;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    const wx = b.x + c * v.x - s * v.y;
    const wy = b.y + s * v.x + c * v.y;
    b.wv[i].x = wx;
    b.wv[i].y = wy;
    const n = b.ln[i];
    b.wn[i].x = c * n.x - s * n.y;
    b.wn[i].y = s * n.x + c * n.y;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  b.minX = minX;
  b.maxX = maxX;
  b.minY = minY;
  b.maxY = maxY;
}

/* ───────── 衝突判定 ───────── */

function collideCircles(a: Body, b: Body): Manifold | null {
  const ra = (a.shape as { r: number }).r;
  const rb = (b.shape as { r: number }).r;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const rr = ra + rb;
  if (d2 > rr * rr) return null;
  const d = Math.sqrt(d2);
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : 1;
  const sep = d - rr;
  return {
    nx,
    ny,
    pts: [{ x: a.x + nx * (ra + sep / 2), y: a.y + ny * (ra + sep / 2), sep, id: 0 }],
  };
}

/** 多角形 p と円 c。法線は p → c 向き */
function collidePolyCircle(p: Body, c: Body): Manifold | null {
  const r = (c.shape as { r: number }).r;
  const n = p.wv.length;
  let best = -Infinity;
  let edge = 0;
  for (let i = 0; i < n; i++) {
    const s = p.wn[i].x * (c.x - p.wv[i].x) + p.wn[i].y * (c.y - p.wv[i].y);
    if (s > r) return null;
    if (s > best) {
      best = s;
      edge = i;
    }
  }
  const v1 = p.wv[edge];
  const v2 = p.wv[(edge + 1) % n];
  if (best < 1e-9) {
    const nx = p.wn[edge].x;
    const ny = p.wn[edge].y;
    const sep = best - r;
    return { nx, ny, pts: [{ x: c.x - nx * (r + sep / 2), y: c.y - ny * (r + sep / 2), sep, id: edge }] };
  }
  const u1 = (c.x - v1.x) * (v2.x - v1.x) + (c.y - v1.y) * (v2.y - v1.y);
  const u2 = (c.x - v2.x) * (v1.x - v2.x) + (c.y - v2.y) * (v1.y - v2.y);
  let nx: number;
  let ny: number;
  let sep: number;
  if (u1 <= 0 || u2 <= 0) {
    const v = u1 <= 0 ? v1 : v2;
    const dx = c.x - v.x;
    const dy = c.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > r) return null;
    nx = d > 1e-9 ? dx / d : p.wn[edge].x;
    ny = d > 1e-9 ? dy / d : p.wn[edge].y;
    sep = d - r;
  } else {
    nx = p.wn[edge].x;
    ny = p.wn[edge].y;
    sep = best - r;
  }
  return { nx, ny, pts: [{ x: c.x - nx * (r + sep / 2), y: c.y - ny * (r + sep / 2), sep, id: edge }] };
}

function maxSeparation(a: Body, b: Body): { sep: number; edge: number } {
  let best = -Infinity;
  let edge = 0;
  for (let i = 0; i < a.wv.length; i++) {
    const n = a.wn[i];
    const v = a.wv[i];
    let si = Infinity;
    for (let j = 0; j < b.wv.length; j++) {
      const d = n.x * (b.wv[j].x - v.x) + n.y * (b.wv[j].y - v.y);
      if (d < si) si = d;
    }
    if (si > best) {
      best = si;
      edge = i;
    }
  }
  return { sep: best, edge };
}

type ClipV = { x: number; y: number; id: number };

function clipSegment(vin: ClipV[], nx: number, ny: number, offset: number, clipId: number): ClipV[] {
  const out: ClipV[] = [];
  const d0 = nx * vin[0].x + ny * vin[0].y - offset;
  const d1 = nx * vin[1].x + ny * vin[1].y - offset;
  if (d0 <= 0) out.push(vin[0]);
  if (d1 <= 0) out.push(vin[1]);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    out.push({ x: vin[0].x + t * (vin[1].x - vin[0].x), y: vin[0].y + t * (vin[1].y - vin[0].y), id: clipId });
  }
  return out;
}

/** 多角形どうし。法線は a → b 向き */
function collidePolys(a: Body, b: Body): Manifold | null {
  const sa = maxSeparation(a, b);
  if (sa.sep > 0) return null;
  const sb = maxSeparation(b, a);
  if (sb.sep > 0) return null;

  let ref: Body;
  let inc: Body;
  let edge: number;
  let flip: boolean;
  if (sb.sep > sa.sep + 0.1 * SLOP) {
    ref = b;
    inc = a;
    edge = sb.edge;
    flip = true;
  } else {
    ref = a;
    inc = b;
    edge = sa.edge;
    flip = false;
  }

  const rn = ref.wn[edge];
  let incEdge = 0;
  let minDot = Infinity;
  for (let i = 0; i < inc.wn.length; i++) {
    const d = rn.x * inc.wn[i].x + rn.y * inc.wn[i].y;
    if (d < minDot) {
      minDot = d;
      incEdge = i;
    }
  }
  const i1 = incEdge;
  const i2 = (incEdge + 1) % inc.wv.length;
  const incident: ClipV[] = [
    { x: inc.wv[i1].x, y: inc.wv[i1].y, id: i1 },
    { x: inc.wv[i2].x, y: inc.wv[i2].y, id: i2 },
  ];

  const v11 = ref.wv[edge];
  const v12 = ref.wv[(edge + 1) % ref.wv.length];
  let tx = v12.x - v11.x;
  let ty = v12.y - v11.y;
  const tl = Math.hypot(tx, ty);
  tx /= tl;
  ty /= tl;
  const nx = ty;
  const ny = -tx;
  const front = nx * v11.x + ny * v11.y;
  const side1 = -(tx * v11.x + ty * v11.y);
  const side2 = tx * v12.x + ty * v12.y;

  let clip = clipSegment(incident, -tx, -ty, side1, 100);
  if (clip.length < 2) return null;
  clip = clipSegment(clip, tx, ty, side2, 200);
  if (clip.length < 2) return null;

  const pts: Manifold["pts"] = [];
  for (const cp of clip) {
    const sep = nx * cp.x + ny * cp.y - front;
    if (sep <= 0) {
      pts.push({
        x: cp.x - nx * (sep / 2),
        y: cp.y - ny * (sep / 2),
        sep,
        id: (flip ? 1 : 0) | (edge << 1) | (cp.id << 9),
      });
    }
  }
  if (pts.length === 0) return null;
  return flip ? { nx: -nx, ny: -ny, pts } : { nx, ny, pts };
}

function collide(a: Body, b: Body): Manifold | null {
  const ka = a.shape.kind;
  const kb = b.shape.kind;
  if (ka === "circle" && kb === "circle") return collideCircles(a, b);
  if (ka === "poly" && kb === "circle") return collidePolyCircle(a, b);
  if (ka === "circle" && kb === "poly") {
    const m = collidePolyCircle(b, a);
    if (!m) return null;
    m.nx = -m.nx;
    m.ny = -m.ny;
    return m;
  }
  return collidePolys(a, b);
}

/* ───────── 世界 ───────── */

export interface BodyOpts {
  material?: MaterialId;
  isStatic?: boolean;
  vx?: number;
  vy?: number;
  w?: number;
  angle?: number;
  color?: string;
  label?: string;
  density?: number;
  friction?: number;
  restitution?: number;
}

export class World {
  bodies: Body[] = [];
  joints: Joint[] = [];
  settings: WorldSettings = { ...DEFAULT_SETTINGS };
  time = 0;
  private arbiters = new Map<string, Arbiter>();
  private nextId = 1;
  private drag: Drag | null = null;
  private noCollide = new Set<string>();

  /* --- 物体をつくる --- */

  private makeBody(shape: Shape, x: number, y: number, o: BodyOpts): Body {
    const mat = MATERIALS[o.material ?? "wood"];
    const n = shape.kind === "poly" ? shape.verts.length : 0;
    const ln: Vec[] = [];
    if (shape.kind === "poly") {
      const vs = shape.verts;
      for (let i = 0; i < n; i++) {
        const p = vs[i];
        const q = vs[(i + 1) % n];
        const ex = q.x - p.x;
        const ey = q.y - p.y;
        const l = Math.hypot(ex, ey);
        ln.push({ x: ey / l, y: -ex / l });
      }
    }
    const b: Body = {
      id: this.nextId++,
      shape,
      x,
      y,
      a: o.angle ?? 0,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      w: o.w ?? 0,
      area: 0,
      density: o.density ?? mat.density,
      mass: 0,
      invMass: 0,
      I: 0,
      invI: 0,
      isStatic: o.isStatic ?? false,
      friction: o.friction ?? mat.friction,
      restitution: o.restitution ?? mat.restitution,
      material: o.material ?? "wood",
      color: o.color ?? mat.color,
      label: o.label ?? "",
      bound: shape.kind === "circle" ? shape.r : Math.max(...shape.verts.map((v) => Math.hypot(v.x, v.y))),
      wv: Array.from({ length: n }, () => ({ x: 0, y: 0 })),
      wn: Array.from({ length: n }, () => ({ x: 0, y: 0 })),
      ln,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
    setMassFromDensity(b);
    if (b.isStatic) {
      b.vx = b.vy = b.w = 0;
    }
    updateBodyGeometry(b);
    this.bodies.push(b);
    return b;
  }

  addCircle(x: number, y: number, r: number, o: BodyOpts = {}) {
    return this.makeBody({ kind: "circle", r }, x, y, o);
  }

  /** verts は (x, y) からの相対座標。重心が物体の中心になるように並べ直す */
  addPoly(x: number, y: number, verts: Vec[], o: BodyOpts = {}) {
    const hull = convexHull(verts);
    if (hull.length < 3) return null;
    const mp = polyMassProps(hull);
    if (!(mp.area > 1e-8)) return null;
    const local = hull.map((v) => ({ x: v.x - mp.cx, y: v.y - mp.cy }));
    // 回転 angle を与えた場合は、重心のずれも回して置く
    const off = rot({ x: mp.cx, y: mp.cy }, o.angle ?? 0);
    return this.makeBody({ kind: "poly", verts: local }, x + off.x, y + off.y, o);
  }

  addBox(x: number, y: number, w: number, h: number, o: BodyOpts = {}) {
    const hw = w / 2;
    const hh = h / 2;
    return this.addPoly(
      x,
      y,
      [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ],
      o,
    );
  }

  removeBody(b: Body) {
    this.bodies = this.bodies.filter((x) => x !== b);
    this.joints = this.joints.filter((j) => j.a !== b && j.b !== b);
    if (this.drag?.body === b) this.drag = null;
    for (const [k, arb] of this.arbiters) if (arb.a === b || arb.b === b) this.arbiters.delete(k);
    this.rebuildNoCollide();
  }

  removeJoint(j: Joint) {
    this.joints = this.joints.filter((x) => x !== j);
    this.rebuildNoCollide();
  }

  setStatic(b: Body, isStatic: boolean) {
    b.isStatic = isStatic;
    if (isStatic) b.vx = b.vy = b.w = 0;
    setMassFromDensity(b);
  }

  setMass(b: Body, mass: number) {
    if (!(mass > 0)) return;
    b.density = mass / b.area;
    setMassFromDensity(b);
  }

  setMaterial(b: Body, m: MaterialId) {
    const mat = MATERIALS[m];
    b.material = m;
    b.density = mat.density;
    b.friction = mat.friction;
    b.restitution = mat.restitution;
    b.color = mat.color;
    setMassFromDensity(b);
  }

  /* --- つなぐ --- */

  addJoint(
    kind: JointKind,
    a: Body,
    b: Body | null,
    worldA: Vec,
    worldB: Vec,
    o: Partial<Pick<Joint, "length" | "k" | "c" | "motor" | "motorSpeed" | "maxTorque">> = {},
  ): Joint {
    const la = invRot({ x: worldA.x - a.x, y: worldA.y - a.y }, a.a);
    const lb = b ? invRot({ x: worldB.x - b.x, y: worldB.y - b.y }, b.a) : { x: worldB.x, y: worldB.y };
    const length = kind === "pin" ? 0 : (o.length ?? Math.hypot(worldB.x - worldA.x, worldB.y - worldA.y));
    const j: Joint = {
      id: this.nextId++,
      kind,
      a,
      b,
      la,
      lb,
      length,
      k: o.k ?? 200,
      c: o.c ?? 2,
      motor: o.motor ?? false,
      motorSpeed: o.motorSpeed ?? 0,
      maxTorque: o.maxTorque ?? 5000,
      _rA: { x: 0, y: 0 },
      _rB: { x: 0, y: 0 },
      _n: { x: 0, y: 0 },
      _mass: 0,
      _bias: 0,
      _gamma: 0,
      _acc: 0,
      _accP: { x: 0, y: 0 },
      _M: [0, 0, 0, 0],
      _biasV: { x: 0, y: 0 },
      _motorMass: 0,
      _motorAcc: 0,
      _active: true,
    };
    this.joints.push(j);
    this.rebuildNoCollide();
    return j;
  }

  /** ピンでつないだ 2 つの物体どうしはぶつからない（車輪と車体など） */
  private rebuildNoCollide() {
    this.noCollide.clear();
    for (const j of this.joints) {
      if (j.kind === "pin" && j.b) this.noCollide.add(pairKey(j.a, j.b));
    }
  }

  jointWorldPoints(j: Joint): { pa: Vec; pb: Vec } {
    const ra = rot(j.la, j.a.a);
    const pa = { x: j.a.x + ra.x, y: j.a.y + ra.y };
    if (!j.b) return { pa, pb: { x: j.lb.x, y: j.lb.y } };
    const rb = rot(j.lb, j.b.a);
    return { pa, pb: { x: j.b.x + rb.x, y: j.b.y + rb.y } };
  }

  /* --- 探す --- */

  bodyAt(p: Vec): Body | null {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (containsPoint(b, p)) return b;
    }
    return null;
  }

  bodiesAt(p: Vec): Body[] {
    const out: Body[] = [];
    for (let i = this.bodies.length - 1; i >= 0; i--) if (containsPoint(this.bodies[i], p)) out.push(this.bodies[i]);
    return out;
  }

  /* --- 指でつかんで引っぱる（再生中） --- */

  startDrag(b: Body, p: Vec) {
    if (b.isStatic) return;
    this.drag = {
      body: b,
      local: invRot({ x: p.x - b.x, y: p.y - b.y }, b.a),
      target: { ...p },
      acc: { x: 0, y: 0 },
      M: [0, 0, 0, 0],
      rx: 0,
      ry: 0,
      gamma: 0,
      bx: 0,
      by: 0,
    };
  }
  moveDrag(p: Vec) {
    if (this.drag) this.drag.target = { ...p };
  }
  endDrag() {
    this.drag = null;
  }
  get dragging() {
    return this.drag;
  }

  /** ふきとばす: 中心から離れる向きに、近いほど大きな速度を加える（重さに関係なく同じ速度） */
  blast(p: Vec, speed: number, radius: number) {
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > radius || d < 1e-6) continue;
      const dv = speed * (1 - d / radius);
      b.vx += (dx / d) * dv;
      b.vy += (dy / d) * dv;
    }
  }

  /* --- 時間を進める --- */

  step(h: number) {
    const s = this.settings;
    const invH = 1 / h;
    const bodies = this.bodies;

    // 1) 力 → 速度（重力・万有引力・空気抵抗）
    for (const b of bodies) {
      if (b.isStatic) continue;
      b.vy -= s.gravity * h;
    }
    if (s.attraction > 0) {
      for (let i = 0; i < bodies.length; i++) {
        const A = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const B = bodies[j];
          if (A.isStatic && B.isStatic) continue;
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          // 重なるほど近づいたときに力が無限大にならないよう、ごく小さな「やわらげ」を入れる
          const soft = 0.1 * (A.bound + B.bound);
          const r2 = dx * dx + dy * dy + soft * soft;
          const r = Math.sqrt(r2);
          const f = (s.attraction * A.mass * B.mass) / r2; // [N]
          const fx = (f * dx) / r;
          const fy = (f * dy) / r;
          A.vx += fx * A.invMass * h;
          A.vy += fy * A.invMass * h;
          B.vx -= fx * B.invMass * h;
          B.vy -= fy * B.invMass * h;
        }
      }
    }
    if (s.airOn && s.airDensity > 0) {
      for (const b of bodies) {
        if (b.isStatic) continue;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 1e-9) continue;
        const width = projectedWidth(b, -b.vy / sp, b.vx / sp);
        const k = 0.5 * s.airDensity * DRAG_CD * width * 1; // 奥行き 1m
        // 抗力 F = k v²。半陰的に解いて、速度の向きが反転しないようにする
        const f = 1 / (1 + h * k * sp * b.invMass);
        b.vx *= f;
        b.vy *= f;
        const wr = 1 / (1 + h * 0.5 * s.airDensity * width * b.bound * b.bound * b.bound * Math.abs(b.w) * b.invI * 0.25);
        b.w *= wr;
      }
    }

    // 2) 衝突を見つける（x 方向に並べて掃く）
    this.broadphase();

    // 3) 拘束の準備
    for (const arb of this.arbiters.values()) preStepArbiter(arb, invH);
    for (const j of this.joints) preStepJoint(j, h, invH);
    if (this.drag) preStepDrag(this.drag, h);

    // 4) 反復して解く
    for (let it = 0; it < ITERATIONS; it++) {
      for (const j of this.joints) solveJoint(j, h);
      if (this.drag) solveDrag(this.drag, h);
      for (const arb of this.arbiters.values()) solveArbiter(arb);
    }

    // 5) 位置を進める
    for (const b of bodies) {
      if (b.isStatic) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.w * h;
      updateBodyGeometry(b);
    }

    // 壊れた値・はるか遠くへ飛んだ物体は片づける
    const lost = bodies.filter(
      (b) => !Number.isFinite(b.x) || !Number.isFinite(b.y) || Math.abs(b.x) > 1e6 || Math.abs(b.y) > 1e6,
    );
    for (const b of lost) this.removeBody(b);

    this.time += h;
  }

  private broadphase() {
    const list = this.bodies.slice().sort((p, q) => p.minX - q.minX);
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        if (B.minX > A.maxX) break;
        if (A.isStatic && B.isStatic) continue;
        if (B.minY > A.maxY || B.maxY < A.minY) continue;
        const a = A.id < B.id ? A : B;
        const b = A.id < B.id ? B : A;
        const key = pairKey(a, b);
        if (this.noCollide.has(key)) continue;
        const m = collide(a, b);
        if (!m) continue;
        seen.add(key);
        const old = this.arbiters.get(key);
        const contacts: Contact[] = m.pts.map((p) => {
          const prev = old?.contacts.find((c) => c.id === p.id);
          return {
            px: p.x,
            py: p.y,
            sep: p.sep,
            id: p.id,
            rAx: 0,
            rAy: 0,
            rBx: 0,
            rBy: 0,
            Pn: prev ? prev.Pn : 0,
            Pt: prev ? prev.Pt : 0,
            massN: 0,
            massT: 0,
            bias: 0,
          };
        });
        this.arbiters.set(key, {
          a,
          b,
          nx: m.nx,
          ny: m.ny,
          contacts,
          friction: Math.sqrt(a.friction * b.friction),
          restitution: Math.max(a.restitution, b.restitution),
        });
      }
    }
    for (const k of this.arbiters.keys()) if (!seen.has(k)) this.arbiters.delete(k);
  }

  /** いま触れ合っている点（描画用） */
  contactPoints(): Vec[] {
    const out: Vec[] = [];
    for (const arb of this.arbiters.values()) for (const c of arb.contacts) out.push({ x: c.px, y: c.py });
    return out;
  }

  /** 全体の運動エネルギー・位置エネルギー（重力のみ）・運動量 */
  energy() {
    let ke = 0;
    let pe = 0;
    let px = 0;
    let py = 0;
    for (const b of this.bodies) {
      if (b.isStatic) continue;
      ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.w * b.w;
      pe += b.mass * this.settings.gravity * b.y;
      px += b.mass * b.vx;
      py += b.mass * b.vy;
    }
    return { ke, pe, px, py };
  }
}

function pairKey(a: Body, b: Body) {
  return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
}

export function containsPoint(b: Body, p: Vec): boolean {
  if (b.shape.kind === "circle") return (p.x - b.x) ** 2 + (p.y - b.y) ** 2 <= b.shape.r * b.shape.r;
  for (let i = 0; i < b.wv.length; i++) {
    if (b.wn[i].x * (p.x - b.wv[i].x) + b.wn[i].y * (p.y - b.wv[i].y) > 0) return false;
  }
  return true;
}

/** (px, py) 方向に投影したときの物体の幅 */
function projectedWidth(b: Body, px: number, py: number): number {
  if (b.shape.kind === "circle") return 2 * b.shape.r;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of b.wv) {
    const d = v.x * px + v.y * py;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return hi - lo;
}

/* ───────── 接触の解き方（逐次インパルス法） ───────── */

function preStepArbiter(arb: Arbiter, invH: number) {
  const { a, b, nx, ny } = arb;
  const tx = ny;
  const ty = -nx;
  for (const c of arb.contacts) {
    c.rAx = c.px - a.x;
    c.rAy = c.py - a.y;
    c.rBx = c.px - b.x;
    c.rBy = c.py - b.y;
    const rnA = c.rAx * ny - c.rAy * nx;
    const rnB = c.rBx * ny - c.rBy * nx;
    c.massN = 1 / (a.invMass + b.invMass + a.invI * rnA * rnA + b.invI * rnB * rnB);
    const rtA = c.rAx * ty - c.rAy * tx;
    const rtB = c.rBx * ty - c.rBy * tx;
    c.massT = 1 / (a.invMass + b.invMass + a.invI * rtA * rtA + b.invI * rtB * rtB);

    // めり込みを少しずつ戻す速度 と はね返りの速度
    const posBias = -BAUMGARTE * invH * Math.min(0, c.sep + SLOP);
    const dvx = b.vx - b.w * c.rBy - (a.vx - a.w * c.rAy);
    const dvy = b.vy + b.w * c.rBx - (a.vy + a.w * c.rAx);
    const vn = dvx * nx + dvy * ny;
    const bounce = vn < -BOUNCE_THRESHOLD ? -arb.restitution * vn : 0;
    c.bias = Math.max(posBias, bounce);

    // ウォームスタート
    const Px = c.Pn * nx + c.Pt * tx;
    const Py = c.Pn * ny + c.Pt * ty;
    a.vx -= a.invMass * Px;
    a.vy -= a.invMass * Py;
    a.w -= a.invI * (c.rAx * Py - c.rAy * Px);
    b.vx += b.invMass * Px;
    b.vy += b.invMass * Py;
    b.w += b.invI * (c.rBx * Py - c.rBy * Px);
  }
}

function solveArbiter(arb: Arbiter) {
  const { a, b, nx, ny } = arb;
  const tx = ny;
  const ty = -nx;
  for (const c of arb.contacts) {
    let dvx = b.vx - b.w * c.rBy - (a.vx - a.w * c.rAy);
    let dvy = b.vy + b.w * c.rBx - (a.vy + a.w * c.rAx);
    const vn = dvx * nx + dvy * ny;
    let dPn = c.massN * (-vn + c.bias);
    const Pn0 = c.Pn;
    c.Pn = Math.max(Pn0 + dPn, 0);
    dPn = c.Pn - Pn0;
    let Px = dPn * nx;
    let Py = dPn * ny;
    a.vx -= a.invMass * Px;
    a.vy -= a.invMass * Py;
    a.w -= a.invI * (c.rAx * Py - c.rAy * Px);
    b.vx += b.invMass * Px;
    b.vy += b.invMass * Py;
    b.w += b.invI * (c.rBx * Py - c.rBy * Px);

    // 摩擦（クーロン摩擦: |摩擦力| ≤ μ × 垂直抗力）
    dvx = b.vx - b.w * c.rBy - (a.vx - a.w * c.rAy);
    dvy = b.vy + b.w * c.rBx - (a.vy + a.w * c.rAx);
    const vt = dvx * tx + dvy * ty;
    let dPt = c.massT * -vt;
    const maxPt = arb.friction * c.Pn;
    const Pt0 = c.Pt;
    c.Pt = Math.max(-maxPt, Math.min(Pt0 + dPt, maxPt));
    dPt = c.Pt - Pt0;
    Px = dPt * tx;
    Py = dPt * ty;
    a.vx -= a.invMass * Px;
    a.vy -= a.invMass * Py;
    a.w -= a.invI * (c.rAx * Py - c.rAy * Px);
    b.vx += b.invMass * Px;
    b.vy += b.invMass * Py;
    b.w += b.invI * (c.rBx * Py - c.rBy * Px);
  }
}

/* ───────── つなぎ目の解き方 ───────── */

const STATIC_INV = { invMass: 0, invI: 0 };

function preStepJoint(j: Joint, h: number, invH: number) {
  const a = j.a;
  const b = j.b;
  const rA = rot(j.la, a.a);
  const rB = b ? rot(j.lb, b.a) : { x: 0, y: 0 };
  j._rA = rA;
  j._rB = rB;
  const pA = { x: a.x + rA.x, y: a.y + rA.y };
  const pB = b ? { x: b.x + rB.x, y: b.y + rB.y } : { x: j.lb.x, y: j.lb.y };
  const mA = a.invMass;
  const iA = a.invI;
  const mB = b ? b.invMass : STATIC_INV.invMass;
  const iB = b ? b.invI : STATIC_INV.invI;

  if (j.kind === "pin") {
    const k11 = mA + mB + iA * rA.y * rA.y + iB * rB.y * rB.y;
    const k12 = -iA * rA.x * rA.y - iB * rB.x * rB.y;
    const k22 = mA + mB + iA * rA.x * rA.x + iB * rB.x * rB.x;
    const det = k11 * k22 - k12 * k12;
    const inv = det !== 0 ? 1 / det : 0;
    j._M = [inv * k22, -inv * k12, -inv * k12, inv * k11];
    j._biasV = { x: -BAUMGARTE * invH * (pB.x - pA.x), y: -BAUMGARTE * invH * (pB.y - pA.y) };
    // ウォームスタート
    applyPair(j, j._accP.x, j._accP.y);
    const mm = iA + iB;
    j._motorMass = mm > 0 ? 1 / mm : 0;
    if (j.motor) {
      a.w += iA * j._motorAcc;
      if (b) b.w -= iB * j._motorAcc;
    } else j._motorAcc = 0;
    return;
  }

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    j._active = false;
    j._acc = 0;
    return;
  }
  const n = { x: dx / len, y: dy / len };
  j._n = n;
  const C = len - j.length;
  if (j.kind === "rope" && C <= 0) {
    j._active = false;
    j._acc = 0;
    return;
  }
  j._active = true;
  const rnA = rA.x * n.y - rA.y * n.x;
  const rnB = rB.x * n.y - rB.y * n.x;
  const kk = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
  if (j.kind === "spring") {
    // ばねを陰的に解く（硬いばねでも爆発しにくい）
    let gamma = h * (j.c + h * j.k);
    gamma = gamma > 0 ? 1 / gamma : 0;
    j._gamma = gamma;
    j._bias = C * h * j.k * gamma;
    j._mass = kk + gamma > 0 ? 1 / (kk + gamma) : 0;
  } else {
    j._gamma = 0;
    j._bias = BAUMGARTE * invH * C;
    j._mass = kk > 0 ? 1 / kk : 0;
  }
  applyPair(j, j._acc * n.x, j._acc * n.y);
}

/** a に -P、b に +P の衝撃を加える */
function applyPair(j: Joint, Px: number, Py: number) {
  const a = j.a;
  const rA = j._rA;
  a.vx -= a.invMass * Px;
  a.vy -= a.invMass * Py;
  a.w -= a.invI * (rA.x * Py - rA.y * Px);
  const b = j.b;
  if (b) {
    const rB = j._rB;
    b.vx += b.invMass * Px;
    b.vy += b.invMass * Py;
    b.w += b.invI * (rB.x * Py - rB.y * Px);
  }
}

function relVel(j: Joint) {
  const a = j.a;
  const b = j.b;
  const rA = j._rA;
  const vAx = a.vx - a.w * rA.y;
  const vAy = a.vy + a.w * rA.x;
  if (!b) return { x: -vAx, y: -vAy };
  const rB = j._rB;
  return { x: b.vx - b.w * rB.y - vAx, y: b.vy + b.w * rB.x - vAy };
}

function solveJoint(j: Joint, h: number) {
  if (j.kind === "pin") {
    if (j.motor) {
      const a = j.a;
      const b = j.b;
      const cdot = a.w - (b ? b.w : 0) - j.motorSpeed;
      let imp = -j._motorMass * cdot;
      const old = j._motorAcc;
      const max = j.maxTorque * h;
      j._motorAcc = Math.max(-max, Math.min(old + imp, max));
      imp = j._motorAcc - old;
      a.w += a.invI * imp;
      if (b) b.w -= b.invI * imp;
    }
    const dv = relVel(j);
    const ex = j._biasV.x - dv.x;
    const ey = j._biasV.y - dv.y;
    const M = j._M;
    const Px = M[0] * ex + M[1] * ey;
    const Py = M[2] * ex + M[3] * ey;
    j._accP.x += Px;
    j._accP.y += Py;
    applyPair(j, Px, Py);
    return;
  }
  if (!j._active) return;
  const n = j._n;
  const dv = relVel(j);
  const cdot = dv.x * n.x + dv.y * n.y;
  let imp = -j._mass * (cdot + j._bias + j._gamma * j._acc);
  if (j.kind === "rope") {
    const old = j._acc;
    j._acc = Math.min(old + imp, 0);
    imp = j._acc - old;
  } else j._acc += imp;
  applyPair(j, imp * n.x, imp * n.y);
}

/* ───────── 指でつかむ（やわらかいばねで目標点へ引く） ───────── */

function preStepDrag(d: Drag, h: number) {
  const b = d.body;
  const r = rot(d.local, b.a);
  d.rx = r.x;
  d.ry = r.y;
  const omega = 2 * Math.PI * 4;
  const zeta = 0.8;
  const m = b.mass;
  const k = m * omega * omega;
  const c = 2 * m * zeta * omega;
  let gamma = h * (c + h * k);
  gamma = gamma > 0 ? 1 / gamma : 0;
  d.gamma = gamma;
  const beta = h * k * gamma;
  const k11 = b.invMass + gamma + b.invI * r.y * r.y;
  const k12 = -b.invI * r.x * r.y;
  const k22 = b.invMass + gamma + b.invI * r.x * r.x;
  const det = k11 * k22 - k12 * k12;
  const inv = det !== 0 ? 1 / det : 0;
  d.M = [inv * k22, -inv * k12, -inv * k12, inv * k11];
  d.bx = beta * (b.x + r.x - d.target.x);
  d.by = beta * (b.y + r.y - d.target.y);
  d.acc.x = 0;
  d.acc.y = 0;
  b.w *= 0.98;
}

function solveDrag(d: Drag, h: number) {
  const b = d.body;
  const vx = b.vx - b.w * d.ry;
  const vy = b.vy + b.w * d.rx;
  const ex = -(vx + d.bx + d.gamma * d.acc.x);
  const ey = -(vy + d.by + d.gamma * d.acc.y);
  let Px = d.M[0] * ex + d.M[1] * ey;
  let Py = d.M[2] * ex + d.M[3] * ey;
  const ox = d.acc.x;
  const oy = d.acc.y;
  d.acc.x += Px;
  d.acc.y += Py;
  const max = 300 * b.mass * h;
  const l = Math.hypot(d.acc.x, d.acc.y);
  if (l > max) {
    d.acc.x *= max / l;
    d.acc.y *= max / l;
  }
  Px = d.acc.x - ox;
  Py = d.acc.y - oy;
  b.vx += b.invMass * Px;
  b.vy += b.invMass * Py;
  b.w += b.invI * (d.rx * Py - d.ry * Px);
}
