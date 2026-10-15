"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlarmClock,
  BellRing,
  ChevronRight,
  HeartPulse,
  ListChecks,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  ShieldCheck,
  Sunrise,
} from "lucide-react";
import { runMorningBrief } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { formatDateFr } from "@/lib/dates";

/**
 * « À savoir sur Jarvis », vu d'Admin : ce que Jarvis fait aujourd'hui, en
 * phrases courtes et rangées par moment ; l'état de la clé ; et, en bas, le
 * brief du matin à relancer à la main (test, ou relance après un raté).
 * Fond blanc, pas de boîtes : une lecture d'un coup d'œil.
 */
export function MorningBriefPanel({
  configured,
  groups,
}: {
  configured: boolean;
  groups: { id: string; name: string; lastDate: string | null }[];
}) {
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(groupId: string, name: string) {
    setNotice(null);
    setRunningId(groupId);
    startTransition(async () => {
      const result = await runMorningBrief(groupId);
      setRunningId(null);
      setNotice(
        result.ok
          ? { tone: "ok", text: `Brief du ${name} écrit${result.detail ? ` · ${result.detail}` : ""}.` }
          : { tone: "error", text: result.error }
      );
    });
  }

  return (
    // le volet est crème : ce panneau pose son propre fond blanc, bord à bord
    <div className="-mx-5 -my-4 min-h-full bg-white px-6 py-6">
      <p className="flex items-center gap-2 text-[12.5px] font-semibold">
        <span
          aria-hidden
          className={`h-2 w-2 rounded-full ${configured ? "bg-success" : "bg-warning"}`}
        />
        <span className={configured ? "text-success" : "text-warning"}>
          {configured ? "Actif · clé API en place" : "Inactif · clé ANTHROPIC_API_KEY absente (local et Vercel)"}
        </span>
      </p>

      <p className="mt-3 text-[15px] leading-relaxed text-navy-800">
        Jarvis prépare le travail du staff. <strong className="text-navy-900">Rien ne part</strong> vers un
        joueur ou un parent sans ton clic.
      </p>

      <Link
        href="/coach/aujourdhui"
        className="mt-4 flex items-center justify-between rounded-2xl bg-navy-800 px-4 py-3 text-white hover:bg-navy-700"
      >
        <span className="flex items-center gap-2.5 text-[14px] font-bold">
          <ListChecks size={18} className="text-accent" />
          Ouvrir l&apos;onglet Jarvis
        </span>
        <ChevronRight size={18} />
      </Link>

      <div className="mt-7 space-y-6">
        {JARVIS_SUMMARY.map((section) => (
          <section key={section.title} className="flex gap-3.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              {section.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-extrabold text-navy-900">{section.title}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {section.lines.map((line) => (
                  <li key={line.text} className="flex items-baseline gap-2 text-[14px] leading-snug text-navy-700">
                    {line.when ? (
                      <span className="shrink-0 rounded-md bg-navy-800 px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums text-white">
                        {line.when}
                      </span>
                    ) : (
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    )}
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      {/* le brief du matin à la demande */}
      <div className="mt-8 border-t border-navy-100 pt-5">
        <h3 className="text-[13px] font-extrabold text-navy-900">Relancer le brief du matin</h3>
        {notice && (
          <p
            className={`mt-2 text-[13px] font-semibold ${notice.tone === "ok" ? "text-success" : "text-danger"}`}
          >
            {notice.text}
          </p>
        )}
        <ul className="mt-2 divide-y divide-navy-100">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="block text-[14px] font-semibold text-navy-900">{g.name}</span>
                <span className="block text-[12px] text-navy-400">
                  {g.lastDate ? `Dernier brief le ${formatDateFr(g.lastDate)}` : "Aucun brief écrit"}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!configured || isPending}
                loading={runningId === g.id}
                onClick={() => run(g.id, g.name)}
              >
                Écrire maintenant
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type SummaryLine = { text: string; when?: string };

const JARVIS_SUMMARY: { title: string; icon: React.ReactNode; lines: SummaryLine[] }[] = [
  {
    title: "Chaque matin",
    icon: <Sunrise size={18} />,
    lines: [
      { when: "6h", text: "Repère les joueurs qui décrochent." },
      { when: "7h", text: "Écrit le brief de chaque groupe." },
      { when: "Lun. 7h", text: "Debrief du week-end par groupe, notification au staff." },
    ],
  },
  {
    title: "Il prépare",
    icon: <RefreshCw size={18} />,
    lines: [
      { text: "La réponse à chaque message en attente." },
      { text: "La réponse à chaque bilan." },
      { text: "Un retour sur chaque feuille de match." },
      { text: "Une visio pour ceux qui décrochent." },
      { text: "La fiche mémoire de chaque joueur, chaque semaine." },
      { when: "Le 27", text: "Les rapports aux parents, envoyés le 28." },
    ],
  },
  {
    title: "Douleur",
    icon: <HeartPulse size={18} />,
    lines: [
      { text: "Chaque texte de Jarvis en tient compte en premier." },
      { text: "Douleur ≥ 6 ou blessure : message immédiat au joueur, alerte au coach." },
      { text: "Les séances qui chargent la zone sont remplacées en un clic." },
    ],
  },
  {
    title: "L'onglet Jarvis",
    icon: <ListChecks size={18} />,
    lines: [
      { text: "Tout ce qui attend, avec le temps estimé." },
      { text: "Valider, modifier ou passer — ou « Tout valider »." },
      { text: "« Pas besoin de répondre » pour un simple merci." },
    ],
  },
  {
    title: "Messagerie",
    icon: <MessagesSquare size={18} />,
    lines: [
      { text: "En attente = personne du staff n'a répondu." },
      { text: "« Vu par… » sous ton dernier message." },
      { text: "Réponses rapides : l'éclair dans la saisie." },
    ],
  },
  {
    title: "Alertes du staff",
    icon: <AlarmClock size={18} />,
    lines: [
      { when: "24 h", text: "Sans réponse : le coach du fil est prévenu." },
      { when: "48 h", text: "Toujours rien : les admins sont prévenus." },
    ],
  },
  {
    title: "Rappels aux joueurs",
    icon: <BellRing size={18} />,
    lines: [
      { when: "20h", text: "Séance du jour pas encore pointée." },
      { when: "Sam. 18h", text: "Feuille de match." },
      { when: "Dim. 18h", text: "Bilan de la semaine, bloquant tant qu'il manque." },
    ],
  },
  {
    title: "Parler à Jarvis",
    icon: <MessageCircle size={18} />,
    lines: [
      { text: "Depuis l'accueil (un groupe) ou la fiche (un joueur)." },
      { text: "Il agit seulement si tu le lui demandes." },
    ],
  },
  {
    title: "Garde-fous",
    icon: <ShieldCheck size={18} />,
    lines: [
      { text: "Rien ne part sans un clic du staff." },
      { text: "La fiche mémoire reste interne au staff." },
      { text: "Chaque geste est inscrit au journal." },
    ],
  },
];
