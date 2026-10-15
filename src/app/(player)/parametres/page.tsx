import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getConversationMessages } from "@/app/actions/messages";
import { LogoutButton } from "@/components/LogoutButton";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { PlayerInfoForm } from "@/components/settings/PlayerInfoForm";
import { RulesCard } from "@/components/settings/RulesCard";
import { SettingsSheet } from "@/components/settings/SettingsSheet";
import { ConversationPanel } from "@/components/messages/ConversationPanel";
import { getConversationChannels } from "@/lib/conversations";
import { channelId, parseChannelId } from "@/lib/channels";
import { Overline, Serif, DoubleRule, SectionHead } from "@/components/editorial/primitives";
import { BellIcon } from "@/components/icons";
import { MessageCircle } from "lucide-react";
import { parisNow, seasonLabel } from "@/lib/dates";
import { SEASON_START } from "@/lib/constants";

export const metadata = { title: "Profil — VPF" };
export const dynamic = "force-dynamic";

/** Abréviation d'écusson à partir du club (mot distinctif, hors préfixes courants). */
function clubTag(club: string | null | undefined): string | undefined {
  if (!club) return undefined;
  const skip = new Set(["as", "us", "es", "sc", "bc", "club", "basket", "de", "la", "le", "du"]);
  const word = club
    .split(/\s+/)
    .find((w) => !skip.has(w.toLowerCase()) && w.length > 1);
  return word ? word.toUpperCase().slice(0, 6) : undefined;
}

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const { canal } = await searchParams;
  // fil ouvert d'entrée (lien d'une notification), Global sinon
  const openChannel = channelId(parseChannelId(canal));
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const [{ data: profile }, { data: playerRow }, messages] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, notifications_enabled, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("players")
      .select(
        "category, position, club, season_goal, offer, coach:profiles!players_coach_id_fkey(first_name, last_name)"
      )
      .eq("id", user.id)
      .maybeSingle(),
    getConversationMessages(user.id, openChannel),
  ]);

  const coach = playerRow
    ? ((Array.isArray(playerRow.coach) ? playerRow.coach[0] : playerRow.coach) as {
        first_name: string;
        last_name: string;
      } | null)
    : null;

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase();

  // Ses fils (0048) : Global, son référent, ses coachs technique et physique
  // — jamais le fil Parents. Triés comme WhatsApp, le plus récent d'abord.
  const channels = await getConversationChannels(supabase, {
    playerId: user.id,
    viewerId: user.id,
    viewer: "player",
  });

  const metaParts = [
    playerRow?.position,
    playerRow?.club,
    coach ? `Coach ${coach.first_name?.[0] ?? ""}. ${coach.last_name}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* En-tête : écusson + surtitre licence + nom serif.
          Le contact du coach passe par la messagerie interne ci-dessous. */}
      <div className="flex items-center gap-4">
        <AvatarUploader
          avatarUrl={profile?.avatar_url ?? null}
          initials={initials}
          tag={clubTag(playerRow?.club)}
        />
        <div className="min-w-0 flex-1">
          <Overline>Profil · Licence {seasonLabel(parisNow().date, SEASON_START)}</Overline>
          <Serif className="mt-1 text-[32px] leading-[0.95]">
            {profile?.first_name}
            <br />
            {profile?.last_name}
          </Serif>
        </div>
      </div>

      {/* pr-* : la ligne passe sous les deux boutons flottants (engrenage +
          cloche, ancrés à 120px du haut) — sans cette réserve le texte se
          glisse dessous et devient illisible. */}
      {metaParts.length > 0 && (
        <p className="ed-meta mt-3 pr-28 text-[11px] leading-relaxed text-meta lg:pr-44">
          {metaParts.join(" — ")}
        </p>
      )}

      <DoubleRule className="mt-4" />

      {/* Messagerie : cœur de l'onglet — le fil direct avec le coach (et le
          staff VPF). Remplace l'ancien raccourci WhatsApp.
          Hauteur bornée au reste de l'écran : le fil défile dans sa boîte, la
          zone de saisie reste sous les yeux quel que soit l'historique. */}
      <section className="mt-6">
        <SectionHead icon={<MessageCircle size={13} />}>
          {channels.length > 1
            ? "Mes conversations"
            : coach
              ? `Conversation avec Coach ${coach.last_name}`
              : "Conversation avec ton coach"}
        </SectionHead>
        <ConversationPanel
          playerId={user.id}
          currentUserId={user.id}
          channels={channels}
          initialChannelKey={openChannel}
          startInChat={Boolean(canal)}
          initialMessages={messages}
          className="mt-4 h-[calc(100dvh-420px)] min-h-[320px] max-h-[640px]"
        />
      </section>

      {/* Tout le réglage du compte part dans le panneau flottant (icône
          engrenage, à gauche de la cloche) : la page reste une messagerie. */}
      <SettingsSheet>
        <section className="mt-4">
          <SectionHead>Ma fiche basket</SectionHead>
          <div className="mt-4">
            <PlayerInfoForm
              initial={{
                category: playerRow?.category ?? "",
                position: playerRow?.position ?? "",
                club: playerRow?.club ?? "",
                season_goal: playerRow?.season_goal ?? "",
              }}
            />
          </div>
        </section>

        <section className="mt-8">
          <SectionHead icon={<BellIcon size={13} />}>Notifications</SectionHead>
          <div className="mt-4">
            <NotificationsToggle enabled={profile?.notifications_enabled ?? true} />
          </div>
        </section>

        <section className="mt-8">
          <SectionHead>Mot de passe</SectionHead>
          <div className="mt-4">
            <PasswordForm />
          </div>
        </section>

        <RulesCard />

        <div className="mt-6">
          <LogoutButton />
        </div>
      </SettingsSheet>
    </>
  );
}
