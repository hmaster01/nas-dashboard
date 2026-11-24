import type { DetailGroup } from '@/lib/types'

/** Renders titled groups of label/value rows, with an optional thin meter per row. */
export function DetailGroups({ groups }: { groups: DetailGroup[] }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="text-[11px] font-medium tracking-[0.14em] text-white/35 uppercase">{group.title}</h3>

          <div className="flex flex-col gap-2.5 rounded-2xl bg-white/4 p-4 ring-1 ring-white/8">
            {group.rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="shrink-0 truncate text-[13px] text-white/60">{row.label}</span>
                  <span
                    title={row.value}
                    className="min-w-0 truncate text-right font-mono text-[13px] tabular-nums text-white/90"
                  >
                    {row.value}
                  </span>
                </div>

                {typeof row.percent === 'number' ? (
                  <div className="h-[3px] overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400/70 to-sky-300 transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
