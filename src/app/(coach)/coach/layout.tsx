import { BottomNav } from "@/components/BottomNav";
import { StaffMenu } from "@/components/coach/StaffMenu";
import { getNavRole } from "@/lib/auth";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { hasStaffUnread } from "@/lib/conversations";
import {
  CalendarIcon,
  HomeIcon,
  LibraryIcon,
  UsersIcon,
} from "@/components/icons";

/** Initiales d'un membre du staff pour le bouton du menu (« LP »). */
function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  const letters = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return letters || "•";
}

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();

  // Quatre onglets en bas : ce qu'on fait tous les jours. La messagerie vit
  // dans Joueurs (vue Messages, en premier) — un seul endroit pour les fils,
  // pas deux. C'est donc Joueurs qui porte la pastille de non-lu. Staff et
  // Réglages, plus rares, vivent dans le menu en haut à droite.
  const [role, hasUnreadMessages, { data: me }] = await Promise.all([
    getNavRole(),
    user ? hasStaffUnread(supabase, user.id) : Promise.resolve(false),
    user
      ? supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const isAdmin = role === "admin";

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {/* Bandeau : le menu du staff seul à droite, la page pose son propre
          titre dessous — aucune collision avec les actions de l'en-tête. */}
      <div className="flex justify-end px-4 pt-3">
        <StaffMenu initials={initialsOf(me?.first_name, me?.last_name)} isAdmin={isAdmin} />
      </div>
      <main className="px-4 pb-32 pt-1">{children}</main>
      <BottomNav
        messagesHref="/coach/joueurs"
        items={[
          { href: "/coach", label: "Accueil", icon: <HomeIcon />, exact: true },
          {
            href: "/coach/joueurs",
            label: "Joueurs",
            icon: <UsersIcon />,
            dot: hasUnreadMessages,
          },
          { href: "/coach/planning", label: "Planning", icon: <CalendarIcon /> },
          { href: "/coach/bibliotheque", label: "Séances", icon: <LibraryIcon /> },
        ]}
      />
    </div>
  );
}
