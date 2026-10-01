import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ResultRow, Source } from "@/lib/contracts";
import { ENGINES } from "@/lib/contracts";
import { getProject, getRun, listPrompts, listResults } from "@/lib/db";
import { getCurrentLicense } from "@/lib/license";
import { Notice, PageShell, SectionHeading } from "@/components/ui";
import { AppHeader } from "@/components/app/AppHeader";
import {
  ENGINE_LABELS,
  RUN_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatLatency,
  pluralize,
  scrubKeyLike,
} from "@/components/app/format";

export const metadata: Metadata = { title: "Run" };
export const dynamic = "force-dynamic";

function Mark({ on, children }: { on: boolean; children: string }) {
  return (
    <span
      className={
        on
          ? "inline-block rounded-full border border-hairline-strong px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink"
          : "inline-block rounded-full border border-hairline px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-50"
      }
    >
      {children}
    </span>
  );
}

function SourceList({ title, sources, empty }: { title: string; sources: Source[]; empty: string }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-50">
        {title} ({sources.length})
      </p>
      {sources.length === 0 ? (
        <p className="mt-1 text-[14px] text-ink-50">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
          {sources.map((source, index) => (
            <li key={`${source.url}-${index}`} className="py-2 text-[14px]">
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="no-underline hover:underline">
                <span className="font-mono text-ink break-all">{source.domain}</span>
                {source.title && <span className="ml-2 text-ink-70">{source.title}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultBlock({ engine, result }: { engine: (typeof ENGINES)[number]; result: ResultRow | undefined }) {
  if (!result) {
    return (
      <article className="mt-5 border-t border-hairline pt-5">
        <h3 className="text-[1.0625rem]">{ENGINE_LABELS[engine]}</h3>
        <p className="mt-2 text-[14px] text-ink-50">No answer from this engine in this run, usually because it had no key at the time.</p>
      </article>
    );
  }

  const named = result.mentioned ? (result.position ? `named #${result.position}` : "named") : "not named";

  return (
    <article className="mt-5 border-t border-hairline pt-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[1.0625rem]">{ENGINE_LABELS[engine]}</h3>
        {result.model && <span className="font-mono text-[13px] text-ink-50">{result.model}</span>}
        {result.latencyMs !== null && <span className="text-[13px] text-ink-50">{formatLatency(result.latencyMs)}</span>}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[14px]">
        <Mark on={result.cited}>{result.cited ? "cited" : "not cited"}</Mark>
        <Mark on={result.mentioned}>{named}</Mark>
        {result.competitorDomainsCited.length > 0 && (
          <span className="text-ink-50">
            Competitors cited: <span className="font-mono">{result.competitorDomainsCited.join(", ")}</span>
          </span>
        )}
      </p>

      {result.error ? (
        <Notice tone="error" className="mt-4">
          {scrubKeyLike(result.error)}
        </Notice>
      ) : (
        <>
          <p className="mt-5 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-50">Answer</p>
          {result.rawText ? (
            <div className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{result.rawText}</div>
          ) : (
            <p className="mt-1 text-[14px] text-ink-50">Empty answer.</p>
          )}
          <SourceList title="Cited sources" sources={result.sources} empty="The answer cited no sources." />
          {(engine !== "openai" || result.searchResults.length > 0) && (
            <SourceList title="Search results seen" sources={result.searchResults} empty="No search results recorded." />
          )}
        </>
      )}
    </article>
  );
}

/** Raw answers, cited sources and search results for one run, per prompt and per engine. */
export default async function RunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const license = await getCurrentLicense();
  if (!license) redirect("/activate");

  const { id, runId } = await params;
  const project = await getProject(license.id, id);
  if (!project) notFound();
  const run = await getRun(license.id, id, runId);
  if (!run) notFound();

  const [results, prompts] = await Promise.all([
    listResults(license.id, id, runId),
    listPrompts(license.id, id, { includeArchived: true }),
  ]);

  const promptsById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const resultsByPrompt = new Map<string, ResultRow[]>();
  for (const result of results) {
    const list = resultsByPrompt.get(result.promptId) ?? [];
    list.push(result);
    resultsByPrompt.set(result.promptId, list);
  }
  const orderedPromptIds = [
    ...prompts.filter((prompt) => resultsByPrompt.has(prompt.id)).map((prompt) => prompt.id),
    ...[...resultsByPrompt.keys()].filter((promptId) => !promptsById.has(promptId)),
  ];

  const answered = results.filter((result) => !result.error).length;
  const cited = results.filter((result) => !result.error && result.cited).length;
  const mentioned = results.filter((result) => !result.error && result.mentioned).length;

  return (
    <>
      <AppHeader license={license} />
      <main>
        <PageShell className="py-10 md:py-14">
          <p className="text-[14px] text-ink-50">
            <Link href="/app">Projects</Link> / <Link href={`/app/projects/${project.id}`}>{project.brandName}</Link>
          </p>
          <h1 className="mt-2">Run of {formatDateTime(run.startedAt)}</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-ink-70">
            {RUN_STATUS_LABELS[run.status]}, {run.trigger === "manual" ? "started by hand" : "started by the daily schedule"}.{" "}
            {pluralize(results.length, "answer")} recorded, {answered} without error, {cited} cited {project.domain},{" "}
            {mentioned} named the brand.
          </p>

          {orderedPromptIds.length === 0 && (
            <Notice className="mt-8">This run recorded no answers. If it is still marked running, refresh in a minute.</Notice>
          )}

          {orderedPromptIds.map((promptId) => {
            const prompt = promptsById.get(promptId);
            const rows = resultsByPrompt.get(promptId) ?? [];
            return (
              <section key={promptId} className="mt-12 max-w-3xl">
                <SectionHeading className="text-[1.25rem] md:text-[1.25rem]">
                  {prompt ? prompt.text : "Prompt no longer on file"}
                </SectionHeading>
                {prompt?.archivedAt && <p className="mt-1 text-[13px] text-ink-50">Archived {formatDate(prompt.archivedAt)}</p>}
                {ENGINES.map((engine) => (
                  <ResultBlock key={engine} engine={engine} result={rows.find((row) => row.engine === engine)} />
                ))}
              </section>
            );
          })}
        </PageShell>
      </main>
    </>
  );
}
