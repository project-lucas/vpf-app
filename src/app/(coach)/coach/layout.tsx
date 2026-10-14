import { MessagesSquare, Settings } from "lucide-react";
import { BottomNav, type NavItem } from "@/components/BottomNav";
import { StaffMenu } from "@/components/coach/StaffMenu";
import { StaffSidebar } from "@/components/coach/StaffSidebar";
import { StaffMain } from "@/components/coach/StaffMain";
import { JarvisLauncher } from "@/components/coach/JarvisLauncher";
import { isMorningBriefConfigured } from "@/lib/briefs";
import { getNavRole } from "@/lib/auth";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { hasStaffUnread } from "@/lib/conversations";
import { CalendarIcon, HomeIcon, LibraryIcon, ShieldIcon, UsersIcon } from "@/components/icons";

/** Initiales d'un membre du staff pour le bouton du menu (« LP »). */
function initialsOf(first: string | null | undefined, last: string | null | undefined): string {
  const letters = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return letters || "•";
}

/**
 * Le gabarit du staff, en deux versions selon l'écran.
 *
 * Sur téléphone : quatre onglets en bas (cinq pour un admin), le menu aux
 * initiales en haut à droite, une colonne. Sur ordinateur (≥ lg) : une barre
 * latérale qui porte les mêmes onglets, les entrées du menu et l'utilisateur,
 * et un contenu large (jusqu'à 1280 px) — l'accueil en vue tableau en a
 * besoin, les autres pages s'y étirent sans se réinventer. La messagerie vit
 * dans Joueurs, qui porte la pastille de non-lu dans les deux versions.
 */
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();

  const [role, hasUnreadMessages, { data: me }] = await Promise.all([
    getNavRole(),
    user ? hasStaffUnread(supabase, user.id) : Promise.resolve(false),
    user
      ? supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const isAdmin = role === "admin";

  const items: NavItem[] = [
    { href: "/coach", label: "Accueil", icon: <HomeIcon />, exact: true },
    { href: "/coach/joueurs", label: "Joueurs", icon: <UsersIcon />, dot: hasUnreadMessages },
    { href: "/coach/planning", label: "Planning", icon: <CalendarIcon /> },
    { href: "/coach/bibliotheque", label: "Séances", icon: <LibraryIcon /> },
    ...(isAdmin ? [{ href: "/coach/admin", label: "Admin", icon: <ShieldIcon /> }] : []),
  ];
  const secondary = [
    ...(isAdmin
      ? [{ href: "/coach/messages", label: "Relais messages", icon: <MessagesSquare /> }]
      : []),
    { href: "/coach/parametres", label: "Réglages", icon: <Settings /> },
  ];

  return (
    <div className="staff relative min-h-dvh bg-cream lg:flex">
      <JarvisLauncher configured={isMorningBriefConfigured()} />
      <div className="hidden lg:block">
        <StaffSidebar
          items={items}
          secondary={secondary}
          initials={initialsOf(me?.first_name, me?.last_name)}
          name={me?.first_name || "Staff"}
          roleLabel={isAdmin ? "Admin" : "Coach"}
          messagesHref="/coach/joueurs"
        />
      </div>

      <div className="min-w-0 flex-1">
        {/* téléphone : le menu aux initiales, seul à droite */}
        <div className="flex justify-end px-4 pt-3 lg:hidden">
          <StaffMenu initials={initialsOf(me?.first_name, me?.last_name)} isAdmin={isAdmin} />
        </div>
        <StaffMain>
          {children}
        </StaffMain>
      </div>

      <div className="lg:hidden">
        <BottomNav messagesHref="/coach/joueurs" items={items} />
      </div>
    </div>
  );
}
