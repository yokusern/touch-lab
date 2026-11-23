// AI が返す「実験の設計図（レシピ）」を、自由実験室の実験（Scene）に変える。
// AI の答えは信用せず、ここで数・大きさ・値の範囲をすべて確かめてから世界を組み立てる。
import { MATERIALS, World, type Body, type MaterialId } from "./engine.ts";
import { serialize, type Scene } from "./scene.ts";

export const MAX_OBJECTS = 80;
export const MAX_LINKS = 60;
const COORD = 5000; // 座標の上限 [m]

export type RecipeObject = {
  id: string;
  shape: "circle" | "box" | "ramp" | "plank";
  x: number;
  y: number;
  /** circle: 半径 / box・ramp: 幅 / plank: 長さ */
  size: number;
  /** box・ramp: 高さ / plank: 厚み（circle では使わない） */
  height: number;
  /** 回転（度、反時計回り）。plank は傾き */
  angle: number;
  /** ramp のどちら側が高いか */
  highSide: "left" | "right";
  material: MaterialId;
  fixed: boolean;
  vx: number;
  vy: number;
  /** 0 なら材質から自動 */
  mass: number;
  label: string;
};

export type RecipeLink = {
  type: "pin" | "motor" | "rod" | "rope" | "spring";
  a: string;
  /** 空文字なら空中（世界）に固定 */
  b: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** motor: 回転の速さ [rad/s]（＋で反時計回り）／ spring: ばね定数 [N/m]（0 なら自動） */
  value: number;
};

export type Recipe = {
  title: string;
  note: string;
  gravity: number;
  airOn: boolean;
  airDensity: number;
  attraction: number;
  ground: boolean;
  viewX: number;
  viewY: number;
  viewWidth: number;
  objects: RecipeObject[];
  links: RecipeLink[];
};

const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

/** Gemini の構造化出力に渡す JSON Schema（よく使う型だけで書く） */
export const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "実験のタイトル（日本語、40文字以内）" },
    note: { type: "string", description: "予想・見どころ・この2Dの世界での近似や限界（日本語、200文字以内）" },
    gravity: { type: "number", description: "下向きの重力加速度 m/s²。地球9.81、月1.62、無重力0、マイナスで上向き" },
    airOn: { type: "boolean", description: "空気抵抗あり" },
    airDensity: { type: "number", description: "空気の密度 kg/m³。地球1.2" },
    attraction: { type: "number", description: "物体どうしの万有引力定数G。使わないなら0。星の実験なら1e-6ほど" },
    ground: { type: "boolean", description: "y=0 に幅200mの地面を置くか" },
    viewX: { type: "number", description: "最初に画面の中心に映す x [m]" },
    viewY: { type: "number", description: "最初に画面の中心に映す y [m]" },
    viewWidth: { type: "number", description: "最初に映す横幅 [m]。全部の物体が入る大きさ" },
    objects: {
      type: "array",
      description: `物体。最大${MAX_OBJECTS}個`,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "つなぎ目から参照する名前（英数字）" },
          shape: { type: "string", enum: ["circle", "box", "ramp", "plank"] },
          x: { type: "number", description: "中心の x [m]" },
          y: { type: "number", description: "中心の y [m]。地面の上面が y=0" },
          size: { type: "number", description: "circle=半径, box/ramp=幅, plank=長さ [m]" },
          height: { type: "number", description: "box/ramp=高さ, plank=厚み [m]。circle は0" },
          angle: { type: "number", description: "回転・傾き（度、反時計回り）" },
          highSide: { type: "string", enum: ["left", "right"], description: "ramp の高い側" },
          material: { type: "string", enum: MATERIAL_IDS },
          fixed: { type: "boolean", description: "動かない物体（坂・床・壁・台など）" },
          vx: { type: "number", description: "はじめの横の速さ m/s（右が＋）" },
          vy: { type: "number", description: "はじめの縦の速さ m/s（上が＋）" },
          mass: { type: "number", description: "質量 kg。0なら材質と大きさから自動" },
          label: { type: "string", description: "画面に出す名前（日本語、短く。不要なら空）" },
        },
        required: ["id", "shape", "x", "y", "size", "height", "angle", "highSide", "material", "fixed", "vx", "vy", "mass", "label"],
      },
    },
    links: {
      type: "array",
      description: `つなぎ目。最大${MAX_LINKS}個`,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pin", "motor", "rod", "rope", "spring"] },
          a: { type: "string", description: "つなぐ物体の id" },
          b: { type: "string", description: "相手の物体の id。空文字なら空中の点に固定" },
          x1: { type: "number", description: "a 側のつなぐ点 x [m]（pin/motor はこの1点だけ使う）" },
          y1: { type: "number" },
          x2: { type: "number", description: "b 側（または空中）のつなぐ点 x [m]" },
          y2: { type: "number" },
          value: { type: "number", description: "motor=回転の速さ rad/s（＋反時計回り）, spring=ばね定数 N/m（0で自動）, ほかは0" },
        },
        required: ["type", "a", "b", "x1", "y1", "x2", "y2", "value"],
      },
    },
  },
  required: ["title", "note", "gravity", "airOn", "airDensity", "attraction", "ground", "viewX", "viewY", "viewWidth", "objects", "links"],
} as const;

