"use client";

import { useMemo, useSyncExternalStore } from "react";

// 進捗はこの端末のブラウザ（localStorage）にだけ保存する。ログイン・サーバー保存なし。
const KEY = "touch-lab:progress:v1";
const EVENT = "touch-lab:progress";

export type QuestRecord = {
  best: number;
  last: number;
  cleared: boolean;
  plays: number;
  updatedAt: string;
};
export type Progress = Record<string, QuestRecord>;

export const CLEAR_SCORE = 60;

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): Progress {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Progress) : {};
  } catch {
    return {};
  }
}

export function saveResult(questId: string, score: number): QuestRecord {
  const all = parse(read());
  const prev = all[questId];
  const rec: QuestRecord = {
    best: Math.max(prev?.best ?? 0, score),
    last: score,
    cleared: (prev?.cleared ?? false) || score >= CLEAR_SCORE,
    plays: (prev?.plays ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  all[questId] = rec;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 保存できない環境（プライベートモード等）でも遊べるようにする
  }
  window.dispatchEvent(new Event(EVENT));
  return rec;
}

export function resetProgress() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** サーバー描画時は null（＝まだ読めていない） */
export function useProgress(): Progress | null {
  const raw = useSyncExternalStore(subscribe, read, () => "__server__");
  return useMemo(() => (raw === "__server__" ? null : parse(raw)), [raw]);
}
