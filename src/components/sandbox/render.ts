import type { Body, Joint, Vec, World } from "@/lib/engine/engine";

export type Camera = { cx: number; cy: number; scale: number }; // scale = 1m あたりの px

export type Preview =
  | { kind: "circle"; c: Vec; r: number }
  | { kind: "box"; a: Vec; b: Vec }
  | { kind: "ramp"; a: Vec; b: Vec }
  | { kind: "wall"; a: Vec; b: Vec; t: number }
  | { kind: "link"; a: Vec; b: Vec; jointKind: "rod" | "rope" | "spring" }
  | { kind: "blast"; c: Vec; r: number }
  | null;

export const toScreen = (cam: Camera, w: number, h: number, p: Vec): Vec => ({
  x: (p.x - cam.cx) * cam.scale + w / 2,
  y: h / 2 - (p.y - cam.cy) * cam.scale,
});

export const toWorld = (cam: Camera, w: number, h: number, sx: number, sy: number): Vec => ({
  x: (sx - w / 2) / cam.scale + cam.cx,
  y: (h / 2 - sy) / cam.scale + cam.cy,
});

const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

export function gridStep(scale: number, minPx = 36) {
  for (const s of NICE) if (s * scale >= minPx) return s;
  return NICE[NICE.length - 1];
}

export function fmtLen(m: number) {
  if (m >= 1000) return `${m / 1000} km`;
  if (m >= 1) return `${m} m`;
  return `${Math.round(m * 100)} cm`;
}

export type DrawState = {
  world: World;
  cam: Camera;
  selectedId: number | null;
  trails: Map<number, Vec[]>;
  showTrails: boolean;
  showVectors: boolean;
  preview: Preview;
  pending: Vec | null;
  hoverJoint: Joint | null;
};

