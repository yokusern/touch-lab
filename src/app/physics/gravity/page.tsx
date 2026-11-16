import type { Metadata } from "next";
import GravityQuest from "@/components/quests/GravityQuest";

export const metadata: Metadata = { title: "重力切替チャレンジ" };

export default function Page() {
  return <GravityQuest />;
}
