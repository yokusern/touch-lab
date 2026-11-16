import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const jp = Noto_Sans_JP({
  variable: "--font-jp",
  weight: ["400", "500", "700", "900"],
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "さわれる実験室 — 予想して、さわって、たしかめる物理",
    template: "%s | さわれる実験室",
  },
  description:
    "予測する→パラメータを触る→実行→ズレを採点→解説。摩擦・質量・重力・空気抵抗を自分の手で変えて、物理の法則をたしかめる無料の学習シミュレーション。",
};

export const viewport: Viewport = {
  themeColor: "#0a1830",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${jp.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-bg-deep/80 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-black tracking-wide">
              <LogoMark />
              <span>さわれる実験室</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/physics" className="hover:text-ink">
                クエスト
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-bg-deep/80 text-xs text-muted">
          <div className="mx-auto max-w-5xl space-y-1 px-4 py-6">
            <p>物理計算は物理エンジンを使わず、式と細かい刻みの数値計算で自前で行っています。前提条件は各クエストの解説に明記しています。</p>
            <p>進捗はこの端末のブラウザにだけ保存されます（ログイン不要・送信なし）。</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
      <rect x="1" y="1" width="24" height="24" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M5 19 L19 7" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="9" cy="15.5" r="3" fill="var(--accent)" />
    </svg>
  );
}
