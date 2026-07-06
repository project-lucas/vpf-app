import { BottomNav } from "@/components/BottomNav";
import { GearIcon, HomeIcon, LibraryIcon, UsersIcon } from "@/components/icons";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      <BottomNav
        items={[
          { href: "/coach", label: "Dashboard", icon: <HomeIcon />, exact: true },
          { href: "/coach/joueurs", label: "Mes joueurs", icon: <UsersIcon /> },
          { href: "/coach/bibliotheque", label: "Bibliothèque", icon: <LibraryIcon /> },
          { href: "/coach/parametres", label: "Réglages", icon: <GearIcon /> },
        ]}
      />
    </div>
  );
}
