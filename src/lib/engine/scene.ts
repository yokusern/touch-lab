// 実験（シーン）の保存形式・共有URL・サンプル
import {
  DEFAULT_SETTINGS,
  MATERIALS,
  World,
  type Body,
  type JointKind,
  type MaterialId,
  type WorldSettings,
} from "./engine.ts";

export type View = { cx: number; cy: number; span: number };

export type SceneBody = {
  s: "c" | "p";
  r?: number;
  v?: [number, number][];
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  m: MaterialId;
  st: 0 | 1;
  d: number;
  f: number;
  e: number;
  col: string;
  lb: string;
};

export type SceneJoint = {
  k: JointKind;
  a: number;
  b: number; // -1 = 世界
  la: [number, number];
  lb: [number, number];
  len: number;
  ks: number;
  c: number;
  mo: 0 | 1;
  ms: number;
  mt: number;
};

export type Scene = {
  v: 1;
  title: string;
  note: string;
  settings: WorldSettings;
  bodies: SceneBody[];
  joints: SceneJoint[];
  view: View;
  trails: boolean;
  vectors: boolean;
};

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => (Math.abs(x) >= 1e4 ? Math.round(x) : Number(x.toPrecision(6)));

export function serialize(
  world: World,
  meta: { title: string; note: string; view: View; trails: boolean; vectors: boolean },
): Scene {
  const index = new Map<Body, number>();
  world.bodies.forEach((b, i) => index.set(b, i));
  return {
    v: 1,
    title: meta.title,
    note: meta.note,
    settings: { ...world.settings },
    view: { cx: r4(meta.view.cx), cy: r4(meta.view.cy), span: r4(meta.view.span) },
    trails: meta.trails,
    vectors: meta.vectors,
    bodies: world.bodies.map((b) => ({
      s: b.shape.kind === "circle" ? "c" : "p",
      ...(b.shape.kind === "circle"
        ? { r: r4(b.shape.r) }
        : { v: b.shape.verts.map((p) => [r4(p.x), r4(p.y)] as [number, number]) }),
      x: r4(b.x),
      y: r4(b.y),
      a: r4(b.a),
      vx: r4(b.vx),
      vy: r4(b.vy),
      w: r4(b.w),
      m: b.material,
      st: b.isStatic ? 1 : 0,
      d: r6(b.density),
      f: r4(b.friction),
      e: r4(b.restitution),
      col: b.color,
      lb: b.label,
    })),
    joints: world.joints.map((j) => ({
      k: j.kind,
      a: index.get(j.a) ?? 0,
      b: j.b ? (index.get(j.b) ?? -1) : -1,
      la: [r4(j.la.x), r4(j.la.y)],
      lb: [r4(j.lb.x), r4(j.lb.y)],
      len: r4(j.length),
      ks: r6(j.k),
      c: r6(j.c),
      mo: j.motor ? 1 : 0,
      ms: r4(j.motorSpeed),
      mt: r6(j.maxTorque),
    })),
  };
}

const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);

/** 共有URLなど外から来たデータでも壊れないように、値を確かめながら世界を組み立てる */
export function buildWorld(scene: Scene): World {
  const w = new World();
  const st = scene.settings ?? DEFAULT_SETTINGS;
  w.settings = {
    gravity: num(st.gravity, 9.81),
    airOn: !!st.airOn,
    airDensity: Math.max(0, num(st.airDensity, 1.2)),
    attraction: Math.max(0, num(st.attraction, 0)),
    timeScale: Math.min(8, Math.max(0.05, num(st.timeScale, 1))),
  };
  const made: (Body | null)[] = [];
  for (const sb of (scene.bodies ?? []).slice(0, 600)) {
    const material: MaterialId = sb.m in MATERIALS ? sb.m : "wood";
    const opts = {
      material,
      isStatic: sb.st === 1,
      vx: num(sb.vx, 0),
      vy: num(sb.vy, 0),
      w: num(sb.w, 0),
      angle: num(sb.a, 0),
      color: typeof sb.col === "string" && /^#[0-9a-fA-F]{3,8}$/.test(sb.col) ? sb.col : undefined,
      label: typeof sb.lb === "string" ? sb.lb.slice(0, 40) : "",
      density: Math.max(1e-6, num(sb.d, MATERIALS[material].density)),
      friction: Math.max(0, num(sb.f, MATERIALS[material].friction)),
      restitution: Math.min(1.2, Math.max(0, num(sb.e, MATERIALS[material].restitution))),
    };
    let b: Body | null = null;
    if (sb.s === "c") b = w.addCircle(num(sb.x, 0), num(sb.y, 0), Math.max(0.005, num(sb.r, 0.25)), opts);
    else if (Array.isArray(sb.v))
      b = w.addPoly(
        num(sb.x, 0),
        num(sb.y, 0),
        sb.v.slice(0, 16).map((p) => ({ x: num(p?.[0], 0), y: num(p?.[1], 0) })),
        opts,
      );
    made.push(b);
  }
  for (const sj of (scene.joints ?? []).slice(0, 600)) {
    const a = made[sj.a];
    const b = sj.b >= 0 ? made[sj.b] : null;
    if (!a || (sj.b >= 0 && !b)) continue;
    const kind: JointKind = ["pin", "rod", "rope", "spring"].includes(sj.k) ? sj.k : "rod";
    const ca = Math.cos(a.a);
    const sa = Math.sin(a.a);
    const la = { x: num(sj.la?.[0], 0), y: num(sj.la?.[1], 0) };
    const pa = { x: a.x + ca * la.x - sa * la.y, y: a.y + sa * la.x + ca * la.y };
    const lb = { x: num(sj.lb?.[0], 0), y: num(sj.lb?.[1], 0) };
    const pb = b
      ? { x: b.x + Math.cos(b.a) * lb.x - Math.sin(b.a) * lb.y, y: b.y + Math.sin(b.a) * lb.x + Math.cos(b.a) * lb.y }
      : lb;
    w.addJoint(kind, a, b, pa, pb, {
      length: Math.max(0, num(sj.len, 1)),
      k: Math.max(0, num(sj.ks, 200)),
      c: Math.max(0, num(sj.c, 2)),
      motor: sj.mo === 1,
      motorSpeed: num(sj.ms, 0),
      maxTorque: Math.max(0, num(sj.mt, 5000)),
    });
  }
  return w;
}

