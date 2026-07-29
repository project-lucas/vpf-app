import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { formatDateFr, parisNow } from "@/lib/dates";
import { canUseHygiene, toOffer } from "@/lib/offers";
import { computeHygieneAverages } from "@/lib/hygiene";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon } from "@/components/icons";
import { Play } from "lucide-react";
import { DoubleRule, Overline, SectionHead, Serif } from "@/components/editorial/primitives";
import { HygieneForm } from "@/components/hygiene/HygieneForm";
import { HygieneRadar } from "@/components/hygiene/HygieneRadar";
import type { HygieneLog, HygieneVideo } from "@/lib/types";

export const metadata = { title: "Hygiène — VPF" };
export const dynamic = "force-dynamic";

export default async function HygienePage() {
  // écran de l'offre formation : masquer l'onglet ne suffit pas, l'URL reste
  // tapable — pour un joueur perf, la page n'existe pas.
  const user = await getCachedUser();
  const supabase = await createClient();

  // offre et historique en une seule salve : la RLS ne renvoie de toute façon
  // que les lignes du joueur connecté, et l'offre décide juste de l'affichage.
  const [{ data: playerRow }, { data }, { data: videoRows }] = await Promise.all([
    supabase.from("players").select("offer").eq("id", user!.id).maybeSingle(),
    supabase
      .from("hygiene_logs")
      .select("*")
      .eq("player_id", user!.id)
      .order("log_date", { ascending: false }),
    // vidéos éducatives activées par le coach : la RLS ne renvoie au joueur
    // que celles qui lui ont été assignées
    supabase.from("hygiene_videos").select("*").order("category").order("title"),
  ]);
  if (!canUseHygiene(toOffer(playerRow?.offer))) notFound();

  const videos = (videoRows ?? []) as HygieneVideo[];

  const today = parisNow().date;

  const logs = (data ?? []) as HygieneLog[];
  const todayLog = logs.find((log) => log.log_date === today) ?? null;
  const averages = computeHygieneAverages(logs);

  return (
    <>
      <Overline>Hygiène de vie</Overline>
      <Serif className="mt-1 text-[32px] leading-[0.95]">
        Sommeil,
        <br />
        hydratation
        <br />
        &amp; nutrition
      </Serif>
      <p className="ed-meta mt-3 text-[11px] text-meta">
        Une note par jour — le reste se construit tout seul.
      </p>

      <DoubleRule className="mt-4" />

      {/* Vidéos éducatives envoyées par le coach — n'apparaissent que si au
          moins une est activée pour ce joueur */}
      {videos.length > 0 && (
        <>
          <SectionHead className="mb-4 mt-7" icon={<Play size={13} />}>
            À regarder — envoyé par ton coach
          </SectionHead>
          <div className="space-y-3">
            {videos.map((v) => (
              <a
                key={v.id}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border-2 border-ink bg-card px-4 py-3 transition-transform hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {v.category && <p className="ed-overline text-[9px]">{v.category}</p>}
                    <p className="ed-value mt-0.5 text-sm text-ink">{v.title}</p>
                    {v.description && (
                      <p className="mt-1 text-xs leading-relaxed text-meta">{v.description}</p>
                    )}
                  </div>
                  <span
                    aria-hidden
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink text-paper"
                  >
                    <Play size={16} />
                  </span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      <SectionHead className="mb-4 mt-7">Ma journée</SectionHead>
      <HygieneForm date={today} dateLabel={formatDateFr(today)} initial={todayLog} />

      <SectionHead className="mb-4 mt-8">Mes moyennes</SectionHead>
      {averages.days === 0 ? (
        <EmptyState icon={<HeartIcon size={28} />}>
          <p className="ed-value text-base text-ink">Ton radar attend ta première note.</p>
          <p className="mt-1 font-body text-sm text-meta">
            Note ta journée juste au-dessus : dès ce soir, ta moyenne d&apos;hygiène de vie
            se dessine ici.
          </p>
        </EmptyState>
      ) : (
        <HygieneRadar averages={averages} />
      )}
    </>
  );
}
