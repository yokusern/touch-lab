// クエストとモジュールの図（SVG）。設計図ふうの線画。

export function QuestArt({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 240 120" className="block h-auto w-full" aria-hidden>
      <defs>
        <pattern id={`g-${id}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(130,190,255,0.10)" />
        </pattern>
      </defs>
      <rect width="240" height="120" fill={`url(#g-${id})`} />
      {id === "slide" && (
        <g>
          <path d="M30 30 L210 100 L30 100 Z" fill="rgba(82,214,255,0.08)" stroke="var(--physics)" strokeWidth="2" />
          <path d="M30 30 L210 100" stroke="var(--amber)" strokeWidth="1.5" strokeDasharray="2 3" />
          <g transform="translate(92 54) rotate(21.25)">
            <rect x="-13" y="-28" width="26" height="26" fill="rgba(82,214,255,0.3)" stroke="var(--physics)" strokeWidth="2" />
          </g>
          <path d="M170 100 A40 40 0 0 1 172.7 85.5" fill="none" stroke="var(--muted)" />
          <text x="148" y="95" fill="var(--muted)" fontSize="10" fontFamily="monospace">θ</text>
          <text x="38" y="20" fill="var(--amber)" fontSize="11" fontFamily="monospace">μ = ?</text>
        </g>
      )}
      {id === "fall" && (
        <g>
          <line x1="24" y1="104" x2="216" y2="104" stroke="var(--ok)" strokeWidth="2" />
          <line x1="40" y1="14" x2="40" y2="104" stroke="rgba(130,190,255,0.38)" />
          <circle cx="100" cy="44" r="13" fill="rgba(82,214,255,0.85)" stroke="var(--physics)" strokeWidth="2" />
          <circle cx="170" cy="30" r="13" fill="rgba(82,214,255,0.15)" stroke="var(--ink)" strokeWidth="2" />
          <path d="M100 62 v18 M94 74 l6 8 l6 -8" stroke="var(--physics)" strokeWidth="2" fill="none" />
          <path d="M170 48 v12 M164 54 l6 8 l6 -8" stroke="var(--ink)" strokeWidth="2" fill="none" />
          <text x="86" y="20" fill="var(--ink)" fontSize="10" fontFamily="monospace">5kg</text>
          <text x="158" y="12" fill="var(--ink)" fontSize="10" fontFamily="monospace">50g</text>
          <path d="M196 40 h14 M190 60 h18 M200 80 h12" stroke="rgba(255,190,85,0.5)" />
        </g>
      )}
      {id === "gravity" && (
        <g>
          <circle cx="58" cy="60" r="34" fill="rgba(180,156,255,0.12)" stroke="var(--math)" strokeWidth="2" />
          <circle cx="58" cy="60" r="22" fill="none" stroke="var(--math)" strokeDasharray="3 4" />
          <text x="44" y="64" fill="var(--ink)" fontSize="11" fontFamily="monospace">g=?</text>
          <rect x="112" y="72" width="108" height="10" rx="5" fill="rgba(130,190,255,0.15)" />
          <rect x="156" y="68" width="20" height="18" rx="3" fill="rgba(94,230,160,0.35)" />
          <line x1="166" y1="62" x2="166" y2="92" stroke="var(--ok)" strokeWidth="2" />
          <text x="150" y="56" fill="var(--ok)" fontSize="10" fontFamily="monospace">±5%</text>
          <circle cx="132" cy="28" r="8" fill="rgba(82,214,255,0.7)" stroke="var(--ink)" strokeWidth="1.5" />
          <path d="M132 40 v18 M127 52 l5 7 l5 -7" stroke="var(--math)" strokeWidth="2" fill="none" />
        </g>
      )}
    </svg>
  );
}

export function ModuleIcon({ kind }: { kind: "physics" | "chem" | "circuit" | "bio" | "math" }) {
  const c = `var(--${kind})`;
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      {kind === "physics" && (
        <g fill="none" stroke={c} strokeWidth="3">
          <path d="M8 52 L56 52 L8 20 Z" />
          <circle cx="24" cy="26" r="7" fill={c} fillOpacity="0.3" />
        </g>
      )}
      {kind === "chem" && (
        <g fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round">
          <path d="M24 8 h16 M27 8 v16 L12 52 a4 4 0 0 0 4 5 h32 a4 4 0 0 0 4 -5 L37 24 V8" />
          <path d="M18 42 h28" />
        </g>
      )}
      {kind === "circuit" && (
        <g fill="none" stroke={c} strokeWidth="3">
          <rect x="8" y="14" width="48" height="36" rx="2" />
          <path d="M8 32 h10 l4 -8 l6 16 l6 -16 l6 16 l4 -8 h10" />
        </g>
      )}
      {kind === "bio" && (
        <g fill="none" stroke={c} strokeWidth="3">
          <path d="M20 6 C44 20, 20 44, 44 58" />
          <path d="M44 6 C20 20, 44 44, 20 58" />
          <path d="M24 16 h16 M24 32 h16 M24 48 h16" strokeWidth="2" />
        </g>
      )}
      {kind === "math" && (
        <g fill="none" stroke={c} strokeWidth="3">
          <path d="M8 56 V8 M8 56 H58" />
          <path d="M10 50 C24 50, 30 14, 56 12" />
        </g>
      )}
    </svg>
  );
}
