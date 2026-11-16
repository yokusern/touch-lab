"use client";

import Link from "next/link";
import { QuestArt } from "@/components/art";
import { CLEAR_SCORE, resetProgress, useProgress } from "@/lib/progress";
import { QUESTS } from "@/lib/quests";

export function PhysicsProgressBadge() {
  const progress = useProgress();
  const cleared = progress ? QUESTS.filter((q) => progress[q.id]?.cleared).length : null;
  return (
    <span className="num text-xs text-muted">
      {cleared === null ? " " : `クリア ${cleared} / ${QUESTS.length}`}
    </span>
  );
}

export function QuestList() {
  const progress = useProgress();
  const cleared = progress ? QUESTS.filter((q) => progress[q.id]?.cleared).length : 0;
  const hasAny = progress ? Object.keys(progress).length > 0 : false;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line-strong bg-panel/90 p-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-bold">力学モジュールの進捗</span>
          <span className="num text-muted">
            {progress ? cleared : "–"} / {QUESTS.length} クリア
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-deep" aria-hidden>
          <div className="h-full rounded-full bg-physics" style={{ width: `${(cleared / QUESTS.length) * 100}%` }} />
        </div>
      </div>

      <ol className="grid gap-4 md:grid-cols-3">
        {QUESTS.map((q) => {
          const rec = progress?.[q.id];
          return (
            <li key={q.id}>
              <Link
                href={q.href}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel/90 transition hover:-translate-y-0.5 hover:border-physics"
              >
                <div className="border-b border-line bg-bg-deep">
                  <QuestArt id={q.id} />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-sm font-bold text-physics">{q.number}</span>
                    {progress === null ? (
                      <span className="h-5 w-12 rounded-full border border-line" aria-hidden />
                    ) : rec?.cleared ? (
                      <span className="rounded-full bg-ok px-2 py-0.5 text-xs font-black text-accent-ink">クリア</span>
                    ) : rec ? (
                      <span className="rounded-full border border-amber px-2 py-0.5 text-xs font-bold text-amber">挑戦中</span>
                    ) : (
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted">未挑戦</span>
                    )}
                  </div>
                  <h3 className="text-lg font-black">{q.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{q.question}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
                    <div className="flex flex-wrap gap-1">
                      {q.params.map((p) => (
                        <span key={p} className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">
                          {p}
                        </span>
                      ))}
                    </div>
                    <span className="num text-xs text-muted">
                      {progress === null ? " " : rec ? `ベスト ${rec.best}点` : `${CLEAR_SCORE}点でクリア`}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      {hasAny && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("この端末に保存された進捗をすべて消しますか？")) resetProgress();
          }}
          className="text-xs text-muted underline underline-offset-4 hover:text-ink"
        >
          進捗をリセット
        </button>
      )}
    </div>
  );
}
