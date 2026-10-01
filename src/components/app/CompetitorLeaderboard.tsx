import type { CompetitorRow } from "@/lib/contracts";
import { Notice, Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui";

function Mark({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-full border border-hairline-strong px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em] text-ink-70">
      {children}
    </span>
  );
}

/** Domains cited in the latest run, most cited first, with a mark for the project domain and named competitors. */
export function CompetitorLeaderboard({ rows }: { rows: CompetitorRow[] }) {
  if (rows.length === 0) {
    return <Notice>No cited domains yet. After a run, every domain the engines cited shows up here, yours included.</Notice>;
  }

  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="w-10">#</Th>
          <Th>Domain</Th>
          <Th className="text-right">Citations</Th>
          <Th>
            <span className="sr-only">Who</span>
          </Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row, index) => (
          <Tr key={row.domain}>
            <Td className="text-ink-50 tabular-nums">{index + 1}</Td>
            <Td className="font-mono text-[14px] break-all">{row.domain}</Td>
            <Td className="text-right tabular-nums">{row.citations}</Td>
            <Td className="whitespace-nowrap">
              {row.isUs ? <Mark>you</Mark> : row.isNamedCompetitor ? <Mark>named competitor</Mark> : null}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
