import Link from "next/link";
import { PageShell } from "@/components/ui";

/** Rendered when a project or run is not on this license (or was deleted). */
export default function AppNotFound() {
  return (
    <main>
      <PageShell className="py-16 md:py-24">
        <h1>Not found</h1>
        <p className="mt-4 max-w-xl text-ink-70">That project or run is not on this license, or it was deleted.</p>
        <p className="mt-6">
          <Link href="/app">Back to projects</Link>
        </p>
      </PageShell>
    </main>
  );
}
