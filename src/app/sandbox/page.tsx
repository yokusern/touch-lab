import type { Metadata } from "next";
import SandboxApp from "@/components/sandbox/SandboxApp";

export const metadata: Metadata = {
  title: "自由実験室 — まっさらな世界で物理実験",
  description:
    "円・箱・坂・ばね・ひも・モーターを置いて、重力・空気の濃さ・万有引力まで自由に変えられる物理サンドボックス。自作の物理エンジンで動き、実験はタイトルをつけて保存・共有できます。",
};

export default function SandboxPage() {
  return <SandboxApp />;
}
