"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import {
  applyProgramChoices,
  approveReportDraft,
  approveReviewDraft,
  decideVisio,
  dismissDraft,
} from "@/app/actions/jarvis-queue";
import { setReviewReply } from "@/app/actions/coach";
import { Button } from "@/components/ui/Button";
import { weekdaysLabel } from "@/components/coach/WeekdayPicker";
import { REVIEW_HEALTH_LABELS, REVIEW_REPLY_MAX_LENGTH } from "@/lib/constants";
import type { QueuePlayer, QueueProgram, QueueReport, QueueReview, QueueVisio } from "./types";

type Result = { ok: true } | { ok: false; error: string };

/** Valider · Modifier · Passer : le geste commun des brouillons. */
export function useDecision() {
  const [state, setState] = useState<"open" | "sent" | "dismissed">("open");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<Result>, next: "sent" | "dismissed") =>
    start(async () => {
      setError(null);
      const r = await action();
      if (r.ok) setState(next);
      else setError(r.error);
    });
  return { state, error, pending, run };
}

export function PlayerLine({ p, extra }: { p: QueuePlayer; extra?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <Link href={`/coach/joueurs/${p.id}`} className="text-[15px] font-bold text-navy-900 hover:underline">
        {p.name}
      </Link>
      {extra && <span className="text-[12px] text-navy-400">{extra}</span>}
      {p.coach && <span className="text-[12px] text-navy-400">· suivi par {p.coach}</span>}
    </div>
  );
}

export function Done({ p, text }: { p: QueuePlayer; text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-cream px-3 py-2 text-[13px] text-navy-500">
      <Check size={14} className="text-success" />
      {p.name} · {text}
    </p>
  );
}

/** Le petit titre d'une partie de carte : on lit la carte par blocs, pas d'une traite. */
export function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-navy-400">{label}</p>
      {children}
    </div>
  );
}

export function JarvisNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="flex gap-2 rounded-xl bg-cream/70 px-3 py-2.5 text-[13px] leading-relaxed text-navy-700">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-accent" />
      {text}
    </p>
  );
}

export function DraftEditor({
  value,
  onChange,
  max,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  max: number;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, max))}
      rows={rows}
      // la zone suit son texte : pas de mini-ascenseur dans une carte
      style={{ fieldSizing: "content" } as React.CSSProperties}
      className="min-h-[96px] w-full rounded-xl border border-navy-100 bg-white px-3.5 py-3 text-[14px] leading-relaxed text-navy-900 focus:border-accent focus:outline-none"
    />
  );
}

