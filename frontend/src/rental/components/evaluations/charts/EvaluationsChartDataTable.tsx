interface EvaluationsChartDataTableProps {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, string | number | null>>;
  caption?: string;
}

export function EvaluationsChartDataTable({ columns, rows, caption }: EvaluationsChartDataTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-[10.5px]" role="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border/50 text-left text-muted-foreground">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={col.align === 'right' ? 'px-2 py-1.5 text-right font-semibold' : 'px-2 py-1.5 font-semibold'}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/30 last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={col.align === 'right' ? 'px-2 py-1.5 text-right tabular-nums' : 'px-2 py-1.5'}
                >
                  {row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
