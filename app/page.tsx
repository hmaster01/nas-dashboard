import { GreetingClock } from '@/components/greeting-clock'
import { SecurityOverview } from '@/components/security-overview'
import { ServiceGrid } from '@/components/service-grid'
import { SystemStatusBar } from '@/components/system-status-bar'
import { SERVICES } from '@/lib/dashboard-data'

export default function Page() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[#08090b] font-sans text-white">
      {/* soft ambient light, kept very low contrast */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-sky-500/8 blur-[120px]"
      />

      <div className="relative mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 pb-16 sm:px-6">
        <SystemStatusBar />

        <main className="flex flex-1 flex-col justify-center gap-9 py-12">
          <GreetingClock />
          <ServiceGrid />
          <SecurityOverview />
        </main>

        <footer className="flex items-center justify-between gap-4 border-t border-white/8 pt-6">
          <p className="text-[11px] text-white/30">Lokales Netzwerk · 192.168.178.75</p>
          <p className="font-mono text-[11px] tabular-nums text-white/30">{SERVICES.length} Dienste</p>
        </footer>
      </div>
    </div>
  )
}
