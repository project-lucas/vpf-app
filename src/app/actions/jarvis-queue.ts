"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthProfile, requireStaffProfile } from "@/lib/auth";
import { assignSession, removeAssignment, setReviewReply } from "@/app/actions/coach";
import { sendConversationMessage } from "@/app/actions/messages";
import { currentWeekStart } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";

/**
 * Les gestes de la file « Aujourd'hui » : valider, corriger ou passer ce que
 * Jarvis a préparé. Chaque envoi passe par l'action existante (réponse au
 * bilan, message du fil Global, affectation) : mêmes contrôles, même RLS,
 * même journal. Le brouillon est ensuite marqué (service_role) — la lecture
 * RLS du brouillon a déjà prouvé que l'appelant suit ce joueur.
 */

const QUEUE_PATH = "/coach/aujourdhui";

async function readDraft(draftId: string) {
  const guard = await requireStaffProfile();
  if (!guard.ok) return { guard, draft: null };
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("jarvis_drafts")
    .select("id, kind, player_id, review_id, status")
    .eq("id", draftId)
    .maybeSingle();
  return { guard, draft };
}

const ALREADY_DONE = "Déjà traité par quelqu'un d'autre.";

/**
 * Prend le brouillon AVANT d'envoyer : la mise à jour n'aboutit que s'il est
 * encore en attente. Deux admins, deux onglets ou un double-clic ne peuvent
 * donc pas envoyer deux fois le même rapport.
 */
async function claimDraft(draftId: string, userId: string, status: "sent" | "dismissed", body?: string) {
  const { data, error } = await createAdminClient()
    .from("jarvis_drafts")
    .update({
      status,
      decided_by: userId,
      decided_at: new Date().toISOString(),
      ...(body !== undefined ? { body } : {}),
    })
    .eq("id", draftId)
    .eq("status", "pending")
    .select("id");
  return !error && (data ?? []).length > 0;
}

/** L'envoi a échoué après la prise : le brouillon repasse en attente. */
async function releaseDraft(draftId: string) {
  await createAdminClient()
    .from("jarvis_drafts")
    .update({ status: "pending", decided_by: null, decided_at: null })
    .eq("id", draftId);
}

