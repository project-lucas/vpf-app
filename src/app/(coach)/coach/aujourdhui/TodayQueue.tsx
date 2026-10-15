"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { runJarvisNow } from "@/app/actions/jarvis-queue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { REPORT_DAY } from "@/lib/jarvis-drafts";
import { ProgramBatch, ReportCard, ReviewCard, VisioCard } from "./QueueCards";
import { BulkApprove, DebriefPanel, MatchCard, MessageCard } from "./ReplyCards";
import type { QueueData } from "./types";

/**
 * La file « Aujourd'hui » : une seule liste pour tout le périmètre, dans
 * l'ordre d'urgence — messages qui attendent, bilans à valider, joueurs qui
 * décrochent, programmes à compléter, rapports du mois aux parents. Chaque
 * bloc dit combien il reste ; la tête dit combien de minutes ça représente.
 */
export function TodayQueue({
  data,
  minutes,
  isAdmin,
  mineOnly,
  share,
  configured,
  reportMonthLabel,
  initialFilter = null,
}: {
  /** section ouverte d'entrée (`?section=rapports` depuis l'accueil) */
  initialFilter?: string | null;
  data: QueueData;
  minutes: number;
  isAdmin: boolean;
  mineOnly: boolean;
  share: [string, number][];
  configured: boolean;
  reportMonthLabel: string;
}) {
  const sections = [
    { id: "debrief", label: "Debrief du week-end", count: data.debriefs.length },
    { id: "messages", label: "Messages", count: data.messages.length },
    { id: "matchs", label: "Matchs", count: data.matches.length },
    { id: "bilans", label: "Bilans", count: data.reviews.length },
    { id: "decrochage", label: "Décrochage", count: data.visios.length },
    { id: "programmes", label: "Programmes", count: data.programs.length },
    { id: "rapports", label: "Rapports parents", count: data.reports.length },
  ];
  // le debrief se lit, il ne se traite pas : il ne compte pas dans les actions
  const total = sections.reduce((s, x) => s + (x.id === "debrief" ? 0 : x.count), 0);
  // brouillons envoyés d'un coup par « Tout valider »
  const [bulkSent, setBulkSent] = useState<Set<string>>(new Set());
  const markSent = (ids: string[]) => setBulkSent((prev) => new Set([...prev, ...ids]));
  const open = (id: string | null | undefined) => !!id && !bulkSent.has(id);
  const messageDrafts = data.messages.map((m) => m.draft?.id).filter(open) as string[];
  const matchDrafts = data.matches.map((m) => m.draft.id).filter(open);
  const reviewDrafts = data.reviews.map((r) => r.draft?.id).filter(open) as string[];
  const reportDrafts = data.reports.filter((r) => r.parentCount > 0).map((r) => r.draftId).filter(open);
  // une section à la fois quand on filtre ; null = tout
  const [picked, setFilter] = useState<string | null>(initialFilter);
  // une section vidée (tout validé) rend la main à « Tout »
  // (sauf Rapports : vide, on y montre de quoi les préparer)
  const filter =
    picked === "rapports" || sections.some((s) => s.id === picked && s.count > 0) ? picked : null;
  const show = (id: string) => filter === null || filter === id;

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeader
        title="Jarvis"
        subtitle={
          total === 0
            ? "Aujourd'hui · rien n'attend. Jarvis prépare la suite au fil de la journée."
            : `Aujourd'hui · ${total} action${total > 1 ? "s" : ""} · ~${minutes} min`
        }
        action={isAdmin ? <JarvisNowButton configured={configured} /> : undefined}
      />

      {isAdmin && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <Link
            href="/coach/aujourdhui"
            className={`rounded-full px-3 py-1 font-semibold ${!mineOnly ? "bg-navy-800 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100"}`}
          >
            Tout le club
          </Link>
          <Link
            href="/coach/aujourdhui?vue=moi"
            className={`rounded-full px-3 py-1 font-semibold ${mineOnly ? "bg-navy-800 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100"}`}
          >
            Ma part
          </Link>
          {share.length > 0 && (
            <span className="text-navy-400">
              {share.map(([name, n]) => `${name} ${n}`).join(" · ")}
            </span>
          )}
        </div>
      )}

      {(total > 0 || data.debriefs.length > 0) && (
        <div role="tablist" aria-label="Filtrer la file" className="mb-6 flex flex-wrap gap-1.5">
          {[{ id: null, label: "Tout", count: total }, ...sections.filter((s) => s.count > 0)].map((s) => {
            const active = filter === s.id;
            return (
              <button
                key={s.id ?? "tout"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(s.id)}
                className={`rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? "bg-navy-800 text-white"
                    : "bg-white text-navy-700 ring-1 ring-navy-100 hover:ring-navy-300"
                }`}
              >
                {s.label} <span className={active ? "text-white/70" : "text-accent"}>{s.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-8">
        {show("debrief") && data.debriefs.length > 0 && (
          <Section title="Debrief du week-end">
            <div id="debrief" className="scroll-mt-20">
              <DebriefPanel debriefs={data.debriefs} />
            </div>
          </Section>
        )}

        {show("messages") && data.messages.length > 0 && (
          <Section title={`Messages en attente · ${data.messages.length}`}>
            <div id="messages" className="scroll-mt-20 space-y-4">
              <BulkApprove kind="message_reply" draftIds={messageDrafts} label="réponses" onSent={markSent} />
              {data.messages.map((m) => (
                <MessageCard key={`${m.id}-${m.channel}`} item={m} sent={!!m.draft && bulkSent.has(m.draft.id)} />
              ))}
            </div>
          </Section>
        )}

        {show("matchs") && data.matches.length > 0 && (
          <Section title={`Retours de match · ${data.matches.length}`}>
            <div id="matchs" className="scroll-mt-20 space-y-4">
              <BulkApprove kind="match_reply" draftIds={matchDrafts} label="retours" onSent={markSent} />
              {data.matches.map((m) => (
                <MatchCard key={m.draft.id} item={m} sent={bulkSent.has(m.draft.id)} />
              ))}
            </div>
          </Section>
        )}

        {show("bilans") && data.reviews.length > 0 && (
          <Section title={`Bilans à valider · ${data.reviews.length}`}>
            <div id="bilans" className="scroll-mt-20 space-y-4">
              <BulkApprove kind="review_reply" draftIds={reviewDrafts} label="réponses" onSent={markSent} />
              {data.reviews.map((r) => (
                <ReviewCard key={r.reviewId} item={r} sent={!!r.draft && bulkSent.has(r.draft.id)} />
              ))}
            </div>
          </Section>
        )}

        {show("decrochage") && data.visios.length > 0 && (
          <Section title={`Décrochage : visio conseillée · ${data.visios.length}`}>
            <div id="decrochage" className="scroll-mt-20 space-y-4">
              {data.visios.map((v) => (
                <VisioCard key={v.id} item={v} />
              ))}
            </div>
          </Section>
        )}

        {show("programmes") && data.programs.length > 0 && (
          <Section title={`Programmes à compléter · ${data.programs.length}`}>
            <div id="programmes" className="scroll-mt-20">
              <ProgramBatch items={data.programs} />
            </div>
          </Section>
        )}

        {show("rapports") && data.reports.length > 0 && (
          <Section title={`Rapports aux parents · ${data.reports.length}`}>
            <div id="rapports" className="scroll-mt-20 space-y-4">
              <BulkApprove kind="parent_report" draftIds={reportDrafts} label="rapports" onSent={markSent} />
              {data.reports.map((r) => (
                <ReportCard key={r.draftId} item={r} sent={bulkSent.has(r.draftId)} />
              ))}
            </div>
          </Section>
        )}

        {isAdmin && show("rapports") && data.reports.length === 0 && (
          <ReportsNowButton configured={configured} monthLabel={reportMonthLabel} />
        )}
      </div>
    </div>
  );
}

/** Lance un passage de Jarvis sans attendre le cron (bilans, décrochage, fiches mémoire). */
function JarvisNowButton({ configured }: { configured: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={!configured || pending}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await runJarvisNow(false);
            setNote(r.ok ? `${r.detail}${r.more ? " · la suite au prochain passage" : ""}` : r.error);
          })
        }
      >
        <Sparkles size={14} className="mr-1.5 inline text-accent" />
        <span className="whitespace-nowrap">
          Préparer<span className="hidden sm:inline"> maintenant</span>
        </span>
      </Button>
      {note && <span className="max-w-[260px] text-right text-[11.5px] text-navy-400">{note}</span>}
    </div>
  );
}

function ReportsNowButton({ configured, monthLabel }: { configured: boolean; monthLabel: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Section title="Rapports aux parents">
      <p className="mb-2 text-[13px] text-navy-500">
        Ils partent le {REPORT_DAY} de chaque mois ; Jarvis les prépare la veille. Pour {monthLabel}, tu peux
        les lancer dès maintenant.
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={!configured || pending}
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await runJarvisNow(true);
            setNote(r.ok ? `${r.detail}${r.more ? " · la suite au prochain passage" : ""}` : r.error);
          })
        }
      >
        Préparer les rapports de {monthLabel}
      </Button>
      {note && <p className="mt-1 text-[11.5px] text-navy-400">{note}</p>}
    </Section>
  );
}
