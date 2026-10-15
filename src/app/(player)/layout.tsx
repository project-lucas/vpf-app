import { createClient, getCachedUser } from "@/lib/supabase/server";
import { daysBetween, parisNow } from "@/lib/dates";
import { canUseHygiene, toOffer } from "@/lib/offers";
import { hasFamilyUnread } from "@/lib/conversations";
import { CHECKIN_INTERVAL_DAYS } from "@/lib/constants";
import { getPlayerGates, type DueMatch, type DueReview } from "@/lib/player-gates";
import { BottomNav } from "@/components/BottomNav";
import { CheckinModal } from "@/components/CheckinModal";
import { PlayerGates } from "@/components/PlayerGates";
import { PushPrompt } from "@/components/PushPrompt";
import { InstallPrompt } from "@/components/InstallPrompt";
import { AnnouncementsBell } from "@/components/messages/AnnouncementsBell";
import { BallIcon, CalendarIcon, ChartIcon, HeartIcon, MessageIcon } from "@/components/icons";
import type { Announcement, CheckinQuestion } from "@/lib/types";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();

  // Hygiène : réservée à l'offre formation (lue avec le coach ci-dessous).
  let showHygiene = false;

  // pastille rouge sur l'onglet Messages : un message attend dans l'un des fils
  let hasUnreadMessages = false;

  let checkinQuestion: CheckinQuestion | null = null;
  let notificationsEnabled = false;
  let announcements: Announcement[] = [];
  let unreadAnnouncementIds: string[] = [];
  // les portes (0043) : bilan de la semaine, feuille de match — bloquantes
  let dueReview: DueReview | null = null;
  let dueMatch: DueMatch | null = null;

  if (user) {
    const [
      { data: lastCheckin },
      { data: profile },
      { data: playerRow },
      { data: announcementRows },
      { data: announcementReads },
      navUnread,
      gates,
    ] = await Promise.all([
      supabase
        .from("checkins")
        .select("question, created_at")
        .eq("player_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("profiles").select("notifications_enabled").eq("id", user.id).maybeSingle(),
      supabase.from("players").select("offer").eq("id", user.id).maybeSingle(),
      // annonces du club : la RLS filtre déjà selon l'offre du joueur
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("announcement_id").eq("user_id", user.id),
      // messagerie : du non-lu dans l'un de ses fils (0048)
      hasFamilyUnread(supabase, user.id, user.id),
      getPlayerGates(supabase, user.id),
    ]);
    dueReview = gates.review;
    dueMatch = gates.match;

    const offer = toOffer(playerRow?.offer);
    showHygiene = canUseHygiene(offer);
    hasUnreadMessages = navUnread;

    announcements = (announcementRows ?? []) as Announcement[];
    const readIds = new Set((announcementReads ?? []).map((r) => r.announcement_id));
    unreadAnnouncementIds = announcements.filter((a) => !readIds.has(a.id)).map((a) => a.id);

    // ?? true : aligné sur le défaut de la colonne (0001) et sur la page profil
    notificationsEnabled = profile?.notifications_enabled ?? true;

    // date Paris du dernier check-in : created_at est en UTC, sa date tronquée
    // ferait revenir le pop-up un jour trop tôt pour un check-in fait après minuit
    const daysSince = lastCheckin
      ? daysBetween(parisNow(new Date(lastCheckin.created_at)).date, parisNow().date)
      : Infinity;
    // une porte à la fois : le check-in attendra que le bilan ou la feuille
    // de match soient remplis
    if (daysSince >= CHECKIN_INTERVAL_DAYS && !dueReview && !dueMatch) {
      // alterne les deux questions de la V1
      checkinQuestion = lastCheckin?.question === "energy" ? "pain" : "energy";
    }
  }

  return (
    // Pleine largeur : le fond crème (matte) remplit tout l'écran et le contenu
    // s'étire avec la fenêtre. Le padding s'élargit sur grand écran pour respirer.
    // overflow-x-clip : coupe le débordement horizontal des animations décoratives
    // (halo de la frise, reflet du header) qui faisait clignoter une scrollbar,
    // sans créer de conteneur de défilement vertical (contrairement à hidden).
    <div className="ed min-h-dvh w-full overflow-x-clip bg-paper">
      <main className="w-full px-[22px] pb-32 pt-8 sm:px-8 lg:px-16 xl:px-24">{children}</main>
      {/* les portes (0043/0044), une à la fois : le bilan d'abord, puis la
          feuille de match ; le check-in seulement quand rien n'attend */}
      {dueReview || dueMatch ? (
        <PlayerGates review={dueReview} match={dueMatch} />
      ) : (
        checkinQuestion && <CheckinModal question={checkinQuestion} />
      )}
      <PushPrompt notificationsEnabled={notificationsEnabled} />
      <InstallPrompt />
      {/* Cloche des annonces du club — remplace l'ancien bouton WhatsApp :
          la messagerie interne (onglet Messages) porte désormais le contact coach. */}
      <AnnouncementsBell
        announcements={announcements}
        initialUnreadIds={unreadAnnouncementIds}
      />
      <BottomNav
        variant="editorial"
        messagesHref="/parametres"
        items={[
          // Hygiène : offre formation uniquement (src/lib/offers.ts) — un
          // joueur perf garde les 3 onglets du socle.
          ...(showHygiene
            ? [{ href: "/hygiene", label: "Hygiène", icon: <HeartIcon size={22} /> }]
            : []),
          { href: "/seances", label: "Programme", icon: <BallIcon size={22} /> },
          { href: "/planning", label: "Planning", icon: <CalendarIcon size={22} /> },
          { href: "/dashboard", label: "Dashboard", icon: <ChartIcon size={22} /> },
          // Messages = la messagerie (la page porte aussi le profil) : la
          // pastille prévient sans ouvrir l'onglet
          {
            href: "/parametres",
            label: "Messages",
            icon: <MessageIcon size={22} />,
            dot: hasUnreadMessages,
          },
        ]}
      />
    </div>
  );
}
