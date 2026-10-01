"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { EngineId, EngineKeyHint } from "@/lib/contracts";
import { Button, Input, Label, Notice } from "@/components/ui";
import { useApi } from "./use-api";
import { formatDate } from "./format";

const PLACEHOLDERS: Record<EngineId, string> = {
  openai: "sk-proj-",
  anthropic: "sk-ant-",
  gemini: "AIza",
};

const CONSOLE_URLS: Record<EngineId, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  gemini: "https://aistudio.google.com/apikey",
};

/**
 * One engine: the current hint ("Set, ends in ····abcd" or "Not set"), a
 * password field, Save and Remove. The server never sends key material to
 * this component; after a save it only learns the new last four characters.
 */
export function EngineKeyRow({ engine, label, hint }: { engine: EngineId; label: string; hint: EngineKeyHint }) {
  const router = useRouter();
  const api = useApi();
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<"idle" | "saving" | "removing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiKey = value.trim();
    if (apiKey.length < 10) {
      setError("Paste the whole key.");
      return;
    }
    setBusy("saving");
    setError(null);
    setNotice(null);

    const result = await api<{ ok: true; engine: EngineId; key: EngineKeyHint }>("/api/settings/keys", {
      method: "PUT",
      body: { engine, apiKey },
    });

    setBusy("idle");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValue("");
    setNotice(result.data.key.hint ? `Saved. Ends in ${result.data.key.hint}.` : "Saved.");
    router.refresh();
  }

  async function remove() {
    setBusy("removing");
    setError(null);
    setNotice(null);

    const result = await api("/api/settings/keys", { method: "DELETE", body: { engine } });

    setBusy("idle");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Removed. Runs skip this engine until you add a key again.");
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="grid gap-4 py-6 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h2 className="text-[1.25rem] md:text-[1.25rem]">{label}</h2>
        <p className="mt-1 text-[15px] text-ink-70">
          {hint.set ? (
            <>
              Set, ends in <span className="font-mono">····{hint.hint ?? "????"}</span>
            </>
          ) : (
            "Not set"
          )}
        </p>
        {hint.set && hint.updatedAt && <p className="text-[13px] text-ink-50">Updated {formatDate(hint.updatedAt)}</p>}
        <p className="mt-2 text-[13px] text-ink-50">
          <a href={CONSOLE_URLS[engine]} target="_blank" rel="noreferrer noopener">
            Where to create one
          </a>
        </p>
      </div>
      <div>
        <Label htmlFor={id}>{hint.set ? "Replace the key" : "API key"}</Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id={id}
            type="password"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={PLACEHOLDERS[engine]}
            autoComplete="off"
            spellCheck={false}
            className="font-mono sm:flex-1"
          />
          <div className="flex gap-3">
            <Button type="submit" disabled={busy !== "idle"}>
              {busy === "saving" ? "Saving" : "Save"}
            </Button>
            {hint.set && (
              <Button type="button" variant="secondary" onClick={remove} disabled={busy !== "idle"}>
                {busy === "removing" ? "Removing" : "Remove"}
              </Button>
            )}
          </div>
        </div>
        {error && (
          <Notice tone="error" className="mt-3">
            {error}
          </Notice>
        )}
        {notice && <Notice className="mt-3">{notice}</Notice>}
      </div>
    </form>
  );
}
