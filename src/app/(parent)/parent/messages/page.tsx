import { getConversationMessages } from "@/app/actions/messages";
import { getParentChild } from "@/lib/parent-data";
import { createClient } from "@/lib/supabase/server";
import { getConversationChannels } from "@/lib/conversations";
import { channelId, parseChannelId } from "@/lib/channels";
import { ConversationPanel } from "@/components/messages/ConversationPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Messages — VPF" };
export const dynamic = "force-dynamic";

/**
 * Les discussions d'un parent (0048), façon WhatsApp : le fil Global de son
 * enfant (avec lui et le staff) et le fil Parents, privé avec le staff — c'est
 * là qu'arrive le point du mois, le 28.
 */
export default async function ParentMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const { canal } = await searchParams;
  const child = await getParentChild();
  if (!child) {
    return (
      <>
        <PageHeader title="Messages" />
        <EmptyState>Votre compte n&apos;est lié à aucun joueur actif.</EmptyState>
      </>
    );
  }

  const openChannel = channelId(parseChannelId(canal));
  const supabase = await createClient();
  const [channels, messages] = await Promise.all([
    getConversationChannels(supabase, { playerId: child.playerId, viewerId: child.parentId, viewer: "parent" }),
    getConversationMessages(child.playerId, openChannel),
  ]);

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={`Les discussions autour de ${child.firstName} : le fil Global avec lui et son coach, et le fil Parents, entre vous et le staff.`}
      />
      <ConversationPanel
        playerId={child.playerId}
        currentUserId={child.parentId}
        channels={channels}
        initialChannelKey={openChannel}
        startInChat={Boolean(canal)}
        initialMessages={messages}
        className="h-[calc(100dvh-230px)] min-h-[380px] max-h-[720px]"
      />
    </>
  );
}
