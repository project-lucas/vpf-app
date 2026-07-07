"use client";

import { useState, useTransition } from "react";
import { markSessionCompletion, saveChallengeScore } from "@/app/actions/player";
import { successFeedback } from "@/lib/feedback";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";
import { SessionProgramme } from "./SessionProgramme";
import { CheckIcon, PlayIcon, XIcon } from "@/components/icons";
import { SquareIconButton } from "@/components/editorial/primitives";
import { XpBurst } from "@/components/ui/XpBurst";
import { XP_VALUES } from "@/lib/gamification";
import type { SessionAssignmentWithSession } from "@/lib/types";

export function SessionCard({
  assignment,
  index,
}: {
  assignment: SessionAssignmentWithSession;
  index: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState(assignment.completion?.comment ?? "");
  const [programmeOpen, setProgrammeOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [score, setScore] = useState(assignment.completion?.challenge_score?.toString() ?? "");
  const [videoOpen, setVideoOpen] = useState(false);
  const [xpBurst, setXpBurst] = useState(0);

  const { session, completion } = assignment;
  // ?? [] : tolère une base pas encore migrée (colonne exercises absente)
  const exercises = session.exercises ?? [];
  const hasProgramme = exercises.length > 0;
  const hasVideo = Boolean(session.youtube_url);
  const num = String(index).padStart(2, "0");

  function mark(status: "done" | "not_done") {
    if (status === "done" && completion?.status !== "done") {
      successFeedback();
      setXpBurst((b) => b + 1);
    }
    startTransition(async () => {
      await markSessionCompletion(assignment.id, status, completion?.comment ?? "");
    });
  }

  function saveComment() {
    startTransition(async () => {
      await markSessionCompletion(assignment.id, completion?.status ?? "done", comment);
      setCommentOpen(false);
    });
  }

  function saveScore() {
    const parsed = score.trim() === "" ? null : Number(score);
    if (parsed !== null && parsed >= (session.challenge?.maxScore ?? 0) * 0.8) successFeedback();
    startTransition(async () => {
      await saveChallengeScore(assignment.id, parsed);
      setScoreOpen(false);
    });
  }

  return (
    <div>
      {/* Bloc média : navy avec liseré crème, gros numéro, play rond rouge, tags */}
      <div className="rounded-lg border-2 border-ink bg-ink p-1.5">
        <div className="relative aspect-video overflow-hidden rounded-md border border-warm/25 bg-ink">
          {videoOpen && hasVideo ? (
            <YouTubeEmbed url={session.youtube_url} title={session.name} />
          ) : (
            <>
              <span className="ed-value absolute left-3 top-1 text-[54px] leading-tight text-paper">
                {num}
              </span>
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                <span className="ed-meta rounded border border-paper/40 px-1.5 py-0.5 text-[9px] text-paper">
                  {session.duration_minutes} min
                </span>
                {session.equipment && (
                  <span className="ed-meta rounded border border-paper/40 px-1.5 py-0.5 text-[9px] text-paper">
                    {session.equipment}
                  </span>
                )}
              </div>
              {hasVideo && (
                <button
                  onClick={() => setVideoOpen(true)}
                  aria-label="Lire la vidéo"
                  className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-orange text-paper transition-transform hover:scale-105 active:scale-95"
                >
                  <PlayIcon size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ligne séance : titre + sous-titre + valider / passer */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ed-display text-[20px] text-ink">{session.name}</h3>
          {session.subtitle && (
            <p className="ed-meta mt-1 text-[9px] text-meta">{session.subtitle}</p>
          )}
          {hasProgramme && (
            <button
              onClick={() => setProgrammeOpen(!programmeOpen)}
              className="ed-meta mt-1.5 text-[9px] text-orange underline-offset-2 hover:underline"
            >
              {programmeOpen ? "Masquer le détail" : "Voir le programme"}
            </button>
          )}
        </div>
        <div className="relative flex shrink-0 gap-1.5">
          <XpBurst amount={XP_VALUES.sessionDone} burstKey={xpBurst} />
          <SquareIconButton
            onClick={() => mark("done")}
            disabled={isPending}
            aria-label="Séance faite"
            filled={completion?.status === "done"}
          >
            <CheckIcon size={18} />
          </SquareIconButton>
          <SquareIconButton
            onClick={() => mark("not_done")}
            disabled={isPending}
            aria-label="Séance pas faite"
            className={completion?.status === "not_done" ? "bg-orange text-white" : ""}
          >
            <XIcon size={18} />
          </SquareIconButton>
        </div>
      </div>

      {programmeOpen && (
        <div className="mt-3">
          <SessionProgramme
            intro={session.intro}
            exercises={exercises}
            challenge={session.challenge}
          />
        </div>
      )}

      {completion && (
        <div className="mt-3 space-y-3 border-t border-hair pt-3">
          {session.challenge &&
            (scoreOpen ? (
              <div className="ed-meta flex items-center gap-2 text-[10px] text-ink">
                <span>Challenge</span>
                <input
                  type="number"
                  min={0}
                  max={session.challenge.maxScore}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="w-14 border-2 border-ink bg-transparent px-2 py-1 font-cond text-base outline-none"
                  autoFocus
                />
                <span>/ {session.challenge.maxScore}</span>
                <button onClick={saveScore} disabled={isPending} className="text-orange">
                  OK
                </button>
                <button onClick={() => setScoreOpen(false)} className="text-muted">
                  Annuler
                </button>
              </div>
            ) : completion.challenge_score != null ? (
              <button
                onClick={() => setScoreOpen(true)}
                className="ed-meta flex items-center gap-1.5 text-[10px] text-ink"
              >
                Challenge : {completion.challenge_score}/{session.challenge.maxScore}
                {session.challenge.scoreUnit ? ` ${session.challenge.scoreUnit}` : ""}
              </button>
            ) : (
              <button
                onClick={() => setScoreOpen(true)}
                className="ed-meta text-[10px] text-muted hover:text-ink"
              >
                + Noter mon challenge
              </button>
            ))}
          {commentOpen ? (
            <div className="space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Un commentaire sur cette séance ? (optionnel)"
                className="w-full border-2 border-ink bg-transparent px-3 py-2 font-body text-sm text-ink outline-none focus-visible:outline-none"
                rows={2}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setCommentOpen(false)}
                  className="ed-meta text-[10px] text-meta"
                >
                  Annuler
                </button>
                <button
                  onClick={saveComment}
                  disabled={isPending}
                  className="ed-meta text-[10px] text-orange"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : completion.comment ? (
            <button
              onClick={() => setCommentOpen(true)}
              className="w-full text-left font-body text-xs text-meta"
            >
              {completion.comment}
            </button>
          ) : (
            <button
              onClick={() => setCommentOpen(true)}
              className="ed-meta text-[10px] text-muted hover:text-ink"
            >
              + Ajouter un commentaire
            </button>
          )}
        </div>
      )}
    </div>
  );
}