/** Valide la réponse à un bilan (éventuellement corrigée) : elle part au joueur. */
export async function approveReviewDraft(draftId: string, body: string): Promise<ActionResult> {
  const { guard, draft } = await readDraft(draftId);
  if (!guard.ok) return guard;
  if (!draft || draft.kind !== "review_reply" || !draft.review_id) return { ok: false, error: "Brouillon introuvable." };
  if (!body.trim()) return { ok: false, error: "La réponse est vide." };
  // un collègue a répondu à la main entre-temps : on n'écrase pas sa réponse
  const supabase = await createClient();
  const { data: review } = await supabase
    .from("weekly_reviews")
    .select("coach_reply")
    .eq("id", draft.review_id)
    .maybeSingle();
  if (review?.coach_reply?.trim()) {
    await claimDraft(draftId, guard.userId, "dismissed");
    return { ok: false, error: "Ce bilan a déjà reçu une réponse." };
  }
  if (!(await claimDraft(draftId, guard.userId, "sent", body.trim()))) return { ok: false, error: ALREADY_DONE };
  const result = await setReviewReply(draft.review_id, body);
  if (!result.ok) {
    await releaseDraft(draftId);
    return result;
  }
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

/** Envoie dans le fil Global un rapport aux parents (éventuellement corrigé). */
export async function approveReportDraft(draftId: string, body: string): Promise<ActionResult> {
  const { guard, draft } = await readDraft(draftId);
  if (!guard.ok) return guard;
  if (!draft || draft.kind !== "parent_report") {
    return { ok: false, error: "Brouillon introuvable." };
  }
  if (!body.trim()) return { ok: false, error: "Le rapport est vide." };
  if (!(await claimDraft(draftId, guard.userId, "sent", body.trim()))) return { ok: false, error: ALREADY_DONE };
  // le rapport du mois part dans le fil Parents (sans le joueur, 0048)
  const result = await sendConversationMessage(draft.player_id, body, "parents");
  if (!result.ok) {
    await releaseDraft(draftId);
    return result;
  }
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

/**
 * Décision sur la visio d'un joueur en décrochage, cette semaine : l'envoyer
 * (brouillon de Jarvis ou message type, éventuellement corrigé) ou la passer.
 * Fonctionne aussi sans brouillon (clé absente, lot en échec) : la décision
 * est enregistrée pour que le joueur quitte la file jusqu'à lundi.
 */
export async function decideVisio(
  playerId: string,
  decision: "send" | "dismiss",
  body = ""
): Promise<ActionResult> {
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;
  const supabase = await createClient();
  // la lecture RLS prouve que l'appelant suit ce joueur
  const { data: player } = await supabase.from("players").select("id").eq("id", playerId).maybeSingle();
  if (!player) return { ok: false, error: "Joueur introuvable." };
  if (decision === "send") {
    const result = await sendConversationMessage(playerId, body, "global");
    if (!result.ok) return result;
  }
  await createAdminClient()
    .from("jarvis_drafts")
    .upsert(
      {
        kind: "visio",
        player_id: playerId,
        period: currentWeekStart(),
        status: decision === "send" ? "sent" : "dismissed",
        decided_by: guard.userId,
        decided_at: new Date().toISOString(),
        ...(decision === "send" ? { body: body.trim() } : {}),
      },
      { onConflict: "kind,player_id,period" }
    );
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

const CHANNELS = new Set(["global", "referent", "technique", "physique", "parents"]);

/**
 * Répond à un message qui attend, depuis la file : avec le brouillon de
 * Jarvis (éventuellement corrigé) ou sans brouillon. L'envoi passe par
 * `sendConversationMessage` (RLS du fil, notifications, journal) ; le
 * brouillon est pris avant pour ne jamais partir deux fois.
 */
export async function replyToWaitingMessage(input: {
  playerId: string;
  channel: string;
  body: string;
  draftId: string | null;
}): Promise<ActionResult> {
  if (!UUID.test(input.playerId) || !CHANNELS.has(input.channel)) return { ok: false, error: "Fil invalide." };
  if (!input.body.trim()) return { ok: false, error: "La réponse est vide." };
  if (input.draftId) {
    const { guard, draft } = await readDraft(input.draftId);
    if (!guard.ok) return guard;
    if (!draft || draft.kind !== "message_reply" || draft.player_id !== input.playerId) {
      return { ok: false, error: "Brouillon introuvable." };
    }
    if (!(await claimDraft(input.draftId, guard.userId, "sent", input.body.trim()))) {
      return { ok: false, error: ALREADY_DONE };
    }
    const result = await sendConversationMessage(input.playerId, input.body, input.channel);
    if (!result.ok) {
      await releaseDraft(input.draftId);
      return result;
    }
  } else {
    const guard = await requireStaffProfile();
    if (!guard.ok) return guard;
    const result = await sendConversationMessage(input.playerId, input.body, input.channel);
    if (!result.ok) return result;
  }
  revalidatePath(QUEUE_PATH);
  revalidatePath("/coach");
  return { ok: true };
}

/**
 * « Pas besoin de répondre » (un merci, un pouce) : le message n'attend plus
 * personne — ni la file, ni la pastille, ni le garde-fou des 24 h. La
 * décision se pose sur le brouillon de ce message (créé s'il n'existe pas).
 */
export async function skipWaitingMessage(input: {
  playerId: string;
  messageId: string;
  channel: string;
}): Promise<ActionResult> {
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;
  if (!UUID.test(input.playerId) || !UUID.test(input.messageId) || !CHANNELS.has(input.channel)) {
    return { ok: false, error: "Message invalide." };
  }
  // la lecture RLS du message prouve que l'appelant suit ce fil
  const supabase = await createClient();
  const { data: message } = await supabase
    .from("conversation_messages")
    .select("id")
    .eq("id", input.messageId)
    .eq("player_id", input.playerId)
    .maybeSingle();
  if (!message) return { ok: false, error: "Message introuvable." };
  const { error } = await createAdminClient()
    .from("jarvis_drafts")
    .upsert(
      {
        kind: "message_reply",
        player_id: input.playerId,
        period: input.messageId,
        channel: input.channel,
        status: "dismissed",
        decided_by: guard.userId,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "kind,player_id,period" }
    );
  if (error) return { ok: false, error: "Impossible d'enregistrer la décision." };
  revalidatePath(QUEUE_PATH);
  revalidatePath("/coach");
  revalidatePath("/coach/joueurs");
  return { ok: true };
}

/** Valide le retour de Jarvis sur une feuille de match : il part dans le fil Global. */
export async function approveMatchDraft(draftId: string, body: string): Promise<ActionResult> {
  const { guard, draft } = await readDraft(draftId);
  if (!guard.ok) return guard;
  if (!draft || draft.kind !== "match_reply") return { ok: false, error: "Brouillon introuvable." };
  if (!body.trim()) return { ok: false, error: "Le message est vide." };
  if (!(await claimDraft(draftId, guard.userId, "sent", body.trim()))) return { ok: false, error: ALREADY_DONE };
  const result = await sendConversationMessage(draft.player_id, body, "global");
  if (!result.ok) {
    await releaseDraft(draftId);
    return result;
  }
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

type BulkKind = "review_reply" | "parent_report" | "message_reply" | "match_reply";

/**
 * « Tout valider » : envoie tels quels les brouillons choisis, un par un, par
 * les mêmes actions que la validation à l'unité (mêmes contrôles, même
 * journal). Un rapport sans parent inscrit n'est pas envoyé (personne ne le
 * lirait). Rend la liste de ce qui est parti.
 */
export async function approveDraftsInBulk(
  kind: BulkKind,
  draftIds: string[]
): Promise<ActionResult & { sent?: string[]; failed?: number }> {
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;
  const ids = draftIds.filter((id) => UUID.test(id)).slice(0, 200);
  if (ids.length === 0) return { ok: true, sent: [], failed: 0 };
  const supabase = await createClient();
  const { data: drafts } = await supabase
    .from("jarvis_drafts")
    .select("id, player_id, body, channel")
    .eq("kind", kind)
    .eq("status", "pending")
    .in("id", ids);
  let withParents: Set<string> | null = null;
  if (kind === "parent_report") {
    const { data: links } = await supabase
      .from("parent_links")
      .select("player_id")
      .in("player_id", (drafts ?? []).map((d) => d.player_id as string));
    withParents = new Set((links ?? []).map((l) => l.player_id as string));
  }
  const sent: string[] = [];
  let failed = 0;
  for (const d of drafts ?? []) {
    const body = (d.body as string).trim();
    if (!body || (withParents && !withParents.has(d.player_id as string))) continue;
    const r =
      kind === "review_reply"
        ? await approveReviewDraft(d.id as string, body)
        : kind === "parent_report"
          ? await approveReportDraft(d.id as string, body)
          : kind === "match_reply"
            ? await approveMatchDraft(d.id as string, body)
            : await replyToWaitingMessage({
                playerId: d.player_id as string,
                channel: d.channel as string,
                body,
                draftId: d.id as string,
              });
    if (r.ok) sent.push(d.id as string);
    else failed += 1;
  }
  revalidatePath(QUEUE_PATH);
  return { ok: true, sent, failed };
}

/** Passe un brouillon : il quitte la file, rien n'est envoyé. */
export async function dismissDraft(draftId: string): Promise<ActionResult> {
  const { guard, draft } = await readDraft(draftId);
  if (!guard.ok) return guard;
  if (!draft) return { ok: false, error: "Brouillon introuvable." };
  if (!(await claimDraft(draftId, guard.userId, "dismissed"))) return { ok: false, error: ALREADY_DONE };
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

export interface ProgramChoice {
  kind: "add" | "pause" | "replace";
  playerId: string;
  /** pôle de la séance ajoutée : sert à vérifier qu'il est toujours vide */
  pole?: "basket" | "physique" | "routine";
  sessionId?: string;
  weekdays?: number[];
  assignmentIds?: string[];
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Les séances actives du joueur (lecture RLS) : pôle et id de séance. */
async function activeSessions(playerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("session_assignments")
    .select("session_id, session:library_sessions!inner(pole)")
    .eq("player_id", playerId)
    .is("removed_at", null);
  return (data ?? []).map((a) => {
    const s = Array.isArray(a.session) ? a.session[0] : a.session;
    return { sessionId: a.session_id as string, pole: s?.pole as string | undefined };
  });
}

/**
 * Applique d'un coup les propositions de programme cochées, en revérifiant
 * chaque cas au moment du clic (la page a pu vieillir, un collègue a pu agir) :
 *  - « Ajouter » n'ajoute que si le pôle est TOUJOURS vide (technique,
 *    physique) ou si la séance n'est pas déjà là (routine) — jamais en double ;
 *  - « Remplacer » ajoute la routine de soin PUIS met en pause les séances qui
 *    chargent la zone : l'ancien et le nouveau ne coexistent pas ;
 *  - « Mettre en pause » retire les affectations (historique gardé).
 */
export async function applyProgramChoices(
  choices: ProgramChoice[]
): Promise<ActionResult & { applied?: number; skipped?: number; failed?: string[] }> {
  const guard = await requireStaffProfile();
  if (!guard.ok) return guard;
  const failed: string[] = [];
  let applied = 0;
  let skipped = 0;

  const pause = async (c: ProgramChoice) => {
    const ids = (c.assignmentIds ?? []).filter((id) => UUID.test(id));
    const results = await Promise.all(ids.map((id) => removeAssignment(id, c.playerId)));
    return results.find((r) => !r.ok);
  };

  for (const c of choices.slice(0, 500)) {
    if (!UUID.test(c.playerId)) continue;
    if ((c.kind === "add" || c.kind === "replace") && c.sessionId && UUID.test(c.sessionId)) {
      const current = await activeSessions(c.playerId);
      const already = current.some((s) => s.sessionId === c.sessionId);
      const poleTaken = c.pole !== "routine" && current.some((s) => s.pole === c.pole);
      if (already || (c.kind === "add" && poleTaken)) {
        skipped += 1;
        // déjà en place : pour un remplacement, il reste à mettre l'ancien en pause
        if (c.kind === "replace") await pause(c);
        continue;
      }
      const r = await assignSession(c.sessionId, [c.playerId], c.weekdays ?? []);
      if (!r.ok) {
        failed.push(r.error);
        continue;
      }
      if (c.kind === "replace") {
        const bad = await pause(c);
        if (bad && !bad.ok) failed.push(bad.error);
      }
      applied += 1;
    } else if (c.kind === "pause") {
      if ((c.assignmentIds ?? []).length === 0) continue;
      const bad = await pause(c);
      if (bad && !bad.ok) failed.push(bad.error);
      else applied += 1;
    }
  }
  revalidatePath(QUEUE_PATH);
  return failed.length > 0 && applied === 0
    ? { ok: false, error: failed[0] }
    : { ok: true, applied, skipped, failed };
}

/**
 * « Préparer maintenant » (admin) : un passage de Jarvis à la demande, sans
 * attendre le cron — bilans, décrochage, fiches mémoire ; les rapports du mois
 * écoulé seulement si `reports`.
 */
export async function runJarvisNow(
  reports = false
): Promise<ActionResult & { detail?: string; more?: boolean }> {
  const { profile } = await getAuthProfile();
  if (!profile || profile.role !== "admin") return { ok: false, error: "Réservé aux admins." };
  const { runJarvisWork } = await import("@/lib/jarvis-work");
  const result = await runJarvisWork({ budgetMs: 50_000, scanDropout: true, reports });
  revalidatePath(QUEUE_PATH);
  revalidatePath("/coach");
  if (!result.ok && result.error) return { ok: false, error: result.error };
  const p = result.prepared;
  const detail = `${p.messages} message(s) · ${p.reviews} bilan(s) · ${p.matches} match(s) · ${p.debriefs} debrief(s) · ${p.visios} visio(s) · ${p.memories} fiche(s) mémoire · ${p.reports} rapport(s)${
    result.failed > 0 ? ` · ${result.failed} en échec` : ""
  }`;
  return { ok: true, detail, more: result.more };
}
