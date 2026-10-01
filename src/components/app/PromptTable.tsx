import type { PromptCell, PromptRow } from "@/lib/contracts";
import { ENGINES } from "@/lib/contracts";
import { Notice, Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui";
import { ENGINE_LABELS, scrubKeyLike } from "./format";

/** Two marks per cell: cited yes/no, named yes/no with the list position when there is one. */
function CellMarks({ cell }: { cell: PromptCell | undefined }) {
  if (!cell) return <span className="text-ink-50">no result</span>;
  if (cell.error) {
    return (
      <span className="cursor-help text-ink-50 underline decoration-dotted underline-offset-[0.15em]" title={scrubKeyLike(cell.error)}>
        error
      </span>
    );
  }
  const named = cell.mentioned ? (cell.position ? `named #${cell.position}` : "named") : "not named";
  return (
    <span className="flex flex-col gap-0.5 text-[14px]">
      <span className={cell.cited ? "text-ink" : "text-ink-50"}>{cell.cited ? "cited" : "not cited"}</span>
      <span className={cell.mentioned ? "text-ink" : "text-ink-50"}>{named}</span>
    </span>
  );
}

/** Prompt text plus one column per engine, from the latest run. */
export function PromptTable({ rows }: { rows: PromptRow[] }) {
  if (rows.length === 0) {
    return <Notice>No answers recorded yet. The table fills in after the first run.</Notice>;
  }

  return (
    <Table>
      <Thead>
        <Tr>
          <Th className="min-w-[240px]">Prompt</Th>
          {ENGINES.map((engine) => (
            <Th key={engine} className="min-w-[110px]">
              {ENGINE_LABELS[engine]}
            </Th>
          ))}
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((row) => (
          <Tr key={row.promptId}>
            <Td className="max-w-[520px] text-[15px]">{row.text}</Td>
            {ENGINES.map((engine) => (
              <Td key={engine} className="whitespace-nowrap">
                <CellMarks cell={row.perEngine[engine]} />
              </Td>
            ))}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