/* ───────── 共有URL（圧縮して # の後ろに入れる。サーバーには送られない） ───────── */

function toB64Url(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function encodeScene(scene: Scene): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(scene));
  if (typeof CompressionStream !== "undefined") {
    try {
      return "1." + toB64Url(await pipe(raw, new CompressionStream("deflate-raw")));
    } catch {
      /* 圧縮できない環境はそのまま */
    }
  }
  return "0." + toB64Url(raw);
}

export async function decodeScene(code: string): Promise<Scene | null> {
  try {
    const [ver, body] = code.split(".", 2);
    let bytes = fromB64Url(body);
    if (ver === "1") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    const scene = JSON.parse(new TextDecoder().decode(bytes));
    if (!scene || scene.v !== 1 || !Array.isArray(scene.bodies)) return null;
    return scene as Scene;
  } catch {
    return null;
  }
}

/* ───────── サンプル ───────── */

export type Sample = { id: string; title: string; note: string; make: () => Scene };

const GROUND = "#33476b";

function ground(w: World, width = 200) {
  w.addBox(0, -0.5, width, 1, { material: "stone", isStatic: true, color: GROUND, label: "地面" });
}

function scene(
  w: World,
  title: string,
  note: string,
  view: View,
  extra: Partial<Pick<Scene, "trails" | "vectors">> = {},
): Scene {
  return serialize(w, { title, note, view, trails: extra.trails ?? false, vectors: extra.vectors ?? false });
}

export const BLANK_TITLE = "無題の実験";

export function blankScene(title = BLANK_TITLE): Scene {
  const w = new World();
  ground(w);
  return scene(w, title, "", { cx: 0, cy: 4, span: 16 });
}

