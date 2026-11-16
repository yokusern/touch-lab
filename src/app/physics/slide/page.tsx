import type { Metadata } from "next";
import SlideQuest from "@/components/quests/SlideQuest";

export const metadata: Metadata = { title: "斜面スライド" };

export default function Page() {
  return <SlideQuest />;
}
