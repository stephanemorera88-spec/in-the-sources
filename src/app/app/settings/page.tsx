import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ENGINES } from "@/lib/contracts";
import { getEngineKeyHints } from "@/lib/db";
import { getCurrentLicense } from "@/lib/license";
import { PageShell } from "@/components/ui";
import { AppHeader } from "@/components/app/AppHeader";
import { EngineKeyRow } from "@/components/app/EngineKeyRow";
import { ENGINE_LABELS } from "@/components/app/format";
import { projectHints } from "@/app/api/settings/hints";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Three engine key rows. Only hints reach this page: getEngineKeyHints never
 * returns key material, and projectHints re-projects each row to
 * { set, hint, updatedAt } before anything is passed to a client component.
 */
export default async function SettingsPage() {
  const license = await getCurrentLicense();
  if (!license) redirect("/activate");

  const hints = projectHints(await getEngineKeyHints(license.id));

  return (
    <>
      <AppHeader license={license} />
      <main>
        <PageShell className="py-10 md:py-14">
          <p className="text-[14px] text-ink-50">
            <Link href="/app">Projects</Link>
          </p>
          <h1 className="mt-2">Engine keys</h1>
          <p className="mt-4 max-w-2xl text-ink-70">
            Paste an API key from your own OpenAI, Anthropic and Google AI accounts. Each key is encrypted on our
            server and only used to run your prompts. It never comes back to the browser; this page shows the last
            four characters so you know which key is in place. Your provider bills you directly for the calls, and a
            run skips any engine without a key.
          </p>

          <div className="mt-8 divide-y divide-hairline border-y border-hairline">
            {ENGINES.map((engine) => (
              <EngineKeyRow key={engine} engine={engine} label={ENGINE_LABELS[engine]} hint={hints[engine]} />
            ))}
          </div>
        </PageShell>
      </main>
    </>
  );
}
