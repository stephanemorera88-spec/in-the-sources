import Link from "next/link";
import type { EngineId, RunSummary } from "@/lib/contracts";
import { ENGINES } from "@/lib/contracts";
import { Notice, Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui";
import { ENGINE_LABELS, RUN_STATUS_LABELS, formatDateShort, formatDateTime, formatPercent } from "./format";

/*
 * Citation rate per engine across runs, as an inline SVG line chart (no
 * chart library) with a table below it that carries the same numbers plus
 * the mention rate, and links every run to its detail page. Ink tones and
 * dash patterns tell the three series apart, so the chart reads in
 * grayscale and without color vision.
 */

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 14, right: 16, bottom: 30, left: 44 };
const MAX_RUNS = 30;

const SERIES: Record<EngineId, { className: string; dash?: string }> = {
  openai: { className: "text-ink" },
  anthropic: { className: "text-ink-70", dash: "7 4" },
  gemini: { className: "text-ink-50", dash: "2 4" },
};

function citationRate(run: RunSummary, engine: EngineId): number | null {
  const entry = run.perEngine.find((rate) => rate.engine === engine);
  return entry ? entry.citationRate : null;
}

function mentionRate(run: RunSummary, engine: EngineId): number | null {
  const entry = run.perEngine.find((rate) => rate.engine === engine);
  return entry ? entry.mentionRate : null;
}

export function TrendChart({ trend, projectId }: { trend: RunSummary[]; projectId: string }) {
  if (trend.length === 0) {
    return <Notice>No runs yet. The trend fills in from the first run on.</Notice>;
  }

  const runs = trend.slice(-MAX_RUNS);
  const count = runs.length;
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const xAt = (index: number) => (count === 1 ? PAD.left + innerWidth / 2 : PAD.left + (index * innerWidth) / (count - 1));
  const yAt = (rate: number) => PAD.top + innerHeight - rate * innerHeight;

  const labelIndexes = Array.from(new Set(count <= 2 ? [0, count - 1] : [0, Math.floor((count - 1) / 2), count - 1]));

  const series = ENGINES.map((engine) => {
    const segments: string[] = [];
    let current: string[] = [];
    const points: Array<{ index: number; x: number; y: number; rate: number }> = [];
    runs.forEach((run, index) => {
      const rate = citationRate(run, engine);
      if (rate === null) {
        if (current.length > 0) segments.push(current.join(" "));
        current = [];
        return;
      }
      const x = xAt(index);
      const y = yAt(rate);
      current.push(`${current.length === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
      points.push({ index, x, y, rate });
    });
    if (current.length > 0) segments.push(current.join(" "));
    return { engine, d: segments.join(" "), points };
  });

  const titleId = `trend-title-${projectId}`;
  /* React requires a single string child in <title>; several JSX children render as an empty title. */
  const chartTitle = `Share of answers that cited the site, per engine, across the last ${count} ${count === 1 ? "run" : "runs"}`;
  const pointTitle = (engine: EngineId, index: number, rate: number) =>
    `${ENGINE_LABELS[engine]}, ${formatDateTime(runs[index].startedAt)}: ${formatPercent(rate)} in the sources`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-auto w-full"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>{chartTitle}</title>
        {[0, 0.5, 1].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yAt(value)}
              y2={yAt(value)}
              className={value === 0 ? "stroke-hairline-strong" : "stroke-hairline"}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={yAt(value)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-ink-50"
              fontSize={12}
            >
              {value * 100}%
            </text>
          </g>
        ))}
        {labelIndexes.map((index) => (
          <text
            key={index}
            x={xAt(index)}
            y={HEIGHT - 8}
            textAnchor={count === 1 ? "middle" : index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
            className="fill-ink-50"
            fontSize={12}
          >
            {formatDateShort(runs[index].startedAt)}
          </text>
        ))}
        {series.map((entry) => (
          <g key={entry.engine} className={SERIES[entry.engine].className}>
            {entry.d && (
              <path
                d={entry.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray={SERIES[entry.engine].dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {entry.points.map((point) => (
              <circle key={point.index} cx={point.x} cy={point.y} r={3.5} className="fill-paper" stroke="currentColor" strokeWidth={2}>
                <title>{pointTitle(entry.engine, point.index, point.rate)}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-50">
        {ENGINES.map((engine) => (
          <li key={engine} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden="true" className={SERIES[engine].className}>
              <line x1="0" y1="4" x2="28" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={SERIES[engine].dash} />
            </svg>
            {ENGINE_LABELS[engine]}
          </li>
        ))}
      </ul>

      <Table className="mt-6">
        <Thead>
          <Tr>
            <Th>Run</Th>
            {ENGINES.map((engine) => (
              <Th key={engine}>{ENGINE_LABELS[engine]} in sources / named</Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {[...runs].reverse().map((run) => (
            <Tr key={run.runId}>
              <Td className="whitespace-nowrap">
                <Link href={`/app/projects/${projectId}/runs/${run.runId}`}>{formatDateTime(run.startedAt)}</Link>
                {run.status !== "complete" && <span className="ml-2 text-[13px] text-ink-50">{RUN_STATUS_LABELS[run.status]}</span>}
              </Td>
              {ENGINES.map((engine) => {
                const cited = citationRate(run, engine);
                const named = mentionRate(run, engine);
                return (
                  <Td key={engine} className="whitespace-nowrap tabular-nums">
                    {cited === null && named === null ? (
                      <span className="text-ink-50">no answers</span>
                    ) : (
                      `${formatPercent(cited)} / ${formatPercent(named)}`
                    )}
                  </Td>
                );
              })}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
