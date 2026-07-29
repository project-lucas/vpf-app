import { MessageCircle } from "lucide-react";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getParentChild } from "@/lib/parent-data";
import { canUseHygiene } from "@/lib/offers";
import { BottomNav } from "@/components/BottomNav";
import { PushPrompt } from "@/components/PushPrompt";
import { InstallPrompt } from "@/components/InstallPrompt";
import { CalendarIcon, GearIcon, HeartIcon, HomeIcon } from "@/components/icons";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const child = await getParentChild();
  // Hygiène : visible seulement si l'enfant est en offre formation
  const showHygiene = child !== null && canUseHygiene(child.offer);

  let notificationsEnabled = true;
  const user = await getCachedUser();
  if (user) {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("notifications_enabled")
      .eq("id", user.id)
      .maybeSingle();
    notificationsEnabled = profile?.notifications_enabled ?? true;
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="px-4 pb-32 pt-6">{children}</main>
      {/* les push (messages du coach) valent aussi pour les parents */}
      <PushPrompt notificationsEnabled={notificationsEnabled} />
      <InstallPrompt />
      <BottomNav
        items={[
          { href: "/parent", label: "Suivi", icon: <HomeIcon />, exact: true },
          { href: "/parent/planning", label: "Planning", icon: <CalendarIcon /> },
          { href: "/parent/messages", label: "Messages", icon: <MessageCircle size={22} /> },
          ...(showHygiene
            ? [{ href: "/parent/hygiene", label: "Hygiène", icon: <HeartIcon /> }]
            : []),
          { href: "/parent/profil", label: "Profil", icon: <GearIcon /> },
        ]}
      />
    </div>
  );
}
