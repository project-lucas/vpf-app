import { BottomNav } from "@/components/BottomNav";
import { getNavRole } from "@/lib/auth";
import {
  CalendarIcon,
  GearIcon,
  HomeIcon,
  LibraryIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  // L'admin partage l'interface coach avec un onglet Staff (supervision) en plus
  const isAdmin = (await getNavRole()) === "admin";

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      <BottomNav
        items={[
          { href: "/coach", label: "Accueil", icon: <HomeIcon />, exact: true },
          { href: "/coach/planning", label: "Planning", icon: <CalendarIcon /> },
          { href: "/coach/joueurs", label: "Joueurs", icon: <UsersIcon /> },
          { href: "/coach/bibliotheque", label: "Séances", icon: <LibraryIcon /> },
          ...(isAdmin ? [{ href: "/coach/club", label: "Staff", icon: <TrophyIcon /> }] : []),
          { href: "/coach/parametres", label: "Réglages", icon: <GearIcon /> },
        ]}
      />
    </div>
  );
}
