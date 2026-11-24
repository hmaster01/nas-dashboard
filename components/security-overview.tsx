import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { AuthMode } from '@/lib/config'

type Props = {
  authMode: AuthMode
  /** Läuft die Docker-Erkennung über den Agent? */
  discovery: boolean
}

const buildControls = ({ authMode, discovery }: Props) => [
  {
    title: 'Restrict dashboard access',
    detail: 'Docker Compose binds the dashboard to localhost. Put an authenticated VPN or TLS reverse proxy in front of it for remote/LAN access.',
    status: 'Localhost bind configured',
    risk: false,
  },
  {
    title: 'Protect system telemetry',
    detail:
      authMode === 'oidc'
        ? 'Pages and API routes require a session from the Authentik login. Services are filtered by the groups of the signed-in user; system values are limited to the admin groups.'
        : 'Pages and API routes require production Basic Auth with a long password. Repeated failures receive temporary 429 throttling; use a trusted proxy for shared rate limits across replicas.',
    status: authMode === 'oidc' ? 'Authentik login and groups' : 'Authentication and throttling',
    risk: false,
  },
  {
    title: 'Reduce container privileges',
    detail: discovery
      ? 'The dashboard container does not share the host PID namespace, drops Linux capabilities, uses a read-only root filesystem, and has no Docker socket mount. Container discovery runs in a separate agent behind a read-only Docker socket proxy.'
      : 'The dashboard container no longer shares the host PID namespace, drops Linux capabilities, uses a read-only root filesystem, and has no Docker socket mount.',
    status: 'Container restricted',
    risk: false,
  },
  {
    title: 'NAS recovery controls',
    detail: 'Confirm NAS encryption, snapshots, isolated backups and restore tests in the NAS administration settings. These are not verified by this dashboard.',
    status: 'Not verified',
    risk: false,
  },
  {
    title: 'Patch and audit',
    detail: 'CI runs frozen install, dependency audit, tests and production build. Keep NAS firmware and container images current; verify backup restores in NAS administration.',
    status: 'CI configured',
    risk: false,
  },
]

export function SecurityOverview(props: Props) {
  const controls = buildControls(props)
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