const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** レシピ → 実験。作れなかった物体・つなぎ目は数えて返す */
export function recipeToScene(raw: unknown, fallbackTitle: string): { scene: Scene; skipped: number } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Recipe>;
  const w = new World();
  w.settings = {
    gravity: num(r.gravity, 9.81, -1000, 1000),
    airOn: r.airOn === true,
    airDensity: num(r.airDensity, 1.2, 0, 1000),
    attraction: num(r.attraction, 0, 0, 1),
    timeScale: 1,
  };
  let skipped = 0;
  if (r.ground !== false) {
    w.addBox(0, -0.5, 200, 1, { material: "stone", isStatic: true, color: "#33476b", label: "地面" });
  }

  const byId = new Map<string, Body>();
  const objects = Array.isArray(r.objects) ? r.objects.slice(0, MAX_OBJECTS) : [];
  skipped += Math.max(0, (Array.isArray(r.objects) ? r.objects.length : 0) - MAX_OBJECTS);
  for (const o of objects as Partial<RecipeObject>[]) {
    const material: MaterialId = MATERIAL_IDS.includes(o.material as MaterialId) ? (o.material as MaterialId) : "wood";
    const x = num(o.x, 0, -COORD, COORD);
    const y = num(o.y, 1, -COORD, COORD);
    const size = num(o.size, 0.5, 0.02, 500);
    const height = num(o.height, size, 0.02, 500);
    const angle = (num(o.angle, 0, -3600, 3600) * Math.PI) / 180;
    const fixed = o.fixed === true;
    const opts = {
      material,
      isStatic: fixed,
      vx: num(o.vx, 0, -2000, 2000),
      vy: num(o.vy, 0, -2000, 2000),
      angle,
      label: str(o.label, 30),
    };
    let b: Body | null = null;
    if (o.shape === "circle") b = w.addCircle(x, y, size, opts);
    else if (o.shape === "ramp") {
      const hw = size / 2;
      const hh = height / 2;
      const highLeft = o.highSide !== "right";
      b = w.addPoly(x, y, [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        highLeft ? { x: -hw, y: hh } : { x: hw, y: hh },
      ], opts);
    } else if (o.shape === "plank") {
      b = w.addBox(x, y, size, Math.min(height, size), opts);
    } else b = w.addBox(x, y, size, height, opts);
    if (!b) {
      skipped++;
      continue;
    }
    const mass = num(o.mass, 0, 0, 1e30);
    if (mass > 0) w.setMass(b, mass);
    const id = str(o.id, 40);
    if (id && !byId.has(id)) byId.set(id, b);
  }

  const links = Array.isArray(r.links) ? r.links.slice(0, MAX_LINKS) : [];
  skipped += Math.max(0, (Array.isArray(r.links) ? r.links.length : 0) - MAX_LINKS);
  for (const l of links as Partial<RecipeLink>[]) {
    let a = byId.get(str(l.a, 40)) ?? null;
    let b = l.b ? (byId.get(str(l.b, 40)) ?? null) : null;
    if (l.b && !b) {
      skipped++;
      continue;
    }
    if (!a) {
      skipped++;
      continue;
    }
    const type = l.type ?? "rod";
    let p1 = { x: num(l.x1, a.x, -COORD, COORD), y: num(l.y1, a.y, -COORD, COORD) };
    let p2 = { x: num(l.x2, b ? b.x : p1.x, -COORD, COORD), y: num(l.y2, b ? b.y : p1.y + 1, -COORD, COORD) };
    // 固定された物体を a にしない（動く側を a に）
    if (a.isStatic && b && !b.isStatic) {
      [a, b] = [b, a];
      [p1, p2] = [p2, p1];
    }
    if (a === b || (a.isStatic && (!b || b.isStatic))) {
      skipped++;
      continue;
    }
    if (type === "pin" || type === "motor") {
      const speed = num(l.value, -4, -100, 100);
      w.addJoint("pin", a, b, p1, p1, {
        motor: type === "motor",
        motorSpeed: type === "motor" ? speed || -4 : 0,
        maxTorque: Math.max(500, a.mass * 60),
      });
    } else if (type === "rod" || type === "rope" || type === "spring") {
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.01) {
        skipped++;
        continue;
      }
      const m = b && !b.isStatic ? Math.min(a.mass, b.mass) : a.mass;
      const autoK = m * (2 * Math.PI * 1.2) ** 2;
      const k = type === "spring" ? num(l.value, 0, 0, 1e9) || autoK : 200;
      w.addJoint(type, a, b, p1, p2, { k, c: 2 * 0.08 * Math.sqrt(k * m) });
    } else skipped++;
  }

  const title = str(r.title, 80).trim() || fallbackTitle;
  const scene = serialize(w, {
    title,
    note: str(r.note, 600),
    view: {
      cx: num(r.viewX, 0, -COORD, COORD),
      cy: num(r.viewY, 4, -COORD, COORD),
      span: num(r.viewWidth, 16, 1, 20000),
    },
    trails: w.settings.attraction > 0,
    vectors: false,
  });
  return { scene, skipped };
}
