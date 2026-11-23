import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'

const controls = [
  {
    title: 'Restrict dashboard access',
    detail: 'The dashboard is published on every host interface. Bind it to a trusted LAN address or localhost behind an authenticated VPN/reverse proxy.',
    status: 'Review required',
    risk: true,
  },
  {
    title: 'Protect system telemetry',
    detail: 'GET /api/system returns OS, network-interface and traffic-counter details without application authentication. Restrict it at the firewall or authenticated proxy.',
    status: 'Review required',
    risk: true,
  },
  {
    title: 'Reduce container privileges',
    detail: 'The dashboard shares the host PID namespace for metrics. Keep this only if required; do not expose the dashboard publicly.',
    status: 'Host PID namespace',
    risk: true,
  },
  {
    title: 'NAS recovery controls',
    detail: 'Confirm NAS encryption, snapshots, isolated backups and restore tests in the NAS administration settings. These are not verified by this dashboard.',
    status: 'Not verified',
    risk: false,
  },
  {
    title: 'Patch and audit',
    detail: 'Keep NAS firmware and container images current. CI runs a frozen install, pnpm audit, tests and production build on pushes and pull requests to main.',
    status: 'CI configured',
    risk: false,
  },
]

export function SecurityOverview() {
  const reviewCount = controls.filter((control) => control.risk).length

  return (
    <section aria-labelledby="security-overview-title" className="mt-8 rounded-3xl bg-white/4 p-5 ring-1 ring-white/10 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-400/10 ring-1 ring-amber-300/20">
          <ShieldCheck className="size-5 text-amber-200" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="security-overview-title" className="text-[15px] font-semibold tracking-tight text-white">NAS-Sicherheit</h2>
            <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-amber-100 ring-1 ring-amber-300/20">
              {reviewCount} Punkte prüfen
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">Praktische Hinweise zu diesem Dashboard und deinem NAS. Externe NAS-Einstellungen werden hier nicht automatisch geprüft.</p>
        </div>
      </div>

      <ul className="mt-5 divide-y divide-white/8">
        {controls.map((control) => (
          <li key={control.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {control.risk ? <AlertTriangle className="size-4 text-amber-200/80" /> : <CheckCircle2 className="size-4 text-sky-200/70" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[13px] font-medium text-white/85">{control.title}</h3>
                <span className={`text-[10px] uppercase tracking-wider ${control.risk ? 'text-amber-100/70' : 'text-white/35'}`}>{control.status}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-white/45">{control.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