export function Actions({
  pending,
  error,
  onSend,
  onSkip,
  sendLabel,
  disabled,
  skipLabel = "Passer",
}: {
  pending: boolean;
  error: string | null;
  onSend: () => void;
  onSkip: () => void;
  sendLabel: string;
  disabled?: boolean;
  skipLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={onSend} loading={pending} disabled={disabled || pending}>
        {sendLabel}
      </Button>
      <Button size="sm" variant="ghost" onClick={onSkip} disabled={pending}>
        {skipLabel}
      </Button>
      {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ReviewCard({ item, sent = false }: { item: QueueReview; sent?: boolean }) {
  const [body, setBody] = useState(item.draft?.body ?? "");
  const d = useDecision();
  if (sent) return <Done p={item} text="réponse envoyée" />;
  if (d.state !== "open") return <Done p={item} text={d.state === "sent" ? "réponse envoyée" : "passé"} />;
  const health = item.health ? (REVIEW_HEALTH_LABELS[item.health] ?? item.health) : null;
  return (
    <article className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <PlayerLine p={item} extra={`bilan ${item.weekLabel}`} />
      <Part label="Son bilan">
      <dl className="grid gap-3 rounded-xl bg-cream/50 px-3.5 py-3 text-[13.5px] leading-relaxed text-navy-700 sm:grid-cols-2">
        <div>
          <dt className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-navy-400">Bien fait</dt>
          <dd className="whitespace-pre-line">{item.wentWell || "—"}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-navy-400">À améliorer</dt>
          <dd className="whitespace-pre-line">{item.toImprove || "—"}</dd>
        </div>
        {health && (
          <div className="sm:col-span-2">
            <dt className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-navy-400">Santé</dt>
            <dd className={item.health === "ok" ? "" : "font-semibold text-danger"}>
              {health}
              {item.healthNote ? ` · ${item.healthNote}` : ""}
            </dd>
          </div>
        )}
      </dl>
      </Part>
      {item.draft?.reason && (
        <Part label="L'avis de Jarvis">
          <JarvisNote text={item.draft.reason} />
        </Part>
      )}
      <Part label="Ta réponse">
      <div className="space-y-2.5">
      {!item.draft && (
        <p className="text-[12px] text-navy-400">
          {item.draftFailed
            ? "Jarvis n'a pas pu rédiger ce brouillon : écris la réponse toi-même."
            : "Brouillon en préparation par Jarvis — tu peux aussi répondre toi-même."}
        </p>
      )}
      <DraftEditor value={body} onChange={setBody} max={REVIEW_REPLY_MAX_LENGTH} />
      </div>
      </Part>
      <div className="border-t border-navy-50 pt-4">
      <Actions
        pending={d.pending}
        error={d.error}
        sendLabel={item.draft ? "Valider et envoyer" : "Envoyer"}
        disabled={!body.trim()}
        onSend={() =>
          d.run(
            () => (item.draft ? approveReviewDraft(item.draft.id, body) : setReviewReply(item.reviewId, body)),
            "sent"
          )
        }
        onSkip={() =>
          item.draft ? d.run(() => dismissDraft(item.draft!.id), "dismissed") : d.run(async () => ({ ok: true }), "dismissed")
        }
      />
      </div>
    </article>
  );
}

export function VisioCard({ item }: { item: QueueVisio }) {
  // deux réponses au décrochage : proposer une visio, ou simplement prendre des nouvelles
  const [mode, setMode] = useState<"visio" | "news">("visio");
  const [texts, setTexts] = useState({ visio: item.body, news: item.checkinBody });
  const body = texts[mode];
  const setBody = (v: string) => setTexts((t) => ({ ...t, [mode]: v }));
  const d = useDecision();
  if (d.state !== "open") {
    return (
      <Done
        p={item}
        text={d.state === "sent" ? (mode === "visio" ? "visio proposée" : "message envoyé") : "passé cette semaine"}
      />
    );
  }
  return (
    <article className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <PlayerLine p={item} />
      <Part label="Les signaux">
        <ul className="flex flex-wrap gap-1.5">
          {item.reasons.map((r) => (
            <li key={r} className="rounded-full bg-warning-soft px-2.5 py-1 text-[11.5px] font-semibold leading-snug text-warning">
              {r}
            </li>
          ))}
        </ul>
      </Part>
      {/* l'avis de Jarvis, sans répéter les signaux déjà en pastilles */}
      {item.reason && (
        <Part label="L'avis de Jarvis">
          <JarvisNote text={item.reason.split(" — ")[0]} />
        </Part>
      )}
      <Part label="Ta réponse">
      <div className="space-y-2.5">
      {!item.fromJarvis && (
        <p className="text-[12px] text-navy-400">Message type — Jarvis le personnalisera au prochain passage du matin.</p>
      )}
      <div role="tablist" aria-label="Réponse" className="inline-flex gap-1 rounded-xl bg-cream p-1">
        {(
          [
            { key: "visio", label: "Proposer une visio" },
            { key: "news", label: "Prendre des nouvelles" },
          ] as const
        ).map((o) => (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={mode === o.key}
            onClick={() => setMode(o.key)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
              mode === o.key ? "bg-white text-navy-900 shadow-sm" : "text-navy-500 hover:text-navy-900"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <DraftEditor value={body} onChange={setBody} max={800} rows={3} />
      </div>
      </Part>
      <div className="space-y-2 border-t border-navy-50 pt-4">
      <Actions
        pending={d.pending}
        error={d.error}
        sendLabel={mode === "visio" ? "Proposer la visio" : "Envoyer le message"}
        disabled={!body.trim()}
        onSend={() => d.run(() => decideVisio(item.id, "send", body), "sent")}
        onSkip={() => d.run(() => decideVisio(item.id, "dismiss"), "dismissed")}
      />
      <p className="text-[11.5px] text-navy-400">Part dans le fil Global : lu par le joueur et ses parents.</p>
      </div>
    </article>
  );
}

export function ReportCard({ item, sent = false }: { item: QueueReport; sent?: boolean }) {
  const [body, setBody] = useState(item.body);
  const d = useDecision();
  if (sent) return <Done p={item} text="rapport envoyé" />;
  if (d.state !== "open") return <Done p={item} text={d.state === "sent" ? "rapport envoyé" : "passé"} />;
  return (
    <article className="space-y-5 rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      <PlayerLine
        p={item}
        extra={`${item.monthLabel} · ${
          item.parentCount > 0
            ? `${item.parentCount} parent${item.parentCount > 1 ? "s" : ""} inscrit${item.parentCount > 1 ? "s" : ""}`
            : "aucun parent inscrit : invite un parent pour l'envoyer"
        }`}
      />
      {item.reason && (
        <Part label="À vérifier avant d'envoyer">
          <JarvisNote text={item.reason} />
        </Part>
      )}
      <Part label="Le rapport">
        <DraftEditor value={body} onChange={setBody} max={1500} rows={8} />
      </Part>
      <div className="border-t border-navy-50 pt-4">
      <Actions
        pending={d.pending}
        error={d.error}
        sendLabel="Envoyer aux parents"
        disabled={!body.trim() || item.parentCount === 0}
        onSend={() => d.run(() => approveReportDraft(item.draftId, body), "sent")}
        onSkip={() => d.run(() => dismissDraft(item.draftId), "dismissed")}
      />
      </div>
    </article>
  );
}

const POLE_TONE: Record<string, string> = {
  physique: "text-danger",
  basket: "text-accent",
  routine: "text-navy-600",
};

/** Toutes les propositions de programme, cochées d'office, appliquées d'un coup. */
export function ProgramBatch({ items }: { items: QueueProgram[] }) {
  const all = items.flatMap((p) => p.items.map((i) => ({ ...i, playerId: p.id })));
  const [checked, setChecked] = useState<Set<string>>(() => new Set(all.map((i) => i.key)));
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const remaining = all.filter((i) => !applied.has(i.key));
  const selected = remaining.filter((i) => checked.has(i.key));

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const apply = () =>
    start(async () => {
      setMessage(null);
      const r = await applyProgramChoices(
        selected.map((i) => ({
          kind: i.kind,
          playerId: i.playerId,
          pole: i.pole ?? undefined,
          sessionId: i.sessionId ?? undefined,
          weekdays: i.weekdays,
          assignmentIds: i.assignmentIds,
        }))
      );
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setApplied((prev) => new Set([...prev, ...selected.map((i) => i.key)]));
      setMessage({
        ok: (r.failed ?? []).length === 0,
        text: `${r.applied} appliquée${(r.applied ?? 0) > 1 ? "s" : ""}${
          r.skipped ? ` · ${r.skipped} déjà en place, rien ajouté` : ""
        }${
          (r.failed ?? []).length > 0 ? ` · ${r.failed!.length} refusée(s) : ${r.failed![0]}` : ""
        }`,
      });
    });

  if (remaining.length === 0) {
    return <p className="text-[13px] text-navy-500">Tout est appliqué.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-navy-100 rounded-2xl border border-navy-100 bg-white">
        {items.map((p) => {
          const rows = p.items.filter((i) => !applied.has(i.key));
          if (rows.length === 0) return null;
          return (
            <li key={p.id} className="px-4 py-3">
              <PlayerLine p={p} />
              <ul className="mt-2 space-y-1.5">
                {rows.map((i) => (
                  <li key={i.key}>
                    <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                      <input
                        type="checkbox"
                        checked={checked.has(i.key)}
                        onChange={() => toggle(i.key)}
                        className="mt-0.5 h-4 w-4 accent-navy-800"
                      />
                      <span className="min-w-0">
                        {i.kind === "replace" ? (
                          <span className="font-semibold text-navy-900">
                            Remplacer · <span className="text-danger line-through decoration-1">{i.pausedNames.join(", ")}</span>
                            {" → "}
                            <span className={i.pole ? POLE_TONE[i.pole] : ""}>{i.sessionName}</span>
                          </span>
                        ) : (
                          <span className={`font-semibold ${i.kind === "pause" ? "text-danger" : "text-navy-900"}`}>
                            {i.kind === "pause" ? "Mettre en pause · " : "Ajouter · "}
                            <span className={i.pole ? POLE_TONE[i.pole] : ""}>{i.sessionName}</span>
                          </span>
                        )}
                        {i.kind !== "pause" && <span className="text-navy-400"> · {weekdaysLabel(i.weekdays)}</span>}
                        <span className="block text-[12px] text-navy-400">{i.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={apply} loading={pending} disabled={selected.length === 0 || pending}>
          Appliquer la sélection ({selected.length})
        </Button>
        {message && (
          <span className={`text-[12.5px] font-semibold ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-navy-400">
        Les jours posés par défaut se changent ensuite dans la fiche du joueur, onglet Programme.
      </p>
    </div>
  );
}
