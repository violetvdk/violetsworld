// Met de hand getekende stukken en muur (SVG), met een potlood-wobbel via SVG-filters.

const BODY = {
  p: (
    <>
      <circle cx="50" cy="30" r="12" />
      <path d="M37 80 Q40 56 50 47 Q60 56 63 80 Z" />
      <path d="M29 80 H71 V89 H29 Z" />
    </>
  ),
  r: (
    <path d="M28 89 V79 H33 L37 46 H29 V22 H40 V31 H46 V22 H54 V31 H60 V22 H71 V46 H63 L67 79 H72 V89 Z" />
  ),
  n: (
    <path d="M30 89 V80 C30 62 38 52 46 43 C40 43 35 46 29 52 L24 47 C27 38 36 26 46 20 L47 11 L55 18 C70 20 76 35 73 52 C71 65 69 74 69 80 V89 Z" />
  ),
  b: (
    <>
      <circle cx="50" cy="13" r="5" />
      <path d="M37 80 Q31 60 42 46 Q35 34 50 19 Q65 34 58 46 Q69 60 63 80 Z" />
      <path d="M29 80 H71 V89 H29 Z" />
    </>
  ),
  q: (
    <>
      <circle cx="26" cy="31" r="4.5" />
      <circle cx="42" cy="22" r="4.5" />
      <circle cx="58" cy="22" r="4.5" />
      <circle cx="74" cy="31" r="4.5" />
      <path d="M33 80 L27 37 L40 56 L43 29 L50 54 L57 29 L60 56 L73 37 L67 80 Z" />
      <path d="M27 80 H73 V89 H27 Z" />
    </>
  ),
  k: (
    <>
      <path d="M50 8 V26 M42 16 H58" fill="none" />
      <path d="M38 47 Q36 33 50 30 Q64 33 62 47 Q72 58 67 80 H33 Q28 58 38 47 Z" />
      <path d="M28 80 H72 V89 H28 Z" />
    </>
  ),
}

// Details (oog, gleuf) — wit op zwarte stukken, zwart op witte.
const DETAIL = {
  n: <path d="M54 29 L54.5 29.5" strokeWidth="6" />,
  b: <path d="M45 33 L55 42" />,
  q: <path d="M36 72 H64" />,
  k: <path d="M38 72 H62" />,
  r: <path d="M36 58 H64" />,
  p: null,
}

export function SketchDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {[0, 1, 2].map((i) => (
          <filter key={i} id={`rough${i}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={i * 7 + 3} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" />
          </filter>
        ))}
        <filter id="roughBoard" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" />
        </filter>
        <pattern id="scribble" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="6" height="6" fill="#fff" />
          <line x1="0" y1="1.5" x2="6" y2="1.5" stroke="#111" strokeWidth="2.6" />
          <line x1="0" y1="4.6" x2="6" y2="4.6" stroke="#111" strokeWidth="1.4" />
        </pattern>
      </defs>
    </svg>
  )
}

export function Piece({ type, color, seed = 0, className = '' }) {
  const black = color === 'b'
  return (
    <svg
      viewBox="0 0 100 100"
      className={`pc ${className}`}
      style={{ filter: `url(#rough${seed % 3})` }}
    >
      <g
        fill={black ? 'url(#scribble)' : '#fff'}
        stroke="#111"
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {BODY[type]}
      </g>
      <g
        fill="none"
        stroke={black ? '#fff' : '#111'}
        strokeWidth="3"
        strokeLinecap="round"
        style={{ color: black ? '#fff' : '#111' }}
      >
        {DETAIL[type]}
      </g>
    </svg>
  )
}

export function Wall({ seed = 0 }) {
  const s = seed % 3
  return (
    <svg viewBox="0 0 100 100" className="wallsvg" style={{ filter: `url(#rough${s})` }}>
      <g fill="#fff" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="6" width="88" height="88" />
        <path d="M6 28 H94 M6 50 H94 M6 72 H94" fill="none" strokeWidth="3" />
        <path
          d="M40 6 V28 M70 6 V28 M22 28 V50 M58 28 V50 M85 28 V50 M40 50 V72 M70 50 V72 M22 72 V94 M58 72 V94 M85 72 V94"
          fill="none"
          strokeWidth="3"
        />
      </g>
    </svg>
  )
}
