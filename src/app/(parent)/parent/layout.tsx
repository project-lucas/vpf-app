import { MessageCircle } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { canUseHygiene } from "@/lib/offers";
import { BottomNav } from "@/components/BottomNav";
import { getStaffUnreadPlayerIds } from "@/lib/conversations";
import { PushPrompt } from "@/components/PushPrompt";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarIcon, GearIcon, HeartIcon, HomeIcon } from "@/components/icons";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const child = await getParentChild();
  // Hygiène : visible seulement si l'enfant est en offre formation
  const showHygiene = child !== null && canUseHygiene(child.offer);

  let notificationsEnabled = true;
  // pastille rouge sur l'onglet Messages : un mot du coach ne doit pas attendre
  // qu'on pense à ouvrir le fil
  let hasUnreadMessages = false;
  const user = await getCachedUser();
  if (user) {
    const supabase = await createClient();
    const [{ data: profile }, unread] = await Promise.all([
      supabase.from("profiles").select("notifications_enabled").eq("id", user.id).maybeSingle(),
      child
        ? getStaffUnreadPlayerIds(supabase, user.id, [child.playerId])
        : Promise.resolve(new Set<string>()),
    ]);
    notificationsEnabled = profile?.notifications_enabled ?? true;
    hasUnreadMessages = unread.size > 0;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      {/* les push (messages du coach) valent aussi pour les parents */}
      <PushPrompt notificationsEnabled={notificationsEnabled} />
      <InstallPrompt />
      <BottomNav
        messagesHref="/parent/messages"
        items={[
          { href: "/parent", label: "Suivi", icon: <HomeIcon />, exact: true },
          { href: "/parent/planning", label: "Planning", icon: <CalendarIcon /> },
          {
            href: "/parent/messages",
            label: "Messages",
            icon: <MessageCircle size={22} />,
            dot: hasUnreadMessages,
          },
          ...(showHygiene
            ? [{ href: "/parent/hygiene", label: "Hygiène", icon: <HeartIcon /> }]
            : []),
          { href: "/parent/profil", label: "Profil", icon: <GearIcon /> },
        ]}
      />
    </div>
  );
}
