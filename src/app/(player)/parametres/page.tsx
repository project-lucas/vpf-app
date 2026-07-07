import { createClient, getCachedUser } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { AvatarUploader } from "@/components/settings/AvatarUploader";
import { NotificationsToggle } from "@/components/settings/NotificationsToggle";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { PlayerInfoForm } from "@/components/settings/PlayerInfoForm";
import { RulesCard } from "@/components/settings/RulesCard";
import { Overline, Serif, DoubleRule, SectionHead } from "@/components/editorial/primitives";
import { BellIcon } from "@/components/icons";

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

export default async function ProfilPage() {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const [{ data: profile }, { data: playerRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, notifications_enabled, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("players")
      .select(
        "category, position, club, season_goal, coach:profiles!players_coach_id_fkey(first_name, last_name, whatsapp_number)"
      )
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const coach = playerRow
    ? ((Array.isArray(playerRow.coach) ? playerRow.coach[0] : playerRow.coach) as {
        first_name: string;
        last_name: string;
        whatsapp_number: string;
      } | null)
    : null;

  const initials =
    `${profile?.first_name?.[0] ?? ""}${profile?.last_name?.[0] ?? ""}`.toUpperCase();

  const metaParts = [
    playerRow?.position,
    playerRow?.club,
    coach ? `Coach ${coach.first_name?.[0] ?? ""}. ${coach.last_name}` : null,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* En-tête : écusson + surtitre licence + nom serif */}
      <div className="flex items-center gap-4">
        <AvatarUploader
          avatarUrl={profile?.avatar_url ?? null}
          initials={initials}
          tag={clubTag(playerRow?.club)}
        />
        <div className="min-w-0">
          <Overline>Profil · Licence 25/26</Overline>
          <Serif className="mt-1 text-[32px] leading-[0.95]">
            {profile?.first_name}
            <br />
            {profile?.last_name}
          </Serif>
        </div>
      </div>

      {metaParts.length > 0 && (
        <p className="ed-meta mt-3 text-[11px] leading-relaxed text-meta">
          {metaParts.join(" — ")}
        </p>
      )}

      <DoubleRule className="mt-4" />

      {/* Ma fiche basket */}
      <section className="mt-6">
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

      {/* Notifications */}
      <section className="mt-8">
        <SectionHead icon={<BellIcon size={13} />}>Notifications</SectionHead>
        <div className="mt-4">
          <NotificationsToggle enabled={profile?.notifications_enabled ?? true} />
        </div>
      </section>

      {/* Mot de passe */}
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
    </>
  );
}
