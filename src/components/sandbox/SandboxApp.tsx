"use client";
/* eslint-disable react-hooks/refs -- 物理の世界（World）は ref に入れた可変オブジェクトで、1秒に240回進む。
   React の state にすると重すぎるため、画面の数値は tick（約8回/秒）で再描画するときに ref から読む。
   React Compiler は使っていない。 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  World,
  updateBodyGeometry,
  type Body,
  type Joint,
  type MaterialId,
  type Vec,
  type WorldSettings,
} from "@/lib/engine/engine";
import {
  BLANK_TITLE,
  blankScene,
  buildWorld,
  decodeScene,
  encodeScene,
  serialize,
  type Scene,
  type View,
} from "@/lib/engine/scene";
import { loadAutosave, writeAutosave } from "@/lib/engine/storage";
import { InspectorPanel, MaterialPicker, SavePanel, SamplesPanel, WorldPanel } from "./SandboxPanels";
import { distToSegment, drawWorld, rampPoints, toScreen, toWorld, type Camera, type Preview } from "./render";

const H = 1 / 240; // 1回の計算で進める時間 [s]
const MAX_STEPS = 96;

export type Tool =
  | "hand"
  | "circle"
  | "box"
  | "ramp"
  | "wall"
  | "pin"
  | "motor"
  | "rod"
  | "rope"
  | "spring"
  | "blast"
  | "erase";

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "hand", label: "つかむ", hint: "物体をタップで選ぶ。ドラッグで動かす（再生中は引っぱる）。何もない所をドラッグすると画面が動く" },
  { id: "circle", label: "円", hint: "タップで置く。ドラッグすると大きさを決められる" },
  { id: "box", label: "箱", hint: "タップで置く。ドラッグで角から角まで大きさを決める" },
  { id: "ramp", label: "坂", hint: "ドラッグで坂（三角）をつくる。ドラッグを始めた側が高くなる" },
  { id: "wall", label: "板", hint: "ドラッグで線を引くように板・床・壁をつくる" },
  { id: "pin", label: "ピン", hint: "物体をタップ。2つ重なった所なら2つを回る軸でつなぐ。1つなら空中に留める" },
  { id: "motor", label: "モーター", hint: "ピンと同じ。つないだ所がモーターで回り続ける（車輪・風車に）" },
  { id: "rod", label: "棒", hint: "物体から物体（または空中）へドラッグ。長さが変わらない棒でつなぐ" },
  { id: "rope", label: "ひも", hint: "ドラッグでつなぐ。のびないが、たるむことはできる" },
  { id: "spring", label: "ばね", hint: "ドラッグでつなぐ。のび縮みして元の長さに戻ろうとする" },
  { id: "blast", label: "ふきとばす", hint: "タップした所から、まわりの物体を外向きにふきとばす" },
  { id: "erase", label: "消す", hint: "物体やつなぎ目をタップして消す" },
];

const SHAPE_TOOLS: Tool[] = ["circle", "box", "ramp", "wall"];
const LINK_TOOLS: Tool[] = ["rod", "rope", "spring"];

type Gesture =
  | { kind: "pan"; sx: number; sy: number; cx: number; cy: number; moved: boolean; tap: Vec }
  | { kind: "move"; body: Body; off: Vec; moved: boolean }
  | { kind: "drag" }
  | { kind: "create"; start: Vec; cur: Vec; sx: number; sy: number; moved: boolean }
  | { kind: "pinch"; d0: number; scale0: number; anchor: Vec }
  | null;

export type Panel = "samples" | "object" | "world" | "save";

export default function SandboxApp() {
  const worldRef = useRef<World>(new World());
  const camRef = useRef<Camera>({ cx: 0, cy: 4, scale: 40 });
  const homeViewRef = useRef<View>({ cx: 0, cy: 4, span: 16 });
  const needFitRef = useRef(true);
  const sizeRef = useRef({ w: 0, h: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trailsRef = useRef(new Map<number, Vec[]>());
  const previewRef = useRef<Preview>(null);
  const pendingRef = useRef<Vec | null>(null);
  const hoverJointRef = useRef<Joint | null>(null);
  const gestureRef = useRef<Gesture>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const snapshotRef = useRef<Scene | null>(null);
  const undoRef = useRef<Scene[]>([]);
  const playingRef = useRef(false);
  const showTrailsRef = useRef(false);
  const selectedRef = useRef<number | null>(null);
  const showVectorsRef = useRef(false);
  const initialHashRef = useRef<string | null>(null);

  const [tool, setToolState] = useState<Tool>("hand");
  const [playing, setPlayingState] = useState(false);
  const [selectedId, setSelectedState] = useState<number | null>(null);
  const [title, setTitle] = useState(BLANK_TITLE);
  const [note, setNote] = useState("");
  const [showTrails, setShowTrailsState] = useState(false);
  const [showVectors, setShowVectors] = useState(false);
  const [settings, setSettingsState] = useState<WorldSettings>(DEFAULT_SETTINGS);
  const [newMat, setNewMat] = useState<MaterialId>("wood");
  const [newFixed, setNewFixed] = useState(false);
  const [motorSpeed, setMotorSpeed] = useState(-4);
  const [panel, setPanel] = useState<Panel>("samples");
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [ready, setReady] = useState(false);

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    showVectorsRef.current = showVectors;
  }, [showVectors]);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const setPlaying = useCallback((p: boolean) => {
    playingRef.current = p;
    setPlayingState(p);
  }, []);

  const setSelected = useCallback((id: number | null) => {
    selectedRef.current = id;
    setSelectedState(id);
  }, []);

  const setShowTrails = useCallback((v: boolean) => {
    showTrailsRef.current = v;
    setShowTrailsState(v);
    if (!v) trailsRef.current.clear();
  }, []);

  /* ───────── 視点 ───────── */

  const fitView = useCallback((v: View) => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) {
      needFitRef.current = true;
      return;
    }
    needFitRef.current = false;
    const scale = Math.min(w / v.span, h / (v.span * 0.6));
    let cy = v.cy;
    // 縦長の画面で重力のある世界は、地面側を下にそろえて空を広く見せる
    if (h > w && worldRef.current.settings.gravity > 0) {
      const visibleH = h / scale;
      cy = v.cy - v.span * 0.3 + visibleH / 2 - 20 / scale;
    }
    camRef.current = { cx: v.cx, cy, scale };
  }, []);

  const currentView = useCallback((): View => {
    const { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0 || needFitRef.current) return homeViewRef.current; // まだ画面の大きさが決まっていない
    const cam = camRef.current;
    const m = Math.min(w, h / 0.6);
    return { cx: cam.cx, cy: cam.cy, span: m / cam.scale };
  }, []);

  /* ───────── 保存・読み込み ───────── */

  const currentScene = useCallback(
    (): Scene =>
      serialize(worldRef.current, {
        title: title.trim() || BLANK_TITLE,
        note,
        view: currentView(),
        trails: showTrails,
        vectors: showVectors,
      }),
    [title, note, showTrails, showVectors, currentView],
  );

  /** 再生前の状態（保存・共有にはこちらを使う） */
  const startScene = useCallback((): Scene => {
    const snap = snapshotRef.current;
    if (!snap) return currentScene();
    return { ...snap, title: title.trim() || BLANK_TITLE, note, trails: showTrails, vectors: showVectors };
  }, [currentScene, title, note, showTrails, showVectors]);

  const loadScene = useCallback(
    (sc: Scene, opts: { keepCamera?: boolean } = {}) => {
      const w = buildWorld(sc);
      worldRef.current = w;
      setSettingsState({ ...w.settings });
      setTitle(sc.title || BLANK_TITLE);
      setNote(sc.note || "");
      setShowTrails(!!sc.trails);
      setShowVectors(!!sc.vectors);
      homeViewRef.current = sc.view ?? { cx: 0, cy: 4, span: 16 };
      if (!opts.keepCamera) fitView(homeViewRef.current);
      trailsRef.current.clear();
      pendingRef.current = null;
      previewRef.current = null;
      gestureRef.current = null;
      setSelected(null);
      setPlaying(false);
      snapshotRef.current = null;
      setHasSnapshot(false);
      bump();
    },
    [bump, fitView, setPlaying, setSelected, setShowTrails],
  );

  const pushUndo = useCallback(() => {
    undoRef.current.push(currentScene());
    if (undoRef.current.length > 40) undoRef.current.shift();
    setUndoCount(undoRef.current.length);
  }, [currentScene]);

  /** 止まっている間の編集は「新しいスタート地点」になる */
  const edited = useCallback(() => {
    if (!playingRef.current && snapshotRef.current) {
      snapshotRef.current = null;
      setHasSnapshot(false);
    }
    bump();
  }, [bump]);

  const undo = useCallback(() => {
    const prev = undoRef.current.pop();
    setUndoCount(undoRef.current.length);
    if (!prev) return;
    loadScene(prev, { keepCamera: true });
    say("1つ前に戻しました");
  }, [loadScene, say]);

  // はじめに開いたとき: 共有リンク → タイトル指定 → 前回の続き → まっさら
  useEffect(() => {
    let cancelled = false;
    // URL の # は最初の1回だけ読む（読んだらアドレス欄から消すので、開発時の二重実行でも同じ値を使う）
    if (initialHashRef.current === null) initialHashRef.current = window.location.hash;
    const hash = initialHashRef.current;
    (async () => {
      const fromHash = await sceneFromHash(hash);
      let sc = fromHash?.scene ?? null;
      if (!sc) sc = loadAutosave();
      if (!sc) sc = blankScene();
      if (cancelled) return;
      loadScene(sc);
      if (hash) history.replaceState(null, "", window.location.pathname);
      if (fromHash) say(fromHash.msg);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // 最初の1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自由実験室を開いたまま、共有リンクをアドレス欄に貼ったとき（# だけ変わってページは読み直されない）
  const onHashRef = useRef<() => void>(() => {});
  useEffect(() => {
    onHashRef.current = async () => {
      const hash = window.location.hash;
      const fromHash = await sceneFromHash(hash);
      if (!fromHash) return;
      if (fromHash.scene) {
        pushUndo();
        loadScene(fromHash.scene);
      }
      history.replaceState(null, "", window.location.pathname);
      say(fromHash.msg);
    };
  });
  useEffect(() => {
    const on = () => onHashRef.current();
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // 自動で前回の続きを保存（再生中は再生前の状態を保存）
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => writeAutosave(startScene()), 600);
    return () => window.clearTimeout(id);
  });

  /* ───────── 描画と時間 ───────── */

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      sizeRef.current = { w: r.width, h: r.height };
      if (needFitRef.current) fitView(homeViewRef.current);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [fitView]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastUi = 0;
    let lastTrail = -1;
    let lastFrameAt = performance.now();
    const run = (now: number) => {
      lastFrameAt = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      if (playingRef.current) {
        acc += dt * world.settings.timeScale;
        let n = 0;
        while (acc >= H && n < MAX_STEPS) {
          world.step(H);
          acc -= H;
          n++;
          if (showTrailsRef.current && world.time - lastTrail >= 1 / 30) {
            lastTrail = world.time;
            for (const b of world.bodies) {
              if (b.isStatic) continue;
              let tr = trailsRef.current.get(b.id);
              if (!tr) trailsRef.current.set(b.id, (tr = []));
              tr.push({ x: b.x, y: b.y });
              if (tr.length > 400) tr.shift();
            }
          }
        }
        if (n === MAX_STEPS) acc = 0;
        if (now - lastUi > 120) {
          lastUi = now;
          setTick((t) => t + 1);
        }
      } else acc = 0;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const { w, h } = sizeRef.current;
      if (canvas && ctx && w > 0) {
        const dpr = canvas.width / w;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawWorld(ctx, w, h, {
          world,
          cam: camRef.current,
          selectedId: selectedRef.current,
          trails: trailsRef.current,
          showTrails: showTrailsRef.current,
          showVectors: showVectorsRef.current,
          preview: previewRef.current,
          pending: pendingRef.current,
          hoverJoint: hoverJointRef.current,
        });
      }
    };
    const frame = (now: number) => {
      run(now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // 画面の描画が止められる環境（省電力・埋め込み表示など）でも時間が進むように
    const iv = window.setInterval(() => {
      const now = performance.now();
      if (now - lastFrameAt > 120) run(now);
    }, 50);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(iv);
    };
  }, []);

  /* ───────── 再生 ───────── */

  const play = useCallback(() => {
    if (!snapshotRef.current) {
      snapshotRef.current = currentScene();
      setHasSnapshot(true);
      worldRef.current.time = 0;
      trailsRef.current.clear();
    }
    pendingRef.current = null;
    setPlaying(true);
  }, [currentScene, setPlaying]);

  const pause = useCallback(() => {
    worldRef.current.endDrag();
    setPlaying(false);
  }, [setPlaying]);

  const stepOnce = useCallback(() => {
    if (!snapshotRef.current) {
      snapshotRef.current = currentScene();
      setHasSnapshot(true);
      worldRef.current.time = 0;
    }
    setPlaying(false);
    for (let i = 0; i < 8; i++) worldRef.current.step(H);
    bump();
  }, [bump, currentScene, setPlaying]);

  const resetToStart = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    const keepTitle = title;
    const keepNote = note;
    loadScene(snap, { keepCamera: true });
    setTitle(keepTitle);
    setNote(keepNote);
  }, [loadScene, title, note]);

  /* ───────── 設定 ───────── */

  const setSettings = useCallback(
    (patch: Partial<WorldSettings>) => {
      const w = worldRef.current;
      w.settings = { ...w.settings, ...patch };
      setSettingsState({ ...w.settings });
    },
    [],
  );

  const selectTool = useCallback(
    (t: Tool) => {
      setToolState(t);
      pendingRef.current = null;
      previewRef.current = null;
      if (t === "ramp" || t === "wall") setNewFixed(true);
      else if (t === "circle" || t === "box") setNewFixed(false);
    },
    [],
  );

  /* ───────── 指・マウスの操作 ───────── */

  const worldPoint = (e: { clientX: number; clientY: number }): { p: Vec; sx: number; sy: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { w, h } = sizeRef.current;
    return { p: toWorld(camRef.current, w, h, sx, sy), sx, sy };
  };

  const tapSize = () => {
    const s = camRef.current.scale;
    const r = 0.3 * s >= 14 ? 0.3 : 14 / s;
    return Number(r.toPrecision(2));
  };

  const jointNear = (sx: number, sy: number): Joint | null => {
    const { w, h } = sizeRef.current;
    const world = worldRef.current;
    let best: Joint | null = null;
    let bestD = 12;
    for (const j of world.joints) {
      const { pa, pb } = world.jointWorldPoints(j);
      const a = toScreen(camRef.current, w, h, pa);
      const b = toScreen(camRef.current, w, h, pb);
      const d = j.kind === "pin" ? Math.hypot(sx - a.x, sy - a.y) : distToSegment({ x: sx, y: sy }, a, b);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { p, sx, sy } = worldPoint(e);
    pointersRef.current.set(e.pointerId, { x: sx, y: sy });
    const world = worldRef.current;

    if (pointersRef.current.size === 2) {
      // 2本指: 拡大・縮小
      world.endDrag();
      previewRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      const { w, h } = sizeRef.current;
      gestureRef.current = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        scale0: camRef.current.scale,
        anchor: toWorld(camRef.current, w, h, (a.x + b.x) / 2, (a.y + b.y) / 2),
      };
      return;
    }
    if (pointersRef.current.size > 2) return;

    if (tool === "hand") {
      const b = world.bodyAt(p);
      if (b) {
        setSelected(b.id);
        if (playingRef.current && !b.isStatic) {
          world.startDrag(b, p);
          gestureRef.current = { kind: "drag" };
        } else {
          pushUndo();
          gestureRef.current = { kind: "move", body: b, off: { x: p.x - b.x, y: p.y - b.y }, moved: false };
        }
        return;
      }
      setSelected(null);
    }
    if (SHAPE_TOOLS.includes(tool) || tool === "blast" || LINK_TOOLS.includes(tool)) {
      gestureRef.current = { kind: "create", start: p, cur: p, sx, sy, moved: false };
      return;
    }
    const cam = camRef.current;
    gestureRef.current = { kind: "pan", sx, sy, cx: cam.cx, cy: cam.cy, moved: false, tap: p };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { p, sx, sy } = worldPoint(e);
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: sx, y: sy });
    const g = gestureRef.current;
    const world = worldRef.current;
    if (!g) {
      hoverJointRef.current = tool === "erase" ? jointNear(sx, sy) : null;
      return;
    }
    const { w, h } = sizeRef.current;
    if (g.kind === "pinch") {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = clampScale(g.scale0 * (d / Math.max(1, g.d0)));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      camRef.current = {
        scale,
        cx: g.anchor.x - (mx - w / 2) / scale,
        cy: g.anchor.y + (my - h / 2) / scale,
      };
      return;
    }
    if (g.kind === "pan") {
      const cam = camRef.current;
      if (Math.hypot(sx - g.sx, sy - g.sy) > 6) g.moved = true;
      cam.cx = g.cx - (sx - g.sx) / cam.scale;
      cam.cy = g.cy + (sy - g.sy) / cam.scale;
      return;
    }
    if (g.kind === "drag") {
      world.moveDrag(p);
      return;
    }
    if (g.kind === "move") {
      g.moved = true;
      g.body.x = p.x - g.off.x;
      g.body.y = p.y - g.off.y;
      if (playingRef.current) {
        // 再生中に固定物を動かしたとき
        g.body.vx = 0;
        g.body.vy = 0;
        g.body.w = 0;
      }
      updateBodyGeometry(g.body);
      return;
    }
    if (g.kind === "create") {
      g.cur = p;
      if (Math.hypot(sx - g.sx, sy - g.sy) > 8) g.moved = true;
      previewRef.current = makePreview(tool, g.start, p, g.moved, camRef.current.scale, pendingRef.current);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    const g = gestureRef.current;
    const world = worldRef.current;
    if (g?.kind === "pinch") {
      if (pointersRef.current.size === 0) gestureRef.current = null;
      return;
    }
    gestureRef.current = null;
    previewRef.current = null;
    if (!g) return;
    const { p, sx, sy } = worldPoint(e);

    if (g.kind === "drag") {
      world.endDrag();
      return;
    }
    if (g.kind === "move") {
      if (!g.moved) {
        undoRef.current.pop();
        setUndoCount(undoRef.current.length);
        setPanel("object");
      } else edited();
      bump();
      return;
    }
    if (g.kind === "pan") {
      if (g.moved) return;
      tapAction(g.tap, sx, sy);
      return;
    }
    if (g.kind === "create") {
      createAction(g.start, g.moved ? p : g.start, g.moved);
    }
  };

  const tapAction = (p: Vec, sx: number, sy: number) => {
    const world = worldRef.current;
    if (tool === "erase") {
      const j = jointNear(sx, sy);
      if (j) {
        pushUndo();
        world.removeJoint(j);
        hoverJointRef.current = null;
        edited();
        return;
      }
      const b = world.bodyAt(p);
      if (b) {
        pushUndo();
        world.removeBody(b);
        trailsRef.current.delete(b.id);
        if (selectedRef.current === b.id) setSelected(null);
        edited();
      }
      return;
    }
    if (tool === "pin" || tool === "motor") {
      const hits = world.bodiesAt(p);
      if (hits.length === 0) return say("物体の上をタップしてね");
      const a = hits.find((b) => !b.isStatic) ?? hits[0];
      const other = hits.find((b) => b !== a) ?? null;
      if (!other && a.isStatic) return say("固定された物体は、もともと動きません");
      pushUndo();
      world.addJoint("pin", a, other, p, p, {
        motor: tool === "motor",
        motorSpeed,
        maxTorque: Math.max(500, a.mass * 60),
      });
      setSelected(a.id);
      edited();
      say(other ? "2つの物体を回る軸でつなぎました" : "空中の1点に留めました（そこを中心に回れる）");
    }
  };

  const createAction = (start: Vec, end: Vec, moved: boolean) => {
    const world = worldRef.current;
    const opts = { material: newMat, isStatic: newFixed };
    const scale = camRef.current.scale;
    if (tool === "blast") {
      const r = moved ? Math.max(0.3, dist(start, end)) : 110 / scale;
      world.blast(start, 14, r);
      if (!playingRef.current) play();
      return;
    }
    if (LINK_TOOLS.includes(tool)) {
      let a = start;
      let b = end;
      if (!moved) {
        if (!pendingRef.current) {
          pendingRef.current = start;
          say("つなぐ先をタップ（またはドラッグでつなぐ）");
          return;
        }
        a = pendingRef.current;
        b = start;
      }
      pendingRef.current = null;
      let A = world.bodyAt(a);
      let B = world.bodyAt(b);
      let pa = a;
      let pb = b;
      if (!A && B) {
        [A, B] = [B, A];
        [pa, pb] = [pb, pa];
      }
      if (!A) return say("片方は物体の上にしてね");
      if (A === B) return say("同じ物体どうしはつなげません");
      if (A.isStatic && (!B || B.isStatic)) return say("固定された物体どうしはつなげても動きません");
      if (dist(pa, pb) < 0.02) return say("もう少し離れた2点をえらんでね");
      pushUndo();
      const m = Math.min(A.isStatic ? Infinity : A.mass, B && !B.isStatic ? B.mass : Infinity);
      const mass = Number.isFinite(m) ? m : A.mass;
      const k = mass * (2 * Math.PI * 1.2) ** 2; // 1秒に約1.2回ゆれるかたさ
      world.addJoint(tool as "rod" | "rope" | "spring", A, B, pa, pb, {
        k: Number(k.toPrecision(2)),
        c: Number((2 * 0.08 * Math.sqrt(k * mass)).toPrecision(2)),
      });
      setSelected(A.id);
      edited();
      return;
    }
    let made: Body | null = null;
    pushUndo();
    if (tool === "circle") {
      const r = moved ? Math.max(0.03, dist(start, end)) : tapSize();
      made = world.addCircle(start.x, start.y, r, opts);
    } else if (tool === "box") {
      if (moved) {
        const w = Math.max(0.03, Math.abs(end.x - start.x));
        const h = Math.max(0.03, Math.abs(end.y - start.y));
        made = world.addBox((start.x + end.x) / 2, (start.y + end.y) / 2, w, h, opts);
      } else {
        const s = tapSize() * 2;
        made = world.addBox(start.x, start.y, s, s, opts);
      }
    } else if (tool === "ramp") {
      const s = tapSize();
      const e2 = moved ? end : { x: start.x + s * 8, y: start.y - s * 4 };
      if (Math.abs(e2.x - start.x) < 0.03 || Math.abs(e2.y - start.y) < 0.03) {
        undoRef.current.pop();
        return say("もう少し大きくドラッグしてね");
      }
      const pts = rampPoints(start, e2);
      made = world.addPoly(0, 0, pts, opts);
    } else if (tool === "wall") {
      const s = tapSize();
      const e2 = moved ? end : { x: start.x + s * 8, y: start.y };
      const len = dist(start, e2);
      const t = Number(Math.max(0.05, 9 / scale).toPrecision(2));
      made = world.addBox((start.x + e2.x) / 2, (start.y + e2.y) / 2, len, t, {
        ...opts,
        angle: Math.atan2(e2.y - start.y, e2.x - start.x),
      });
    }
    if (made) {
      setSelected(made.id);
      edited();
    } else {
      undoRef.current.pop();
    }
    setUndoCount(undoRef.current.length);
  };

  // ホイールで拡大・縮小（ページはスクロールさせない）
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { w, h } = sizeRef.current;
      const cam = camRef.current;
      const before = toWorld(cam, w, h, sx, sy);
      const scale = clampScale(cam.scale * Math.exp(-e.deltaY * 0.0015));
      camRef.current = {
        scale,
        cx: before.x - (sx - w / 2) / scale,
        cy: before.y + (sy - h / 2) / scale,
      };
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  const zoom = (f: number) => {
    const cam = camRef.current;
    camRef.current = { ...cam, scale: clampScale(cam.scale * f) };
  };

  // キーボード: スペース=再生/停止、Delete=選んだ物体を消す、Ctrl+Z=元に戻す
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === " ") {
        e.preventDefault();
        if (playingRef.current) pause();
        else play();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current !== null) {
        const b = worldRef.current.bodies.find((x) => x.id === selectedRef.current);
        if (b) {
          pushUndo();
          worldRef.current.removeBody(b);
          setSelected(null);
          edited();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, pause, pushUndo, undo, edited, setSelected]);

  const world = worldRef.current;
  const selected = selectedId !== null ? (world.bodies.find((b) => b.id === selectedId) ?? null) : null;
  const toolInfo = TOOLS.find((t) => t.id === tool)!;
  const dynamicCount = world.bodies.filter((b) => !b.isStatic).length;

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="num text-[11px] font-bold tracking-[0.25em] text-accent">SANDBOX / 自由実験室</p>
          <label className="sr-only" htmlFor="exp-title">
            実験のタイトル
          </label>
          <input
            id="exp-title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="実験のタイトル（なんでもOK）"
            className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-1 py-1 text-xl font-black outline-none hover:border-line focus:border-accent sm:text-2xl"
          />
        </div>
        <Link href="/whatif" className="shrink-0 text-xs text-muted underline underline-offset-4 hover:text-ink sm:text-sm">
          地球規模の「もしも」は計算機へ →
        </Link>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-2">
          {/* 道具 */}
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="toolbar" aria-label="道具">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTool(t.id)}
                aria-pressed={tool === t.id}
                className={`flex min-h-12 min-w-[3.6rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-[11px] font-bold transition ${
                  tool === t.id
                    ? "border-accent bg-accent/15 text-ink"
                    : "border-line-strong bg-panel/90 text-muted hover:border-accent hover:text-ink"
                }`}
              >
                <ToolIcon tool={t.id} />
                {t.label}
              </button>
            ))}
          </div>

          {/* 道具の説明と設定（高さを固定して、道具を変えても画面がずれないように） */}
          <div className="space-y-1 text-xs text-muted">
            <p className="line-clamp-2 h-[2.6em] leading-[1.3] text-ink/90">{toolInfo.hint}</p>
            <div className="flex h-8 items-center gap-3 overflow-x-auto whitespace-nowrap">
              {SHAPE_TOOLS.includes(tool) && (
                <>
                  <MaterialPicker value={newMat} onChange={setNewMat} />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={newFixed} onChange={(e) => setNewFixed(e.target.checked)} />
                    固定する（動かない）
                  </label>
                </>
              )}
              {tool === "motor" && (
                <label className="flex items-center gap-1">
                  回る向き
                  <select
                    value={motorSpeed < 0 ? "cw" : "ccw"}
                    onChange={(e) => setMotorSpeed((e.target.value === "cw" ? -1 : 1) * Math.abs(motorSpeed))}
                    className="rounded border border-line-strong bg-bg-deep px-1 py-0.5 text-ink"
                  >
                    <option value="cw">時計回り</option>
                    <option value="ccw">反時計回り</option>
                  </select>
                </label>
              )}
              {LINK_TOOLS.includes(tool) && <span>つないだ後は「物体」タブで長さ・かたさを変えられる</span>}
              {(tool === "hand" || tool === "erase" || tool === "pin" || tool === "blast") && (
                <span>{playing ? "再生中でも道具は使えます" : "▶ 再生で動き出します"}</span>
              )}
            </div>
          </div>

          {/* キャンバス */}
          <div
            ref={wrapRef}
            className="relative h-[58vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-line-strong bg-bg-deep lg:h-[calc(100vh-280px)] lg:min-h-[480px]"
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`実験の画面。物体${world.bodies.length}個`}
              className="block touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                hoverJointRef.current = null;
              }}
            />
            <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className="num rounded-md bg-bg-deep/85 px-2 py-1 text-ink">⏱ {world.time.toFixed(2)} 秒</span>
              <span className={`rounded-md px-2 py-1 font-bold ${playing ? "bg-ok/20 text-ok" : "bg-bg-deep/85 text-muted"}`}>
                {playing ? "再生中" : hasSnapshot ? "一時停止" : "編集中"}
              </span>
              <span className="num rounded-md bg-bg-deep/85 px-2 py-1 text-muted">
                動く物体 {dynamicCount}
              </span>
            </div>
            {toast && (
              <div
                role="status"
                className="pointer-events-none absolute inset-x-2 bottom-10 mx-auto w-fit max-w-[92%] rounded-lg border border-accent/60 bg-bg-deep/95 px-3 py-2 text-center text-sm"
              >
                {toast}
              </div>
            )}
          </div>

          {/* 再生のボタン */}
          <div className="flex flex-wrap items-center gap-2">
            {playing ? (
              <CtrlButton onClick={pause} primary>
                ⏸ 一時停止
              </CtrlButton>
            ) : (
              <CtrlButton onClick={play} primary>
                ▶ 再生
              </CtrlButton>
            )}
            <CtrlButton onClick={stepOnce} title="1/30秒だけ進める">
              ⏭ 1コマ
            </CtrlButton>
            <CtrlButton onClick={resetToStart} disabled={!hasSnapshot} title="再生を始める前の状態に戻す">
              ⟲ 最初に戻す
            </CtrlButton>
            <CtrlButton onClick={undo} disabled={undoCount === 0}>
              ↶ 元に戻す
            </CtrlButton>
            <span className="ml-auto flex gap-1.5">
              <CtrlButton onClick={() => zoom(1 / 1.3)} title="縮小" aria-label="縮小">
                −
              </CtrlButton>
              <CtrlButton onClick={() => zoom(1.3)} title="拡大" aria-label="拡大">
                ＋
              </CtrlButton>
              <CtrlButton onClick={() => fitView(homeViewRef.current)} title="最初の視点に戻す">
                視点
              </CtrlButton>
            </span>
          </div>
        </div>

        {/* 右（スマホでは下）のパネル */}
        <aside className="min-w-0 space-y-3">
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-line-strong bg-panel/90 p-1" role="tablist">
            {(
              [
                ["samples", "サンプル"],
                ["object", "物体"],
                ["world", "世界"],
                ["save", "保存・共有"],
              ] as [Panel, string][]
            ).map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={panel === id}
                onClick={() => setPanel(id)}
                className={`min-h-10 rounded-lg text-xs font-bold sm:text-sm ${
                  panel === id ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-line-strong bg-panel/90 p-4">
            {panel === "samples" && (
              <SamplesPanel
                onOpen={(sc) => {
                  pushUndo();
                  loadScene(sc);
                  say(`「${sc.title}」を開きました。▶ 再生してみよう`);
                }}
                onBlank={() => {
                  pushUndo();
                  loadScene(blankScene());
                }}
              />
            )}
            {panel === "object" && (
              <InspectorPanel
                world={world}
                body={selected}
                playing={playing}
                onBefore={pushUndo}
                onChange={edited}
                onDelete={(b) => {
                  pushUndo();
                  world.removeBody(b);
                  setSelected(null);
                  edited();
                }}
              />
            )}
            {panel === "world" && (
              <WorldPanel
                settings={settings}
                onChange={setSettings}
                showTrails={showTrails}
                setShowTrails={setShowTrails}
                showVectors={showVectors}
                setShowVectors={setShowVectors}
              />
            )}
            {panel === "save" && (
              <SavePanel
                title={title}
                setTitle={setTitle}
                note={note}
                setNote={setNote}
                getScene={startScene}
                encode={encodeScene}
                onOpen={(sc) => {
                  pushUndo();
                  loadScene(sc);
                  say(`「${sc.title}」を開きました`);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ───────── 小さな部品 ───────── */

/** URL の # から実験を読む。#w= は共有リンク、#t= はタイトルだけ決めたまっさらな世界 */
async function sceneFromHash(hash: string): Promise<{ scene: Scene | null; msg: string } | null> {
  if (hash.startsWith("#w=")) {
    const scene = await decodeScene(hash.slice(3));
    return { scene, msg: scene ? "共有された実験を開きました" : "リンクの実験を読み込めませんでした" };
  }
  if (hash.startsWith("#t=")) {
    let t = BLANK_TITLE;
    try {
      t = decodeURIComponent(hash.slice(3)).slice(0, 80).trim() || BLANK_TITLE;
    } catch {
      /* そのまま */
    }
    return { scene: blankScene(t), msg: "タイトルを決めました。道具で世界をつくろう" };
  }
  return null;
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clampScale = (s: number) => Math.min(4000, Math.max(0.05, s));

function makePreview(tool: Tool, start: Vec, cur: Vec, moved: boolean, scale: number, pending: Vec | null): Preview {
  if (tool === "circle") return moved ? { kind: "circle", c: start, r: dist(start, cur) } : null;
  if (tool === "box") return moved ? { kind: "box", a: start, b: cur } : null;
  if (tool === "ramp") return moved ? { kind: "ramp", a: start, b: cur } : null;
  if (tool === "wall") return moved ? { kind: "wall", a: start, b: cur, t: Math.max(0.05, 9 / scale) } : null;
  if (tool === "blast") return { kind: "blast", c: start, r: moved ? dist(start, cur) : 110 / scale };
  if (tool === "rod" || tool === "rope" || tool === "spring")
    return moved ? { kind: "link", a: start, b: cur, jointKind: tool } : pending ? { kind: "link", a: pending, b: start, jointKind: tool } : null;
  return null;
}

function CtrlButton({
  children,
  onClick,
  primary,
  disabled,
  title,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...rest}
      className={`min-h-11 rounded-xl px-3.5 text-sm font-bold transition disabled:opacity-40 ${
        primary
          ? "bg-accent text-accent-ink hover:brightness-110"
          : "border border-line-strong bg-panel/90 hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

function ToolIcon({ tool }: { tool: Tool }) {
  const c = "currentColor";
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: c, strokeWidth: 2, "aria-hidden": true } as const;
  switch (tool) {
    case "hand":
      return (
        <svg {...common}>
          <path d="M6 3 L6 17 L10 13 L13 20 L16 19 L13 12 L18 12 Z" strokeLinejoin="round" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="1" />
        </svg>
      );
    case "ramp":
      return (
        <svg {...common}>
          <path d="M4 19 L20 19 L4 7 Z" strokeLinejoin="round" />
        </svg>
      );
    case "wall":
      return (
        <svg {...common}>
          <path d="M4 16 L20 8" strokeWidth={4} strokeLinecap="round" />
        </svg>
      );
    case "pin":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill={c} />
        </svg>
      );
    case "motor":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M19 12 A7 7 0 1 1 15 5.6" />
          <path d="M15 2.5 L15.5 6 L12 6.5" />
        </svg>
      );
    case "rod":
      return (
        <svg {...common}>
          <path d="M5 19 L19 5" strokeWidth={3} />
          <circle cx="5" cy="19" r="2" fill={c} />
          <circle cx="19" cy="5" r="2" fill={c} />
        </svg>
      );
    case "rope":
      return (
        <svg {...common}>
          <path d="M5 5 Q12 22 19 5" strokeDasharray="3 2" />
        </svg>
      );
    case "spring":
      return (
        <svg {...common}>
          <path d="M3 12 L6 12 L8 7 L11 17 L14 7 L17 17 L19 12 L21 12" strokeLinejoin="round" />
        </svg>
      );
    case "blast":
      return (
        <svg {...common}>
          <path d="M12 2 L13.5 8 L19 5 L15.5 10.5 L22 12 L15.5 13.5 L19 19 L13.5 16 L12 22 L10.5 16 L5 19 L8.5 13.5 L2 12 L8.5 10.5 L5 5 L10.5 8 Z" strokeLinejoin="round" />
        </svg>
      );
    case "erase":
      return (
        <svg {...common}>
          <path d="M5 7 L19 7 M9 7 L9 4 L15 4 L15 7 M7 7 L8 20 L16 20 L17 7" strokeLinejoin="round" />
        </svg>
      );
  }
}