export function drawWorld(ctx: CanvasRenderingContext2D, w: number, h: number, st: DrawState) {
  const { world, cam } = st;
  ctx.fillStyle = "#071224";
  ctx.fillRect(0, 0, w, h);

  // 方眼（1マスの大きさは拡大率に合わせて変わる）
  const step = gridStep(cam.scale);
  const tl = toWorld(cam, w, h, 0, 0);
  const br = toWorld(cam, w, h, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(130,190,255,0.08)";
  ctx.beginPath();
  for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
    const sx = Math.round(toScreen(cam, w, h, { x, y: 0 }).x) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) {
    const sy = Math.round(toScreen(cam, w, h, { x: 0, y }).y) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();
  const o = toScreen(cam, w, h, { x: 0, y: 0 });
  ctx.strokeStyle = "rgba(130,190,255,0.22)";
  ctx.beginPath();
  ctx.moveTo(0, Math.round(o.y) + 0.5);
  ctx.lineTo(w, Math.round(o.y) + 0.5);
  ctx.moveTo(Math.round(o.x) + 0.5, 0);
  ctx.lineTo(Math.round(o.x) + 0.5, h);
  ctx.stroke();

  // 軌跡
  if (st.showTrails) {
    for (const b of world.bodies) {
      const tr = st.trails.get(b.id);
      if (!tr || tr.length < 2) continue;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.5;
      for (let i = 1; i < tr.length; i++) {
        ctx.globalAlpha = 0.08 + 0.55 * (i / tr.length);
        const p = toScreen(cam, w, h, tr[i - 1]);
        const q = toScreen(cam, w, h, tr[i]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  // 物体
  for (const b of world.bodies) drawBody(ctx, w, h, cam, b, b.id === st.selectedId);

  // つなぎ目
  for (const j of world.joints) drawJoint(ctx, w, h, cam, world, j, j === st.hoverJoint);

  // 速度の矢印
  if (st.showVectors) {
    for (const b of world.bodies) {
      if (b.isStatic) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 0.05) continue;
      const p = toScreen(cam, w, h, { x: b.x, y: b.y });
      let len = sp * 0.25 * cam.scale; // 0.25秒後にいる場所の目安
      len = Math.min(len, 160);
      const ux = b.vx / sp;
      const uy = -b.vy / sp;
      arrow(ctx, p.x, p.y, p.x + ux * len, p.y + uy * len, "#5ee6a0");
      label(ctx, `${sp < 10 ? sp.toFixed(1) : sp.toFixed(0)} m/s`, p.x + ux * len + 6, p.y + uy * len, "#5ee6a0", 11);
    }
  }

  // 名前
  for (const b of world.bodies) {
    if (!b.label || b.label === "地面") continue;
    const p = toScreen(cam, w, h, { x: b.x, y: b.maxY });
    label(ctx, b.label, p.x, p.y - 10, "rgba(232,241,255,0.85)", 11, "center");
  }

  drawPreview(ctx, w, h, cam, st.preview);

  if (st.pending) {
    const p = toScreen(cam, w, h, st.pending);
    ctx.strokeStyle = "#ffbe55";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ものさし
  const unit = gridStep(cam.scale, 70);
  const px = unit * cam.scale;
  ctx.strokeStyle = "#e8f1ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, h - 14);
  ctx.lineTo(12 + px, h - 14);
  ctx.moveTo(12, h - 19);
  ctx.lineTo(12, h - 9);
  ctx.moveTo(12 + px, h - 19);
  ctx.lineTo(12 + px, h - 9);
  ctx.stroke();
  label(ctx, fmtLen(unit), 12 + px / 2, h - 26, "#e8f1ff", 11, "center");
}

function bodyPath(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, b: Body) {
  ctx.beginPath();
  if (b.shape.kind === "circle") {
    const p = toScreen(cam, w, h, { x: b.x, y: b.y });
    ctx.arc(p.x, p.y, Math.max(1, b.shape.r * cam.scale), 0, Math.PI * 2);
  } else {
    b.wv.forEach((v, i) => {
      const p = toScreen(cam, w, h, v);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
  }
}

function drawBody(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, b: Body, selected: boolean) {
  bodyPath(ctx, w, h, cam, b);
  ctx.fillStyle = b.color;
  ctx.globalAlpha = b.isStatic ? 0.95 : 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;
  if (b.isStatic) {
    // 固定された物体は斜線
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    const bb = toScreen(cam, w, h, { x: b.minX, y: b.maxY });
    const be = toScreen(cam, w, h, { x: b.maxX, y: b.minY });
    const x0 = Math.max(bb.x, -20);
    const x1 = Math.min(be.x, w + 20);
    const y0 = Math.max(bb.y, -20);
    const y1 = Math.min(be.y, h + 20);
    ctx.beginPath();
    for (let x = x0 - (y1 - y0); x < x1; x += 10) {
      ctx.moveTo(x, y1);
      ctx.lineTo(x + (y1 - y0), y0);
    }
    ctx.stroke();
    ctx.restore();
    bodyPath(ctx, w, h, cam, b);
  }
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#52d6ff" : "rgba(7,18,36,0.75)";
  ctx.stroke();
  if (selected) {
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(82,214,255,0.25)";
    ctx.stroke();
  }
  // 回転が見えるように中心から線を引く
  if (!b.isStatic) {
    const p = toScreen(cam, w, h, { x: b.x, y: b.y });
    const r = (b.shape.kind === "circle" ? b.shape.r : b.bound * 0.6) * cam.scale;
    if (r > 4) {
      ctx.strokeStyle = "rgba(7,18,36,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(b.a) * r, p.y - Math.sin(b.a) * r);
      ctx.stroke();
    }
  }
}

function drawJoint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  world: World,
  j: Joint,
  hover: boolean,
) {
  const { pa, pb } = world.jointWorldPoints(j);
  const a = toScreen(cam, w, h, pa);
  const b = toScreen(cam, w, h, pb);
  const color = hover ? "#ff7a7a" : j.kind === "spring" ? "#ffbe55" : j.kind === "rope" ? "#c9b8a0" : "#e8f1ff";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (j.kind === "pin") {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#071224";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(a.x, a.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (j.motor) {
      // モーターは回る向きの矢印
      const dir = j.motorSpeed >= 0 ? -1 : 1; // 画面は y が下向き
      ctx.strokeStyle = "#ffbe55";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 11, 0, Math.PI * 1.4 * dir, dir < 0);
      ctx.stroke();
    }
    return;
  }
  if (!j.b) {
    // 世界に固定した点
    ctx.fillStyle = color;
    ctx.fillRect(b.x - 5, b.y - 5, 10, 10);
  }
  if (j.kind === "spring") {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const coils = 10;
    const amp = 6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    const lead = Math.min(10, len * 0.15);
    ctx.lineTo(a.x + ux * lead, a.y + uy * lead);
    for (let i = 1; i < coils * 2; i++) {
      const t = lead + ((len - 2 * lead) * i) / (coils * 2);
      const s = i % 2 ? amp : -amp;
      ctx.lineTo(a.x + ux * t + nx * s, a.y + uy * t + ny * s);
    }
    ctx.lineTo(b.x - ux * lead, b.y - uy * lead);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else {
    ctx.lineWidth = j.kind === "rod" ? 3 : 1.5;
    if (j.kind === "rope") ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, pv: Preview) {
  if (!pv) return;
  ctx.save();
  ctx.strokeStyle = "#52d6ff";
  ctx.fillStyle = "rgba(82,214,255,0.15)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  if (pv.kind === "circle" || pv.kind === "blast") {
    const c = toScreen(cam, w, h, pv.c);
    ctx.arc(c.x, c.y, pv.r * cam.scale, 0, Math.PI * 2);
    if (pv.kind === "blast") {
      ctx.strokeStyle = "#ff7a7a";
      ctx.fillStyle = "rgba(255,122,122,0.12)";
    }
  } else if (pv.kind === "box") {
    const a = toScreen(cam, w, h, pv.a);
    const b = toScreen(cam, w, h, pv.b);
    ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  } else if (pv.kind === "ramp") {
    const [p0, p1, p2] = rampPoints(pv.a, pv.b).map((p) => toScreen(cam, w, h, p));
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
  } else if (pv.kind === "wall") {
    const a = toScreen(cam, w, h, pv.a);
    const b = toScreen(cam, w, h, pv.b);
    ctx.lineWidth = Math.max(3, pv.t * cam.scale);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  } else if (pv.kind === "link") {
    const a = toScreen(cam, w, h, pv.a);
    const b = toScreen(cam, w, h, pv.b);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** 坂（直角三角形）: ドラッグを始めた側が高くなる */
export function rampPoints(a: Vec, b: Vec): Vec[] {
  const lowY = Math.min(a.y, b.y);
  const highY = Math.max(a.y, b.y);
  return [
    { x: a.x, y: lowY },
    { x: b.x, y: lowY },
    { x: a.x, y: highY },
  ];
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * 8 - uy * 4, y1 - uy * 8 + ux * 4);
  ctx.lineTo(x1 - ux * 8 + uy * 4, y1 - uy * 8 - ux * 4);
  ctx.closePath();
  ctx.fill();
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size = 12,
  align: CanvasTextAlign = "left",
) {
  ctx.save();
  ctx.font = `600 ${size}px system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(7,18,36,0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 点 p から線分 ab までの距離 */
export function distToSegment(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
