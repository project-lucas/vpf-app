/**
 * Les visuels de Jarvis : la mascotte VPF (casque bleu marine, lignes orange
 * de ballon, visière noire, yeux bleu glacier), images détourées dans
 * `public/jarvis/`. Pas de vidéo : une boucle animée grésillait à l'écran.
 *
 * - `pose="default"` : la tête de face, partout où Jarvis parle (barre
 *   latérale, volets, discussion).
 * - `pose="happy"` : la tête souriante de trois quarts (bouton de l'accueil).
 * - `pose="happy-left"` : la même, tournée vers la gauche ; le bouton
 *   flottant est en bas à droite, Jarvis regarde donc vers l'intérieur.
 *
 * Par défaut la tête est posée dans un rond crème (lisible sur fond navy) ;
 * `bare` la laisse flotter, pour un fond blanc ou crème. `thinking` la fait
 * pulser pendant qu'il travaille.
 */
const SRC = {
  default: "/jarvis/jarvis-head.webp",
  happy: "/jarvis/jarvis-smile.webp",
  "happy-left": "/jarvis/jarvis-smile-left.webp",
} as const;

export function JarvisAvatar({
  size = 32,
  thinking = false,
  pose = "default",
  bare = false,
  className = "",
}: {
  size?: number;
  thinking?: boolean;
  pose?: keyof typeof SRC;
  bare?: boolean;
  className?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- petite image statique, pas besoin de l'optimiseur
    <img
      src={SRC[pose]}
      alt=""
      draggable={false}
      className="pointer-events-none h-full w-full select-none object-contain"
    />
  );
  const motion = thinking ? "jarvis-thinking" : "";
  const sizeStyle = size ? { width: size, height: size } : undefined;

  if (bare) {
    return (
      <span
        role="img"
        aria-label="Jarvis"
        className={`inline-block shrink-0 ${motion} ${className}`}
        style={sizeStyle}
      >
        {img}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Jarvis"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#f5efe2] ${motion} ${className}`}
      style={{ ...sizeStyle, padding: Math.max(1, Math.round(size * 0.06)) }}
    >
      {img}
    </span>
  );
}
