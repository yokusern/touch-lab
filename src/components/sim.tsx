"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** シミュレーションの時計。実時間 × 再生速度 でシミュ内の時刻を進める。 */
export function useSimClock() {
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const raf = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    if (timer.current !== null) clearTimeout(timer.current);
    raf.current = null;
    timer.current = null;
  };

  const start = useCallback((duration: number, speed: number, onDone?: () => void) => {
    cancel();
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancel();
      setT(duration);
      setRunning(false);
      onDone?.();
    };
    const tick = (now: number) => {
      const st = ((now - t0) / 1000) * speed;
      if (st >= duration) return finish();
      setT(st);
      raf.current = requestAnimationFrame(tick);
    };
    setT(0);
    setRunning(true);
    raf.current = requestAnimationFrame(tick);
    // 別タブに切り替えて描画が止まっても、実験は予定どおり終わって記録される
    timer.current = setTimeout(finish, (duration / speed) * 1000 + 100);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setRunning(false);
    setT(0);
  }, []);

  useEffect(() => cancel, []);

  return { t, running, start, reset };
}

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** 幅に合わせて伸び縮みする Canvas。draw は描画のたびに呼ばれる。 */
export function SimCanvas({
  draw,
  aspect,
  maxHeight = 520,
  label,
}: {
  draw: DrawFn;
  aspect: number; // 幅 / 高さ
  maxHeight?: number;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = Math.min(w / aspect, maxHeight);

  useEffect(() => {
    const c = canvas.current;
    if (!c || w <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  });

  return (
    <div ref={wrap} className="w-full overflow-hidden rounded-xl border border-line-strong bg-bg-deep">
      <canvas ref={canvas} role="img" aria-label={label} style={{ width: w, height: h, display: "block" }} />
    </div>
  );
}

/* ───────── 描画ヘルパー ───────── */

export const COLORS = {
  bg: "#071224",
  grid: "rgba(130,190,255,0.10)",
  gridStrong: "rgba(130,190,255,0.28)",
  ink: "#e8f1ff",
  muted: "#93abcf",
  accent: "#52d6ff",
  amber: "#ffbe55",
  ok: "#5ee6a0",
  bad: "#ff7a7a",
};

export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 24) {
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: { color?: string; size?: number; align?: CanvasTextAlign; mono?: boolean; weight?: number } = {},
) {
  const { color = COLORS.ink, size = 13, align = "left", mono = false, weight = 500 } = opts;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.font = `${weight} ${size}px ${mono ? "ui-monospace, 'JetBrains Mono', monospace" : "system-ui, 'Hiragino Sans', 'Noto Sans JP', sans-serif"}`;
  ctx.fillText(text, x, y);
  ctx.restore();
}
