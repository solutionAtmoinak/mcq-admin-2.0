// Inline SVG illustrations for the error / not-found screens. Colors come from
// the brand tokens (globals.css) and Tailwind's zinc/amber scale, so they follow
// the rest of the admin UI.

const sparkle = "fill-brand/30";

export function NotFoundIllustration() {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden="true" className="mx-auto h-auto w-64 max-w-full">
      <ellipse cx="120" cy="165" rx="88" ry="8" className="fill-zinc-200/70" />

      {/* browser window */}
      <rect x="32" y="20" width="156" height="112" rx="12" className="fill-white stroke-zinc-200" strokeWidth="2" />
      <path d="M32 32a12 12 0 0 1 12-12h132a12 12 0 0 1 12 12v12H32z" className="fill-brand-soft" />
      <circle cx="47" cy="32" r="3.5" className="fill-red-300" />
      <circle cx="60" cy="32" r="3.5" className="fill-amber-300" />
      <circle cx="73" cy="32" r="3.5" className="fill-emerald-300" />
      <rect x="86" y="28" width="86" height="8" rx="4" className="fill-white/80" />

      <text
        x="110"
        y="96"
        textAnchor="middle"
        fontSize="44"
        fontWeight="800"
        letterSpacing="2"
        className="fill-brand"
        style={{ fontFamily: "inherit" }}
      >
        404
      </text>
      <rect x="58" y="108" width="104" height="6" rx="3" className="fill-zinc-100" />
      <rect x="74" y="119" width="72" height="6" rx="3" className="fill-zinc-100" />

      {/* magnifier */}
      <circle cx="170" cy="116" r="25" className="fill-white/90 stroke-brand" strokeWidth="6" />
      <path d="M189 135l22 22" className="stroke-brand" strokeWidth="10" strokeLinecap="round" />
      <path d="M163 108a8 8 0 1 1 11 7c-3 2-4 4-4 7" className="stroke-brand" strokeWidth="4" strokeLinecap="round" />
      <circle cx="170" cy="129" r="2.6" className="fill-brand" />

      {/* sparkles */}
      <circle cx="18" cy="62" r="4" className={sparkle} />
      <circle cx="214" cy="44" r="5" className={sparkle} />
      <path d="M208 92v10M203 97h10" className="stroke-brand/40" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 108v8M18 112h8" className="stroke-brand/40" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorIllustration() {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden="true" className="mx-auto h-auto w-64 max-w-full">
      <ellipse cx="120" cy="165" rx="88" ry="8" className="fill-zinc-200/70" />

      {/* browser window */}
      <rect x="32" y="20" width="176" height="124" rx="12" className="fill-white stroke-zinc-200" strokeWidth="2" />
      <path d="M32 32a12 12 0 0 1 12-12h152a12 12 0 0 1 12 12v12H32z" className="fill-brand-soft" />
      <circle cx="47" cy="32" r="3.5" className="fill-red-300" />
      <circle cx="60" cy="32" r="3.5" className="fill-amber-300" />
      <circle cx="73" cy="32" r="3.5" className="fill-emerald-300" />

      {/* warning triangle */}
      <path
        d="M120 58L154 114H86Z"
        className="fill-amber-100 stroke-amber-400"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path d="M120 80v16" className="stroke-amber-500" strokeWidth="5" strokeLinecap="round" />
      <circle cx="120" cy="105" r="3.2" className="fill-amber-500" />

      <rect x="62" y="128" width="116" height="6" rx="3" className="fill-zinc-100" />

      {/* crack */}
      <path d="M196 44l-9 18 8 6-10 20" className="stroke-red-300" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* sparkles */}
      <circle cx="20" cy="70" r="4" className={sparkle} />
      <circle cx="224" cy="112" r="5" className={sparkle} />
      <path d="M22 112v8M18 116h8" className="stroke-brand/40" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
