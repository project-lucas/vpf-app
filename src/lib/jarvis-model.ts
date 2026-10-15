import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/**
 * Un appel structuré au modèle de Jarvis : un prompt système stable, une
 * demande, une sortie validée par un schéma Zod. Même réglage que le brief du
 * matin (`morning-brief.ts`) : repli serveur si le classifieur refuse.
 */
export const JARVIS_MODEL = "claude-opus-5-5";

export async function askJarvisStructured<T extends z.ZodType>(options: {
  schema: T;
  system: string;
  prompt: string;
  /** « low » pour rédiger court, « medium » pour synthétiser */
  effort: "low" | "medium";
  timeoutMs: number;
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; model: string; tokens: number }> {
  const client = new Anthropic({ timeout: options.timeoutMs, maxRetries: 1 });
  const response = await client.beta.messages.parse({
    model: JARVIS_MODEL,
    max_tokens: options.maxTokens ?? 12000,
    // un refus du classifieur relance la même demande sur le modèle de repli
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: zodOutputFormat(options.schema), effort: options.effort },
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error("le modèle a refusé la demande");
  if (response.stop_reason === "max_tokens") throw new Error("réponse tronquée (max_tokens)");
  const data = response.parsed_output;
  if (!data) throw new Error("réponse du modèle illisible");
  return {
    data,
    model: response.model,
    tokens: response.usage.input_tokens + response.usage.output_tokens,
  };
}
