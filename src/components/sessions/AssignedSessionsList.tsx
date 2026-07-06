import { createClient } from "@/lib/supabase/server";
import { Overline, DisplayTitle, DoubleRule } from "@/components/editorial/primitives";
import { SessionsPoleTabs } from "./SessionsPoleTabs";
import type { SessionAssignmentWithSession, SessionPole } from "@/lib/types";

/**
 * "Mes séances" : les séances que le coach a rendues visibles pour le joueur,
 * filtrées par 3 onglets (Physique / Technique / Routine).
 */
export async function AssignedSessionsList() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: assignments }, { data: notes }, { data: playerRow }] = await Promise.all([
    supabase
      .from("session_assignments")
      .select("*, session:library_sessions!inner(*), completion:session_completions(*)")
      .eq("player_id", user.id)
      .is("removed_at", null)
      .order("order_index"),
    supabase.from("visible_notes").select("pole, content").eq("player_id", user.id),
    supabase
      .from("players")
      .select("coach:profiles!players_coach_id_fkey(first_name, last_name)")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const coach = playerRow
    ? ((Array.isArray(playerRow.coach) ? playerRow.coach[0] : playerRow.coach) as {
        first_name: string;
        last_name: string;
      } | null)
    : null;
  const surtitle = coach
    ? `Programme · Coach ${coach.first_name?.[0] ?? ""}. ${coach.last_name}`
    : "Programme";

  const list: SessionAssignmentWithSession[] = (assignments ?? []).map((a) => ({
    ...a,
    session: Array.isArray(a.session) ? a.session[0] : a.session,
    completion: Array.isArray(a.completion) ? (a.completion[0] ?? null) : a.completion,
  }));

  return (
    <>
      <Overline>{surtitle}</Overline>
      <DisplayTitle className="mt-2 text-[42px]">Mes Séances</DisplayTitle>
      <DoubleRule className="mt-3" />

      {list.length === 0 ? (
        <div className="mt-8 rounded-md border-2 border-ink bg-card px-5 py-10 text-center">
          <p className="ed-display text-[24px] text-ink">Aucune séance</p>
          <p className="ed-meta mt-2 text-[10px] leading-relaxed text-meta">
            Ton coach prépare ton programme — il apparaîtra ici.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <SessionsPoleTabs
            list={list}
            notes={(notes ?? []) as { pole: SessionPole; content: string }[]}
          />
        </div>
      )}
    </>
  );
}
