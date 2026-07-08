import { BottomNav } from "@/components/BottomNav";
import { CalendarIcon, GearIcon, HomeIcon, LibraryIcon, UsersIcon } from "@/components/icons";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      <BottomNav
        items={[
          { href: "/coach", label: "Dashboard", icon: <HomeIcon />, exact: true },
          { href: "/coach/planning", label: "Planning", icon: <CalendarIcon /> },
          { href: "/coach/joueurs", label: "Joueurs", icon: <UsersIcon /> },
          { href: "/coach/bibliotheque", label: "Bibliothèque", icon: <LibraryIcon /> },
          { href: "/coach/parametres", label: "Réglages", icon: <GearIcon /> },
        ]}
      />
    </div>
  );
}
