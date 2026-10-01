"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button, Input, Label, Notice } from "@/components/ui";
import { apiFetch } from "./api-client";

/** One field, pre-filled from ?k=. POSTs to builder B's activate route, then moves to /app. */
export function ActivateForm({ initialKey }: { initialKey: string }) {
  const router = useRouter();
  const id = useId();
  const [key, setKey] = useState(initialKey);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError("Paste your license key first.");
      return;
    }
    setBusy(true);
    setError(null);

    const result = await apiFetch("/api/license/activate", { method: "POST", body: { key: trimmed } });

    if (!result.ok) {
      setBusy(false);
      if (result.status === 401) {
        setError("That key was not recognized. Check for missing characters, then try again.");
      } else {
        setError(result.error);
      }
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8">
      <Label htmlFor={id}>License key</Label>
      <Input
        id={id}
        name="key"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder="its_"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="font-mono"
      />
      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}
      <div className="mt-4">
        <Button type="submit" disabled={busy}>
          {busy ? "Checking" : "Open the app"}
        </Button>
      </div>
    </form>
  );
}
