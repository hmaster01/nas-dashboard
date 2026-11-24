import { redirect } from 'next/navigation'
import { DeviceAddress } from '@/components/device-address'
import { GreetingClock } from '@/components/greeting-clock'
import { SecurityOverview } from '@/components/security-overview'
import { ServiceGrid } from '@/components/service-grid'
import { SystemStatusBar } from '@/components/system-status-bar'
import { getPanels } from '@/lib/panels'
import { getAuth } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { config, session, isAdmin } = await getAuth()
  if (!config || !session) redirect('/login')

  const oidc = config.authMode === 'oidc'

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#08090b] font-sans text-white">
      {/* soft ambient light, kept very low contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-sky-500/8 blur-[120px]"
      />

      <div className="relative mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 pb-16 sm:px-6">
        {/* Systemwerte nur für Admins; die API prüft das zusätzlich. */}
        {isAdmin ? <SystemStatusBar panels={getPanels()} /> : <div className="h-10" />}

        <main className="flex flex-1 flex-col justify-center gap-9 py-12">
          {/* Mit Basic-Auth gibt es nur ein Konto ohne Namen — dann ohne persönliche Anrede. */}
          <GreetingClock name={oidc ? session.name : ''} />
          <ServiceGrid />
          {isAdmin ? <SecurityOverview authMode={config.authMode} discovery={config.agent !== null} /> : null}
        </main>

        <footer className="flex items-center justify-between gap-4 border-t border-white/8 pt-6">
          <DeviceAddress />
          {oidc ? (
            <div className="flex min-w-0 items-center gap-3">
              <p className="min-w-0 truncate text-[11px] text-white/30">Angemeldet als {session.name}</p>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-full px-3 py-1.5 text-[11px] text-white/45 ring-1 ring-white/10 transition-colors duration-300 hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
                >
                  Abmelden
                </button>
              </form>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
