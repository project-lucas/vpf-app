import { getConversationMessages } from "@/app/actions/messages";
import { getParentChild } from "@/lib/parent-data";
import { MessageThread } from "@/components/messages/MessageThread";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata = { title: "Messages — VPF" };
export const dynamic = "force-dynamic";

export default async function ParentMessagesPage() {
  const child = await getParentChild();
  if (!child) {
    return (
      <>
        <PageHeader title="Messages" />
        <EmptyState>Votre compte n&apos;est lié à aucun joueur actif.</EmptyState>
      </>
    );
  }

  const messages = await getConversationMessages(child.playerId);

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={`Le fil de discussion de ${child.firstName} avec son coach — vous pouvez y participer.`}
      />
      <Card>
        <MessageThread
          playerId={child.playerId}
          currentUserId={child.parentId}
          initialMessages={messages}
          variant="coach"
        />
      </Card>
    </>
  );
}
