"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { keyFromFragment } from "@/lib/activate-link";
import { Button, Input, Label, Notice } from "@/components/ui";
import { apiFetch } from "./api-client";

/* The location hash is an external store: the server snapshot is "" and the
   client snapshot is the key from the fragment, which React reconciles after
   hydration without a mismatch. */
function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHashKey(): string {
  return keyFromFragment(window.location.hash);
}

function serverHashKey(): string {
  return "";
}

/**
 * One field. The email link is /activate#k=<key>: the fragment never reaches
 * the server, so the key is read here, on the client. Anything the user
 * types replaces it. POSTs to builder B's activate route, clears the fragment
 * from the history entry once the cookie is set, then moves to /app.
 */
export function ActivateForm() {
  const router = useRouter();
  const id = useId();
  const fromLink = useSyncExternalStore(subscribeToHash, readHashKey, serverHashKey);
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = typed ?? fromLink;

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

    if (window.location.hash) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
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
        onChange={(event) => setTyped(event.target.value)}
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
