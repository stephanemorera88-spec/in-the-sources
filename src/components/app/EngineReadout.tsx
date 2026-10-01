import type { RunSummary } from "@/lib/contracts";
import { ENGINES } from "@/lib/contracts";
import { Notice, cx } from "@/components/ui";
import { ENGINE_LABELS, formatPercent } from "./format";

/**
 * Per-engine readout for the latest run: three hairline columns (stacked
 * rows at phone width). The lead number is the citation rate, "In the
 * sources"; the mention rate is "Named".
 */
export function EngineReadout({ latestRun }: { latestRun: RunSummary | null }) {
  if (!latestRun) {
    return <Notice>No runs yet. Add prompts below, then press Run now.</Notice>;
  }

  return (
    <ul className="grid grid-cols-1 border-y border-hairline md:grid-cols-3">
      {ENGINES.map((engine, index) => {
        const rate = latestRun.perEngine.find((entry) => entry.engine === engine);
        const answered = rate?.answered ?? 0;
        return (
          <li
            key={engine}
            className={cx(
              "py-5",
              index > 0 && "border-t border-hairline md:border-t-0 md:border-l md:pl-6",
              index < ENGINES.length - 1 && "md:pr-6"
            )}
          >
            <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-50">{ENGINE_LABELS[engine]}</p>
            <p className="mt-3 text-[15px] text-ink-70">In the sources</p>
            {answered > 0 && rate ? (
              <>
                <p className="mt-1 font-serif text-[2.75rem] leading-none tracking-[-0.025em] text-ink tabular-nums">
                  {formatPercent(rate.citationRate)}
                </p>
                <p className="mt-2 text-[14px] text-ink-50">
                  {rate.cited} of {answered} answers cited the site
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 font-serif text-[1.5rem] leading-none tracking-[-0.025em] text-ink-50">No answers</p>
                <p className="mt-2 text-[14px] text-ink-50">
                  {rate ? "Every call to this engine failed in this run." : "No key for this engine when the run started."}
                </p>
              </>
            )}
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              <dt className="text-ink-70">Named</dt>
              <dd className="tabular-nums">{answered > 0 && rate ? formatPercent(rate.mentionRate) : "n/a"}</dd>
              <dt className="text-ink-70">Answered</dt>
              <dd className="tabular-nums">{answered}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
