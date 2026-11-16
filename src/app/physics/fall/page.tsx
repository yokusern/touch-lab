import type { Metadata } from "next";
import FallQuest from "@/components/quests/FallQuest";

export const metadata: Metadata = { title: "自由落下レース" };

export default function Page() {
  return <FallQuest />;
}
