// 自由実験室の保存（この端末のブラウザにだけ保存。サーバーには送らない）
import type { Scene } from "./scene";

const SAVED = "touch-lab:sandbox:saved:v1";
const AUTO = "touch-lab:sandbox:autosave:v1";

export type SavedExperiment = { id: string; title: string; savedAt: string; scene: Scene };

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function set(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function listSaved(): SavedExperiment[] {
  try {
    const v = JSON.parse(get(SAVED) ?? "[]");
    return Array.isArray(v) ? (v as SavedExperiment[]).filter((x) => x && x.scene && x.id) : [];
  } catch {
    return [];
  }
}

export function saveExperiment(scene: Scene, id?: string): SavedExperiment | null {
  const all = listSaved();
  const rec: SavedExperiment = {
    id: id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: scene.title,
    savedAt: new Date().toISOString(),
    scene,
  };
  const next = [rec, ...all.filter((x) => x.id !== rec.id)].slice(0, 40);
  return set(SAVED, JSON.stringify(next)) ? rec : null;
}

export function deleteExperiment(id: string) {
  set(SAVED, JSON.stringify(listSaved().filter((x) => x.id !== id)));
}

export function loadAutosave(): Scene | null {
  try {
    const v = JSON.parse(get(AUTO) ?? "null");
    return v && v.v === 1 && Array.isArray(v.bodies) ? (v as Scene) : null;
  } catch {
    return null;
  }
}

export function writeAutosave(scene: Scene) {
  set(AUTO, JSON.stringify(scene));
}
