"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import type { Prompt } from "@/lib/contracts";
import { PRODUCT } from "@/lib/product";
import { Button, Label, Notice, Textarea } from "@/components/ui";
import { useApi } from "./use-api";
import { pluralize } from "./format";

function splitLines(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split("\n")) {
    const line = raw.trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/**
 * Prompt list with archive buttons, a textarea for new prompts (one per
 * line) and "Suggest 10 from the site", which fills the textarea for review.
 * Nothing is saved until Add prompts is pressed.
 */
export function PromptManager({ projectId, prompts }: { projectId: string; prompts: Prompt[] }) {
  const router = useRouter();
  const api = useApi();
  const id = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"idle" | "adding" | "suggesting" | "archiving">("idle");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lines = useMemo(() => splitLines(text), [text]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) {
      setError("Type at least one prompt, one per line.");
      return;
    }
    if (lines.length > PRODUCT.maxPromptsPerProject) {
      setError(`Add at most ${PRODUCT.maxPromptsPerProject} prompts at a time.`);
      return;
    }
    setBusy("adding");
    setError(null);
    setNotice(null);

    const result = await api<{ prompts: Prompt[] }>(`/api/projects/${projectId}/prompts`, {
      method: "POST",
      body: { texts: lines },
    });

    setBusy("idle");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText("");
    setNotice(`Added ${pluralize(result.data.prompts.length, "prompt")}. They go into the next run.`);
    router.refresh();
  }

  async function suggest() {
    setBusy("suggesting");
    setError(null);
    setNotice(null);

    const result = await api<{ prompts: string[] }>(`/api/projects/${projectId}/suggest`, { method: "POST" });

    setBusy("idle");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText([...splitLines(text), ...result.data.prompts].join("\n"));
    setNotice(
      `${pluralize(result.data.prompts.length, "suggestion")} loaded below. Edit the list, then press Add prompts to save it.`
    );
  }

  async function archive(prompt: Prompt) {
    setBusy("archiving");
    setArchivingId(prompt.id);
    setError(null);
    setNotice(null);

    const result = await api(`/api/projects/${projectId}/prompts/${prompt.id}`, { method: "DELETE" });

    setBusy("idle");
    setArchivingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {prompts.length === 0 ? (
        <Notice>No prompts yet. Add a few below, or let us suggest ten from the site.</Notice>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {prompts.map((prompt) => (
            <li key={prompt.id} className="flex items-start justify-between gap-4 py-3">
              <p className="text-[15px]">{prompt.text}</p>
              <button
                type="button"
                onClick={() => archive(prompt)}
                disabled={busy !== "idle"}
                className="shrink-0 text-[14px] text-ink-50 underline decoration-hairline-strong underline-offset-[0.15em] hover:text-blue disabled:opacity-50"
              >
                {archivingId === prompt.id ? "Archiving" : "Archive"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} noValidate className="mt-8">
        <Label htmlFor={id}>Add prompts, one per line</Label>
        <Textarea
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          placeholder={"best dentist in DeLand\nhow much does a dental implant cost in Florida"}
        />
        <p className="mt-1.5 text-[14px] text-ink-50">
          {pluralize(lines.length, "prompt")} ready. Write them the way a customer would ask an AI assistant.
        </p>
        {busy === "suggesting" && (
          <p role="status" className="mt-3 text-[14px] text-ink-70">
            Reading the site and drafting prompts. This takes about twenty seconds.
          </p>
        )}
        {error && (
          <Notice tone="error" className="mt-3">
            {error}
          </Notice>
        )}
        {notice && <Notice className="mt-3">{notice}</Notice>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" disabled={busy !== "idle"}>
            {busy === "adding" ? "Adding" : "Add prompts"}
          </Button>
          <Button type="button" variant="secondary" onClick={suggest} disabled={busy !== "idle"}>
            {busy === "suggesting" ? "Reading the site" : "Suggest 10 from the site"}
          </Button>
        </div>
      </form>
    </div>
  );
}
