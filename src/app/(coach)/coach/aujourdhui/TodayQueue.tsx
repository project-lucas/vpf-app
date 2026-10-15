"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, Sparkles } from "lucide-react";
import { runJarvisNow } from "@/app/actions/jarvis-queue";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { formatAgoFr } from "@/lib/dates";
import { REPORT_DAY } from "@/lib/jarvis-drafts";
import { ProgramBatch, ReportCard, ReviewCard, VisioCard } from "./QueueCards";
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
    { id: "messages", label: "Messages", count: data.messages.length },
    { id: "bilans", label: "Bilans", count: data.reviews.length },
    { id: "decrochage", label: "Décrochage", count: data.visios.length },
    { id: "programmes", label: "Programmes", count: data.programs.length },
    { id: "rapports", label: "Rapports parents", count: data.reports.length },
  ];
  const total = sections.reduce((s, x) => s + x.count, 0);
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

      {total > 0 && (
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
        {show("messages") && data.messages.length > 0 && (
          <Section title={`Messages en attente · ${data.messages.length}`} className="scroll-mt-20" >
            <ul id="messages" className="divide-y divide-navy-100 rounded-2xl border border-navy-100 bg-white">
              {data.messages.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-label="Non lu" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-navy-900">
                      {m.name}
                      {m.coach && <span className="font-normal text-navy-400"> · suivi par {m.coach}</span>}
                    </p>
                    {m.preview && <p className="truncate text-[12.5px] text-navy-500">{m.preview}</p>}
                  </div>
                  {m.at && <span className="shrink-0 text-[11.5px] text-navy-400">{formatAgoFr(m.at)}</span>}
                  <Link
                    href={m.href}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1 text-[12px] font-bold text-white"
                  >
                    <MessageCircle size={12} /> Répondre
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {show("bilans") && data.reviews.length > 0 && (
          <Section title={`Bilans à valider · ${data.reviews.length}`}>
            <div id="bilans" className="scroll-mt-20 space-y-3">
              {data.reviews.map((r) => (
                <ReviewCard key={r.reviewId} item={r} />
              ))}
            </div>
          </Section>
        )}

        {show("decrochage") && data.visios.length > 0 && (
          <Section title={`Décrochage : visio conseillée · ${data.visios.length}`}>
            <div id="decrochage" className="scroll-mt-20 space-y-3">
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
            <div id="rapports" className="scroll-mt-20 space-y-3">
              {data.reports.map((r) => (
                <ReportCard key={r.draftId} item={r} />
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
