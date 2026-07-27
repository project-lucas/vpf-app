import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { formatDateFr, parisNow } from "@/lib/dates";
import { canUseHygiene, toOffer } from "@/lib/offers";
import { computeHygieneAverages } from "@/lib/hygiene";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeartIcon } from "@/components/icons";
import { DoubleRule, Overline, SectionHead, Serif } from "@/components/editorial/primitives";
import { HygieneForm } from "@/components/hygiene/HygieneForm";
import { HygieneRadar } from "@/components/hygiene/HygieneRadar";
import type { HygieneLog } from "@/lib/types";

export const metadata = { title: "Hygiène — VPF" };
export const dynamic = "force-dynamic";

export default async function HygienePage() {
  // écran de l'offre formation : masquer l'onglet ne suffit pas, l'URL reste
  // tapable — pour un joueur perf, la page n'existe pas.
  const user = await getCachedUser();
  const supabase = await createClient();

  // offre et historique en une seule salve : la RLS ne renvoie de toute façon
  // que les lignes du joueur connecté, et l'offre décide juste de l'affichage.
  const [{ data: playerRow }, { data }] = await Promise.all([
    supabase.from("players").select("offer").eq("id", user!.id).maybeSingle(),
    supabase
      .from("hygiene_logs")
      .select("*")
      .eq("player_id", user!.id)
      .order("log_date", { ascending: false }),
  ]);
  if (!canUseHygiene(toOffer(playerRow?.offer))) notFound();

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
