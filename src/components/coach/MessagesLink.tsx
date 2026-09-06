import Link from "next/link";
import { MessageCircle } from "lucide-react";

/**
 * Bouton « Messages » du dashboard : ouvre la boîte de réception du staff, avec
 * le nombre de fils qui attendent une réponse. Coachs comme admins — un coach a
 * le fil coach & parents de chacun de ses joueurs, un admin y ajoute les siens.
 */
export function MessagesLink({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/coach/messages"
      className="relative inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-navy-700"
    >
      <MessageCircle size={14} />
      Messages
      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-danger px-1 text-[10px] font-extrabold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
