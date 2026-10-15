import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAuthProfile } from "@/lib/auth";
import { getConversationChannels, getMyPlayerIds, getStaffInbox } from "@/lib/conversations";
import { CHANNEL_NAMES, channelId, parseChannelId } from "@/lib/channels";
import { getConversationMessages } from "@/app/actions/messages";
import { MessageThread } from "@/components/messages/MessageThread";
import { PlayerAvatar } from "@/components/coach/PlayerAvatar";

export const metadata = { title: "Messages — VPF" };
export const dynamic = "force-dynamic";

/** « 14:32 » aujourd'hui, « Hier », sinon « 13/10 ». */
function listTime(iso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
  const day = fmt(new Date(iso));
  if (day === fmt(new Date())) {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  }
  if (day === fmt(new Date(Date.now() - 86_400_000))) return "Hier";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
}

/**
 * La boîte de réception du staff, façon WhatsApp (0048) : toutes MES
 * discussions, tous joueurs confondus — Global et Parents de mes joueurs, et
 * les fils dont je tiens le rôle (référent, technique, physique) — de la plus
 * récente à la plus ancienne. À gauche la liste, à droite la discussion
 * ouverte (`?joueur=&canal=`) ; sur téléphone, l'une puis l'autre.
 *
 * Périmètre : mes joueurs (référés + groupes dont je suis staff) ; tout le
 * club pour un admin.
 */
export default async function CoachMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ joueur?: string; canal?: string }>;
}) {
  const { profile } = await getAuthProfile();
  if (!profile || (profile.role !== "coach" && profile.role !== "admin")) redirect("/coach");
  const isAdmin = profile.role === "admin";
  const { joueur, canal } = await searchParams;
  const supabase = await createClient();

  const scope = isAdmin
    ? ((await supabase.from("players").select("id").eq("status", "active")).data ?? []).map((p) => p.id as string)
    : await getMyPlayerIds(supabase, profile.id);
  const threads = await getStaffInbox(supabase, profile.id, isAdmin, scope);
  const unreadCount = threads.filter((t) => t.hasUnread).length;

  const open = joueur ? channelId(parseChannelId(canal)) : null;
  const [messages, channels, playerProfile] = joueur
    ? await Promise.all([
        getConversationMessages(joueur, open ?? "global"),
        getConversationChannels(supabase, { playerId: joueur, viewerId: profile.id, viewer: isAdmin ? "admin" : "coach" }),
        supabase.from("profiles").select("first_name, last_name").eq("id", joueur).maybeSingle(),
      ])
    : [[], [], { data: null }];
  const openChannel = channels.find((c) => c.id === open);
  const playerName = playerProfile.data
    ? `${playerProfile.data.first_name} ${playerProfile.data.last_name}`.trim()
    : "Joueur";

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[480px] overflow-hidden rounded-xl border border-[#e9edef] bg-white lg:h-[calc(100dvh-4rem)]">
      {/* ---- la liste ---- */}
      <nav
        aria-label="Discussions"
        className={`min-h-0 w-full shrink-0 flex-col overflow-y-auto border-r border-[#e9edef] lg:flex lg:w-[380px] ${
          joueur ? "hidden" : "flex"
        }`}
      >
        <div className="sticky top-0 z-[1] bg-white px-4 pb-2 pt-4">
          <p className="text-[21px] font-bold text-[#111b21]">Discussions</p>
          <p className="text-[12.5px] text-[#667781]">
            {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}` : "Tout est lu"}
          </p>
        </div>
        {threads.length === 0 ? (
          <p className="px-4 py-6 text-[13.5px] text-[#667781]">Aucune discussion pour l&apos;instant.</p>
        ) : (
          <ul>
            {threads.map((t) => {
              const active = t.playerId === joueur && t.channel === open;
              const [first, ...rest] = t.playerName.split(" ");
              return (
                <li key={`${t.playerId}:${t.channel}`}>
                  <Link
                    href={`/coach/messages?joueur=${t.playerId}&canal=${t.channel}`}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-[#f5f6f6] ${active ? "bg-[#f0f2f5]" : ""}`}
                  >
                    <PlayerAvatar firstName={first ?? ""} lastName={rest.join(" ")} />
                    <span className="min-w-0 flex-1 border-b border-[#f0f2f5] pb-2.5 pt-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[15.5px] text-[#111b21] ${t.hasUnread ? "font-bold" : "font-medium"}`}>
                          {t.playerName}
                          <span className="ml-1.5 text-[12px] font-normal text-[#667781]">· {CHANNEL_NAMES[parseChannelId(t.channel).kind]}</span>
                        </span>
                        {t.lastAt && (
                          <span className={`shrink-0 text-[12px] ${t.hasUnread ? "font-semibold text-[#25d366]" : "text-[#667781]"}`}>
                            {listTime(t.lastAt)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-[13.5px] ${t.hasUnread ? "text-[#111b21]" : "text-[#667781]"}`}>
                          {t.lastBody ? `${t.lastFromMe ? "Toi : " : ""}${t.lastBody}` : "Aucun message"}
                        </span>
                        {t.hasUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#25d366]" />}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* ---- la discussion ---- */}
      <section className={`min-h-0 min-w-0 flex-1 flex-col lg:flex ${joueur ? "flex" : "hidden"}`}>
        {joueur && openChannel ? (
          <>
            <header className="flex shrink-0 items-center gap-3 bg-[#f0f2f5] px-3 py-2">
              <Link
                href="/coach/messages"
                aria-label="Retour aux discussions"
                className="-ml-1 rounded-full p-1.5 text-[#54656f] hover:bg-black/5 lg:hidden"
              >
                <ArrowLeft size={20} />
              </Link>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-medium text-[#111b21]">
                  {playerName} · {openChannel.label}
                </span>
                <span className="block truncate text-[12.5px] text-[#667781]">{openChannel.members}</span>
              </span>
              <Link
                href={`/coach/joueurs/${joueur}?onglet=messages&canal=${openChannel.id}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-[#54656f] hover:bg-black/5"
              >
                Fiche <ArrowUpRight size={13} />
              </Link>
            </header>
            <MessageThread
              staff
              key={`${joueur}:${openChannel.id}`}
              playerId={joueur}
              currentUserId={profile.id}
              channel={openChannel.id}
              canWrite={openChannel.canWrite}
              initialMessages={messages}
              variant="coach"
              className="min-h-0 flex-1"
            />
          </>
        ) : (
          <div className="wa-wallpaper flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageCircle size={36} className="text-[#8696a0]" />
            <p className="text-[15px] font-medium text-[#41525d]">Choisis une discussion</p>
            <p className="max-w-[300px] text-[13px] text-[#667781]">
              {joueur ? "Ce fil n'existe pas ou ne t'est pas ouvert." : "Tes discussions avec les joueurs et les parents, de la plus récente à la plus ancienne."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
