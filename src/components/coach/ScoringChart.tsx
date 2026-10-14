/** Courbe des points des derniers matchs (le plus ancien à gauche), aire orange. */
export function ScoringChart({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const w = 400;
  const h = 90;
  const max = Math.max(10, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const xy = points.map((p, i) => [i * step, h - 6 - (p / max) * (h - 16)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${w},${h} 0,${h}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Points des derniers matchs">
      <polygon points={area} fill="#e8622c" opacity="0.08" />
      <polyline points={line} fill="none" stroke="#e8622c" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
