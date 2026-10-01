"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "./api-client";

/** POST /api/license/logout clears the cookie; the refresh re-runs the server page, which redirects to /activate. */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await apiFetch("/api/license/logout", { method: "POST" });
    router.refresh();
    router.push("/activate");
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="text-[15px] text-ink underline decoration-hairline-strong underline-offset-[0.15em] hover:text-blue disabled:opacity-50"
    >
      {busy ? "Logging out" : "Log out"}
    </button>
  );
}
