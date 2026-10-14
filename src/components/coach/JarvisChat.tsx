"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { askJarvis, type JarvisTurn } from "@/app/actions/jarvis";

interface ChatLine extends JarvisTurn {
  actions?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Qui décroche cette semaine ?",
  "Ajoute une séance physique à un joueur qui n'en a pas",
  "Qui n'a pas rempli son bilan ?",
];

/**
 * La conversation avec Jarvis, sous le mot du matin. On lui pose des
 * questions sur le service, et on lui demande d'agir : affecter une séance,
 * poser un créneau, écrire à un joueur… Chaque action faite s'affiche sous sa
 * réponse. L'historique vit dans la page (il repart à zéro au rechargement).
 */
export function JarvisChat({ groupId, configured }: { groupId: string | null; configured: boolean }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines, isPending]);

  function ask(text: string) {
    const question = text.trim();
    if (!question || isPending) return;
    const next: ChatLine[] = [...lines, { role: "user", content: question }];
    setLines(next);
    setDraft("");
    startTransition(async () => {
      const history = next.filter((l) => !l.error).map(({ role, content }) => ({ role, content }));
      const result = await askJarvis(groupId, history);
      setLines((cur) => [
        ...cur,
        result.ok
          ? { role: "assistant", content: result.reply, actions: result.actions }
          : { role: "assistant", content: result.error, error: true },
      ]);
    });
  }

  if (!configured) {
    return (
      <p className="rounded-2xl border border-dashed border-navy-200 bg-white px-4 py-3 text-[12.5px] text-navy-500">
        Jarvis n&apos;est pas encore branché : il manque la clé API Anthropic.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-navy-100 bg-white">
      <div className="max-h-[340px] space-y-2.5 overflow-y-auto px-3.5 py-3">
        {lines.length === 0 && (
          <div>
            <p className="text-[12.5px] text-navy-500">
              Pose une question sur le groupe, ou demande-moi d&apos;agir : affecter une séance,
              ajouter un créneau, écrire à un joueur…
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full bg-navy-50 px-2.5 py-1 text-[11.5px] font-semibold text-navy-600 hover:bg-navy-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={l.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px] leading-snug ${
                l.role === "user"
                  ? "bg-navy-800 text-white"
                  : l.error
                    ? "bg-danger-soft text-danger"
                    : "bg-navy-50 text-navy-900"
              }`}
            >
              {l.content}
              {l.actions && l.actions.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-navy-200/60 pt-1.5">
                  {l.actions.map((a) => (
                    <li key={a} className="flex items-start gap-1 text-[11.5px] font-semibold text-success">
                      <Check size={12} className="mt-0.5 shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {isPending && <p className="text-[12px] italic text-navy-400">Jarvis réfléchit…</p>}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
        className="flex items-end gap-2 border-t border-navy-100 p-2.5"
      >
        <label htmlFor="jarvis-input" className="sr-only">
          Message à Jarvis
        </label>
        <textarea
          id="jarvis-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              ask(draft);
            }
          }}
          rows={2}
          placeholder="Ex. : ajoute une séance de tir à Liam lundi et jeudi"
          className="min-h-11 flex-1 resize-none rounded-xl border border-navy-200 px-3 py-2 text-[13px] focus:border-navy-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending || !draft.trim()}
          aria-label="Envoyer à Jarvis"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy-800 text-white hover:bg-navy-700 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
