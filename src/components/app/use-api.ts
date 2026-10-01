"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { apiFetch, type ApiFetchInit, type ApiResult } from "./api-client";

/** apiFetch bound to the router: a 401 (cookie gone or license revoked) sends the browser to /activate. */
export function useApi() {
  const router = useRouter();
  return useCallback(
    async <T = unknown>(url: string, init: ApiFetchInit = {}): Promise<ApiResult<T>> => {
      const result = await apiFetch<T>(url, init);
      if (!result.ok && result.status === 401) router.push("/activate");
      return result;
    },
    [router]
  );
}
