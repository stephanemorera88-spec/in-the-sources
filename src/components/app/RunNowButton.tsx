"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Run } from "@/lib/contracts";
import { Button } from "@/components/ui";
import { useApi } from "./use-api";

const DONE_MESSAGES: Record<Run["status"], string> = {
  complete: "Done. The page now shows this run.",
  partial: "Done, with some failed answers. The prompt table marks them.",
  failed: "The run failed. Open it from the runs table for details.",
  running: "Still running. Refresh in a minute.",
};

/**
 * POSTs to /api/projects/[id]/runs, which waits for the whole run (up to
 * five minutes), then refreshes the server-rendered dashboard.
 */
export function RunNowButton({ projectId, blockedReason }: { projectId: string; blockedReason?: string | null }) {
  const router = useRouter();
  const api = useApi();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(null);

    const result = await api<{ run: Run }>(`/api/projects/${projectId}/runs`, { method: "POST" });

    setRunning(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(DONE_MESSAGES[result.data.run.status]);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <Button onClick={run} disabled={running || Boolean(blockedReason)} title={blockedReason ?? undefined}>
        {running ? "Running" : "Run now"}
      </Button>
      {running && (
        <p role="status" className="text-[14px] text-ink-70 md:text-right">
          Running... this takes about a minute.
        </p>
      )}
      {!running && blockedReason && <p className="max-w-xs text-[14px] text-ink-50 md:text-right">{blockedReason}</p>}
      {error && (
        <p role="alert" className="max-w-xs text-[14px] text-ink md:text-right">
          {error}
        </p>
      )}
      {done && !running && (
        <p role="status" className="max-w-xs text-[14px] text-ink-70 md:text-right">
          {done}
        </p>
      )}
    </div>
  );
}
