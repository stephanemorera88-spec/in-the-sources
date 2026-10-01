import Link from "next/link";
import type { License } from "@/lib/contracts";
import { PRODUCT } from "@/lib/product";
import { PageShell } from "@/components/ui";
import { LogoutButton } from "./LogoutButton";
import { PLAN_LABELS } from "./format";

/** Top bar for every signed-in page. Server Component; only the logout button is client code. */
export function AppHeader({ license }: { license: License }) {
  return (
    <header className="border-b border-hairline">
      <PageShell className="flex h-16 items-center justify-between gap-3">
        <Link href="/app" className="font-serif text-[1.25rem] font-medium tracking-[-0.025em] text-ink no-underline">
          {PRODUCT.name}
        </Link>
        <nav aria-label="Account" className="flex items-center gap-4 text-[15px] sm:gap-6">
          <span
            className="hidden rounded-full border border-hairline-strong px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-70 sm:inline-block"
            title={license.email}
          >
            {PLAN_LABELS[license.plan]}
          </span>
          <Link href="/app/settings" className="no-underline hover:underline">
            Settings
          </Link>
          <LogoutButton />
        </nav>
      </PageShell>
    </header>
  );
}
