function extractVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export function YouTubeEmbed({ url, title }: { url: string; title: string }) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-navy-100 text-sm text-navy-400">
        Vidéo à venir
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-navy-900">
      {/* referrerPolicy explicite : YouTube refuse le lecteur intégré (erreur
          153 « configuration du lecteur ») quand la requête arrive sans
          Referer — cas de la PWA installée sur l'écran d'accueil iOS. */}
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full"
        loading="lazy"
      />
    </div>
  );
}
