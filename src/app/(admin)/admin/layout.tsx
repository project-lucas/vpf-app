import { BottomNav } from "@/components/BottomNav";
import {
  ArchiveIcon,
  GearIcon,
  HomeIcon,
  LibraryIcon,
  MailIcon,
  UsersIcon,
} from "@/components/icons";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      <BottomNav
        items={[
          { href: "/admin", label: "Dashboard", icon: <HomeIcon size={20} />, exact: true },
          { href: "/admin/coachs", label: "Coachs", icon: <UsersIcon size={20} /> },
          { href: "/admin/bibliotheque", label: "Biblio.", icon: <LibraryIcon size={20} /> },
          { href: "/admin/invitations", label: "Invitations", icon: <MailIcon size={20} /> },
          { href: "/admin/exclusion", label: "Exclusion", icon: <ArchiveIcon size={20} /> },
          { href: "/admin/parametres", label: "Réglages", icon: <GearIcon size={20} /> },
        ]}
      />
    </div>
  );
}
