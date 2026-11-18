import type { Metadata } from "next";
import WhatIfApp from "@/components/whatif/WhatIfApp";

export const metadata: Metadata = {
  title: "もしも計算機 — 全人類が東へ走ったら？",
  description:
    "全人類が同時に東へ走ったら1日の長さは？地球の自転が止まったら？地球を貫く穴に飛びこんだら？地球規模の「もしも」を、実際の物理の式と測定値で計算します。",
};

export default function WhatIfPage() {
  return <WhatIfApp />;
}
