import type { Metadata } from "next";
import { QuestList } from "@/components/ProgressBits";

export const metadata: Metadata = { title: "物理（力学）クエスト一覧" };

export default function PhysicsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <p className="num text-xs font-bold tracking-[0.25em] text-physics">MODULE 01 / PHYSICS</p>
        <h1 className="text-3xl font-black">物理（力学）クエスト</h1>
        <p className="text-muted">3つのクエストで、摩擦・質量・重力・空気抵抗を自分の手で動かしてみよう。</p>
      </div>
      <QuestList />
    </div>
  );
}
