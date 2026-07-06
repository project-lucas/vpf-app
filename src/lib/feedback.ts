// Retours sensoriels de l'app (vibration + sons générés en Web Audio, aucun
// fichier à charger). Trois niveaux de satisfaction, tous dans un registre
// grave et doux (ASMR friendly, pas de fréquences stridentes) :
//   1. successFeedback      — un check (habitude, événement, séance)
//   2. dayCompleteFeedback  — toutes les missions du jour validées
//   3. perfectWeekFeedback  — semaine parfaite, tous les checkpoints dorés
// À n'appeler que depuis un geste utilisateur, sinon le son peut être bloqué.

let audioCtx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibration indisponible (iOS) : le son suffit
  }
}

/** Note douce : sinusoïde avec attaque progressive et extinction naturelle. */
function tone(
  ctx: AudioContext,
  opts: { freq: number; freqEnd?: number; at?: number; dur?: number; gain?: number }
) {
  const { freq, freqEnd = freq * 0.985, at = 0, dur = 0.3, gain = 0.08 } = opts;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Un check : "tick-thock" satisfaisant — attaque brillante nette + corps grave. */
export function successFeedback() {
  vibrate(18);
  const ctx = ensureCtx();
  if (!ctx) return;
  tone(ctx, { freq: 1150, freqEnd: 520, dur: 0.05, gain: 0.05 }); // tick brillant (l'attaque du clic)
  tone(ctx, { freq: 320, freqEnd: 150, dur: 0.16, gain: 0.085 }); // thock (le corps)
  tone(ctx, { freq: 160, freqEnd: 78, dur: 0.18, gain: 0.045 }); // sub grave (l'assise)
}

/** Dé-coche / "pas fait" : petit tap sec et discret, sans célébration. */
export function tapFeedback() {
  vibrate(12);
  const ctx = ensureCtx();
  if (!ctx) return;
  tone(ctx, { freq: 240, freqEnd: 130, dur: 0.09, gain: 0.05 });
}

/** Journée bouclée : deux notes chaudes en quinte, très consonantes. */
export function dayCompleteFeedback() {
  vibrate([35, 60, 45]);
  const ctx = ensureCtx();
  if (!ctx) return;
  tone(ctx, { freq: 262, dur: 0.4, gain: 0.085 }); // do3
  tone(ctx, { freq: 392, at: 0.15, dur: 0.55, gain: 0.1 }); // sol3
  tone(ctx, { freq: 196, at: 0.15, dur: 0.6, gain: 0.04 }); // octave grave discrète
}

/** Record personnel battu : petite fanfare chaude, montée rapide puis note tenue. */
export function recordBeatenFeedback() {
  vibrate([40, 60, 40, 60, 80]);
  const ctx = ensureCtx();
  if (!ctx) return;
  tone(ctx, { freq: 220, dur: 0.22, gain: 0.08 }); // la2
  tone(ctx, { freq: 294, at: 0.14, dur: 0.22, gain: 0.09 }); // ré3
  tone(ctx, { freq: 440, at: 0.28, dur: 0.85, gain: 0.11 }); // la3 tenu
  tone(ctx, { freq: 220, at: 0.28, dur: 0.9, gain: 0.05 }); // assise grave
}

/** Semaine parfaite : arpège majeur ascendant, lent et chaleureux. */
export function perfectWeekFeedback() {
  vibrate([40, 60, 40, 60, 90]);
  const ctx = ensureCtx();
  if (!ctx) return;
  tone(ctx, { freq: 196, dur: 0.5, gain: 0.07 }); // sol2
  tone(ctx, { freq: 262, at: 0.18, dur: 0.5, gain: 0.085 }); // do3
  tone(ctx, { freq: 330, at: 0.36, dur: 0.55, gain: 0.095 }); // mi3
  tone(ctx, { freq: 392, at: 0.56, dur: 0.9, gain: 0.11 }); // sol3, tenu
  tone(ctx, { freq: 196, at: 0.56, dur: 1.0, gain: 0.05 }); // assise grave
}
