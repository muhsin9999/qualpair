/**
 * QualPair mark: two overlapping speech bubbles (the interview, and its pair of readings),
 * the front one carrying a check. Same geometry as public/favicon.svg.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flex: 'none', display: 'block' }}>
      <path d="M7 3h11a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9.5L5 22.6V18.3A5 5 0 0 1 2 13.6V8a5 5 0 0 1 5-5Z" fill="#1F5E57" />
      <path d="M14.5 10.5h11.5a5 5 0 0 1 5 5v6.2a5 5 0 0 1-3 4.6v4.2l-4.6-3.8h-8.9a5 5 0 0 1-5-5v-6.2a5 5 0 0 1 5-5Z" fill="#1D2422" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" paintOrder="stroke" />
      <path d="M15.6 19l3 3 5.8-5.8" fill="none" stroke="#F3F1EC" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mark plus the two-tone wordmark. */
export function Logo({ size = 28, fontSize = 18 }: { size?: number; fontSize?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size / 3) }}>
      <LogoMark size={size} />
      <span style={{ fontWeight: 800, fontSize, letterSpacing: '-0.01em' }}>
        <span style={{ color: 'var(--ink)' }}>Qual</span><span style={{ color: 'var(--laptop)' }}>Pair</span>
      </span>
    </span>
  );
}
