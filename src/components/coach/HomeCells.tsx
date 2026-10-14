"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Phone, PhoneCall } from "lucide-react";
import { setKickoffDone } from "@/app/actions/home";
import { formatDateFr } from "@/lib/dates";
import type { MatchPoint, Trend, WeekCell } from "@/lib/staff-overview";
import type { PlayerOffer } from "@/lib/types";

/** P en noir (perf), F en bleu (formation). */
export function OfferMark({ offer }: { offer: PlayerOffer }) {
  const perf = offer === "perf";
  return (
    <span
      title={perf ? "Perf" : "Formation"}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-extrabold text-white ${
        perf ? "bg-[#111111]" : "bg-[#2563eb]"
      }`}
    >
      {perf ? "P" : "F"}
    </span>
  );
}

const TREND_LOOK: Record<Trend, { color: string; label: string }> = {
  up: { color: "text-success", label: "en hausse" },
  down: { color: "text-danger", label: "en baisse" },
  stable: { color: "text-navy-400", label: "stable" },
};

export function TrendArrow({ trend, size = 14 }: { trend: Trend | null; size?: number }) {
  if (!trend) return null;
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  return (
    <span title={TREND_LOOK[trend].label} className={TREND_LOOK[trend].color}>
      <Icon size={size} aria-label={TREND_LOOK[trend].label} />
    </span>
  );
}

/** Courbe des taux hebdomadaires (les plus anciens à gauche). */
export function Sparkline({ history, trend }: { history: WeekCell[]; trend: Trend | null }) {
  const pts = [...history]
    .slice(0, 6)
    .reverse()
    .map((c) => (c.planned > 0 ? Math.min(1, c.done / c.planned) : null));
  const known = pts.filter((p): p is number => p !== null);
  if (known.length < 2) return <span className="text-xs text-navy-300">—</span>;
  const w = 56;
  const h = 18;
  const step = w / (pts.length - 1);
  const coords = pts
    .map((p, i) => (p === null ? null : `${(i * step).toFixed(1)},${(h - 2 - p * (h - 4)).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  const stroke = trend === "up" ? "#15803d" : trend === "down" ? "#b91c1c" : "#6487ab";
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <polyline points={coords} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <TrendArrow trend={trend} />
    </span>
  );
}

/** Le scoring du dernier match, et l'historique dans une petite bulle au clic. */
export function ScoreCell({ matches, trend }: { matches: MatchPoint[]; trend: Trend | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (matches.length === 0) return <span className="text-xs text-navy-300">—</span>;
  const color =
    trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-navy-900";
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[13px] font-extrabold tabular-nums hover:bg-navy-50 ${color}`}
      >
        {matches[0].points} pts
        <TrendArrow trend={trend} size={13} />
      </button>
      {open && (
        <span className="absolute left-0 top-full z-30 mt-1 block w-48 rounded-xl border border-navy-100 bg-white p-2.5 text-left shadow-lg">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-navy-400">
            Derniers matchs
          </span>
          {matches.map((m) => (
            <span key={`${m.date}-${m.points}`} className="flex justify-between py-0.5 text-[12px] text-navy-700">
              <span>{formatDateFr(m.date)}</span>
              <span className="tabular-nums">
                <b className="text-navy-900">{m.points} pts</b> · {m.minutes} min
              </span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/** Deux appels WhatsApp : le joueur, puis un parent. */
export function CallLinks({
  name,
  playerUrl,
  parent,
}: {
  name: string;
  playerUrl: string | null;
  parent: { url: string; name: string } | null;
}) {
  const base = "flex h-8 w-8 items-center justify-center rounded-full border transition-colors";
  const on = "border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10";
  const off = "border-navy-100 text-navy-200 cursor-not-allowed";
  return (
    <span className="inline-flex items-center gap-1.5">
      {playerUrl ? (
        <a href={playerUrl} target="_blank" rel="noopener noreferrer" className={`${base} ${on}`} title={`Appeler ${name} sur WhatsApp`} aria-label={`Appeler ${name} sur WhatsApp`}>
          <Phone size={14} />
        </a>
      ) : (
        <span className={`${base} ${off}`} title="Pas de numéro WhatsApp pour le joueur">
          <Phone size={14} />
        </span>
      )}
      {parent ? (
        <a href={parent.url} target="_blank" rel="noopener noreferrer" className={`${base} ${on}`} title={`Appeler ${parent.name} (parent) sur WhatsApp`} aria-label={`Appeler ${parent.name}, parent de ${name}, sur WhatsApp`}>
          <PhoneCall size={14} />
        </a>
      ) : (
        <span className={`${base} ${off}`} title="Pas de numéro WhatsApp pour un parent">
          <PhoneCall size={14} />
        </span>
      )}
    </span>
  );
}

/** La visio de départ : une case que seul un admin coche. */
export function KickoffBox({
  playerId,
  doneAt,
  canEdit,
}: {
  playerId: string;
  doneAt: string | null;
  canEdit: boolean;
}) {
  const [checked, setChecked] = useState(Boolean(doneAt));
  const [isPending, startTransition] = useTransition();
  return (
    <label
      className={`inline-flex items-center gap-1.5 ${canEdit ? "cursor-pointer" : ""}`}
      title={doneAt ? `Faite le ${formatDateFr(doneAt.slice(0, 10))}` : "Visio de départ à faire"}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!canEdit || isPending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          startTransition(async () => {
            const r = await setKickoffDone(playerId, next);
            if (!r.ok) setChecked(!next);
          });
        }}
        className="h-4 w-4 accent-[#0f2a4a]"
      />
      <span className={`text-[11px] font-semibold ${checked ? "text-success" : "text-warning"}`}>
        {checked ? "Faite" : "À faire"}
      </span>
    </label>
  );
}

/** Une semaine passée : pointages et bilan. */
export function WeekHistoryCell({ cell }: { cell: WeekCell }) {
  if (cell.planned === 0) return <span className="text-xs text-navy-200">—</span>;
  const r = cell.done / cell.planned;
  const tone = r >= 0.8 ? "bg-success-soft text-success" : r >= 0.6 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger";
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tone}`}>
        {cell.done}/{cell.planned}
      </span>
      <span
        title={cell.review ? "Bilan rendu" : "Pas de bilan"}
        className={`h-1.5 w-1.5 rounded-full ${cell.review ? "bg-navy-800" : "bg-navy-100"}`}
      />
    </span>
  );
}