export const SAMPLES: Sample[] = [
  {
    id: "domino",
    title: "ピタゴラ風ドミノ",
    note: "木の玉が坂をころがって段差からとび出し、ドミノを倒していく。最後のドミノはボールを落とせるかな？",
    make() {
      const w = new World();
      ground(w);
      // 坂と、その先の段差（玉がとび出してドミノの上のほうに当たる）
      w.addPoly(0, 0, [
        { x: -11, y: 0 },
        { x: -6, y: 0 },
        { x: -6, y: 0.9 },
        { x: -11, y: 3.6 },
      ], { isStatic: true, material: "stone", color: GROUND, label: "坂" });
      w.addCircle(-10.6, 4.1, 0.2, { material: "wood", color: "#ffbe55", label: "木の玉" });
      for (let i = 0; i < 14; i++) {
        w.addBox(-5.3 + i * 0.5, 0.5, 0.12, 1, { material: "wood", color: i % 2 ? "#e9b47a" : "#d9a066" });
      }
      // 終点：台の上のボール
      w.addBox(1.95, 0.25, 0.7, 0.5, { isStatic: true, material: "stone", color: GROUND });
      w.addCircle(1.85, 0.8, 0.3, { material: "rubber", label: "ゴールの玉" });
      return scene(w, this.title, this.note, { cx: -3.5, cy: 2, span: 16 });
    },
  },
  {
    id: "pendulum",
    title: "ふりこ・ばね・二重ふりこ",
    note: "左はひものふりこ、中央はばねにつるした箱、右は2本の棒をつないだ二重ふりこ。二重ふりこは少しのちがいで動きがまったく変わる（カオス）。",
    make() {
      const w = new World();
      ground(w);
      const bob = w.addCircle(-5 + 2.5 * Math.sin(0.7), 6 - 2.5 * Math.cos(0.7), 0.25, { material: "metal", label: "おもり" });
      w.addJoint("rope", bob, null, { x: bob.x, y: bob.y }, { x: -5, y: 6 });
      const box = w.addBox(0, 3.2, 0.6, 0.6, { material: "wood", label: "箱" })!;
      w.addJoint("spring", box, null, { x: 0, y: 3.5 }, { x: 0, y: 6.2 }, { length: 1.6, k: 4000, c: 10 });
      const p1 = w.addCircle(5 + 1.4, 5.5, 0.2, { material: "metal" });
      const p2 = w.addCircle(5 + 2.8, 5.5, 0.2, { material: "rubber" });
      w.addJoint("rod", p1, null, { x: p1.x, y: p1.y }, { x: 5, y: 5.5 });
      w.addJoint("rod", p2, p1, { x: p2.x, y: p2.y }, { x: p1.x, y: p1.y });
      return scene(w, this.title, this.note, { cx: 1.5, cy: 3.5, span: 15 }, { trails: true });
    },
  },
  {
    id: "orbit",
    title: "惑星の軌道",
    note: "重力（下向き）を0にして、物体どうしが引き合う「万有引力」をオンにした宇宙。初速の大きさで、円・だ円・飛び去るが変わる。",
    make() {
      const w = new World();
      w.settings.gravity = 0;
      w.settings.attraction = 1e-6;
      const GM = 60;
      const sunR = 1.2;
      w.addCircle(0, 0, sunR, {
        isStatic: true,
        material: "stone",
        density: GM / 1e-6 / (Math.PI * sunR * sunR),
        color: "#ffbe55",
        label: "太陽",
      });
      const orbit = (r: number, factor: number, color: string, label: string) =>
        w.addCircle(r, 0, 0.25, { material: "rubber", vy: factor * Math.sqrt(GM / r), color, label });
      orbit(4, 1, "#52d6ff", "円軌道の惑星");
      orbit(7, 0.8, "#5ee6a0", "だ円軌道の惑星");
      orbit(10, 1, "#ff8fb8", "外側の惑星");
      return scene(w, this.title, this.note, { cx: 0, cy: 0, span: 26 }, { trails: true, vectors: true });
    },
  },
  {
    id: "car",
    title: "モーターの車",
    note: "車輪をモーター付きのピンで車体につないだ車。坂をのぼれるかは、モーターの強さ（トルク）と摩擦しだい。",
    make() {
      const w = new World();
      ground(w);
      const chassis = w.addBox(-8, 1.25, 2.4, 0.4, { material: "wood", label: "車体" })!;
      const wheel = (x: number) => {
        const wh = w.addCircle(x, 0.45, 0.45, { material: "rubber", color: "#2a2f3a", label: "車輪" });
        w.addJoint("pin", wh, chassis, { x, y: 0.45 }, { x, y: 0.45 }, { motor: true, motorSpeed: -5, maxTorque: 4000 });
      };
      wheel(-8.9);
      wheel(-7.1);
      w.addPoly(0, 0, [
        { x: -3, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1.2 },
      ], { isStatic: true, material: "stone", color: GROUND, label: "坂" });
      w.addBox(5, 0.6, 4, 1.2, { isStatic: true, material: "stone", color: GROUND });
      for (let i = 0; i < 4; i++) w.addBox(8 + i * 0.6, 0.3, 0.5, 0.6, { material: "foam" });
      return scene(w, this.title, this.note, { cx: -1, cy: 2.5, span: 22 });
    },
  },
  {
    id: "moon-tower",
    title: "月で積み木くずし",
    note: "重力を月（1.62 m/s²）にして、積み木のタワーに鉄球を投げこむ。地球のときと、くずれ方や飛び方をくらべてみよう。",
    make() {
      const w = new World();
      w.settings.gravity = 1.62;
      ground(w);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 3; col++) {
          w.addBox(3 + col * 0.62, 0.3 + row * 0.6, 0.6, 0.6, {
            material: "wood",
            color: (row + col) % 2 ? "#e9b47a" : "#d9a066",
          });
        }
      }
      w.addCircle(-6, 1.5, 0.35, { material: "metal", vx: 9, vy: 3, label: "鉄球" });
      return scene(w, this.title, this.note, { cx: 0, cy: 3, span: 18 }, { trails: true });
    },
  },
  {
    id: "thick-air",
    title: "もし空気が10倍こかったら",
    note: "空気の濃さを地球の10倍（12 kg/m³）にして、鉄の玉と発泡スチロールの玉を同じ高さから落とす。空気抵抗をオフにすると同時に着く。",
    make() {
      const w = new World();
      w.settings.airOn = true;
      w.settings.airDensity = 12;
      ground(w);
      w.addCircle(-1, 12, 0.25, { material: "metal", label: "鉄" });
      w.addCircle(1, 12, 0.25, { material: "foam", label: "発泡スチロール" });
      return scene(w, this.title, this.note, { cx: 0, cy: 6.5, span: 16 }, { trails: true, vectors: true });
    },
  },
];
