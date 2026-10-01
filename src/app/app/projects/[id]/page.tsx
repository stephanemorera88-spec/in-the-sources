import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ENGINES } from "@/lib/contracts";
import { getDashboard, getEngineKeyHints, listPrompts } from "@/lib/db";
import { getCurrentLicense } from "@/lib/license";
import { PageShell, SectionHeading } from "@/components/ui";
import { AppHeader } from "@/components/app/AppHeader";
import { CompetitorLeaderboard } from "@/components/app/CompetitorLeaderboard";
import { EngineReadout } from "@/components/app/EngineReadout";
import { PromptManager } from "@/components/app/PromptManager";
import { PromptTable } from "@/components/app/PromptTable";
import { RunNowButton } from "@/components/app/RunNowButton";
import { TrendChart } from "@/components/app/TrendChart";
import { ENGINE_LABELS, RUN_STATUS_LABELS, formatDateTime, pluralize } from "@/components/app/format";

export const metadata: Metadata = { title: "Project" };
export const dynamic = "force-dynamic";

/** The dashboard: latest-run readout, trend, prompt table, cited domains, prompt management. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const license = await getCurrentLicense();
  if (!license) redirect("/activate");

  const { id } = await params;
  const dashboard = await getDashboard(license.id, id);
  if (!dashboard) notFound();

  const [prompts, hints] = await Promise.all([listPrompts(license.id, id), getEngineKeyHints(license.id)]);
  const { project, latestRun, trend, promptTable, competitorLeaderboard } = dashboard;
  const enginesWithKeys = ENGINES.filter((engine) => hints[engine]?.set === true);

  const blockedReason =
    prompts.length === 0
      ? "Add at least one prompt below before running."
      : enginesWithKeys.length === 0
        ? "Add an engine key in Settings before running."
        : null;

  return (
    <>
      <AppHeader license={license} />
      <main>
        <PageShell className="py-10 md:py-14">
          <p className="text-[14px] text-ink-50">
            <Link href="/app">Projects</Link>
          </p>

          <div className="mt-2 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <h1>{project.brandName}</h1>
              <p className="mt-2 font-mono text-[15px] text-ink-70">{project.domain}</p>
              {project.aliases.length > 0 && (
                <p className="mt-1 text-[14px] text-ink-50">Also counted as named when answers say {project.aliases.join(", ")}.</p>
              )}
              <p className="mt-3 text-[14px] text-ink-50">
                {latestRun
                  ? `Last run ${formatDateTime(latestRun.startedAt)}, ${RUN_STATUS_LABELS[latestRun.status].toLowerCase()}. `
                  : "No runs yet. "}
                {project.dailyRun ? "Runs daily while the project has prompts and a key." : "Daily runs are off."}
              </p>
              {enginesWithKeys.length > 0 && enginesWithKeys.length < ENGINES.length && (
                <p className="mt-1 text-[14px] text-ink-50">
                  Runs cover {enginesWithKeys.map((engine) => ENGINE_LABELS[engine]).join(" and ")}. Add the other keys in{" "}
                  <Link href="/app/settings">Settings</Link> to cover all three engines.
                </p>
              )}
            </div>
            <RunNowButton projectId={project.id} blockedReason={blockedReason} />
          </div>

          <section className="mt-12">
            <SectionHeading>Latest run</SectionHeading>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-70">
              In the sources is the share of answers that cited {project.domain}. Named is the share that mentioned the
              brand. Failed calls are left out of both.
            </p>
            <div className="mt-5">
              <EngineReadout latestRun={latestRun} />
            </div>
          </section>

          <section className="mt-12">
            <SectionHeading>Trend</SectionHeading>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-70">
              Share of answers in the sources, per engine, run by run. The table under the chart carries the same
              numbers plus the named rate and opens each run.
            </p>
            <div className="mt-5">
              <TrendChart trend={trend} projectId={project.id} />
            </div>
          </section>

          <section className="mt-12">
            <SectionHeading>Prompts in the latest run</SectionHeading>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-70">
              One column per engine. A number after named is the position in a numbered list. Hover an error for the
              message.
            </p>
            <div className="mt-5">
              <PromptTable rows={promptTable} />
            </div>
          </section>

          <section className="mt-12">
            <SectionHeading>Cited domains</SectionHeading>
            <p className="mt-2 max-w-2xl text-[15px] text-ink-70">
              How many answers in the latest run cited each domain, top 20. Your domain and the competitors you named
              carry a mark.
            </p>
            <div className="mt-5">
              <CompetitorLeaderboard rows={competitorLeaderboard} />
            </div>
          </section>

          <section className="mt-12 max-w-3xl">
            <SectionHeading>Prompts</SectionHeading>
            <p className="mt-2 text-[15px] text-ink-70">
              {pluralize(prompts.length, "active prompt")}. Archived prompts keep their past results and leave future
              runs.
            </p>
            <div className="mt-5">
              <PromptManager projectId={project.id} prompts={prompts} />
            </div>
          </section>
        </PageShell>
      </main>
    </>
  );
}
