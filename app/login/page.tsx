import { redirect } from 'next/navigation'
import { getAuth } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

// Nur feste Texte — der Wert aus der Adresszeile wird nie direkt angezeigt.
const MESSAGES: Record<string, string> = {
  config: 'Das Dashboard ist noch nicht vollständig eingerichtet.',
  state: 'Die Anmeldung ist abgelaufen oder wurde unterbrochen. Bitte erneut versuchen.',
  denied: 'Die Anmeldung wurde abgebrochen oder abgelehnt.',
  failed: 'Die Anmeldung ist fehlgeschlagen. Der Anmeldedienst hat nicht wie erwartet geantwortet.',
  idp: 'Der Anmeldedienst ist nicht erreichbar.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const auth = await getAuth()
  // Mit Basic-Auth gibt es keine eigene Anmeldeseite — der Browser fragt selbst nach den Zugangsdaten.
  if (auth.session || auth.config?.authMode === 'basic') redirect('/')

  const { error } = await searchParams
  const code = Array.isArray(error) ? error[0] : error
  const message = code && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : null

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-[#08090b] px-4 font-sans text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-sky-500/8 blur-[120px]"
      />

      <main className="relative w-full max-w-sm rounded-3xl bg-white/4 p-8 ring-1 ring-white/10 backdrop-blur-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Home Server</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-white/45">Melde dich an, um deine Dienste zu sehen.</p>

        {message ? (
          <p role="alert" className="mt-5 rounded-2xl bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/90 ring-1 ring-amber-300/15">
            {message}
          </p>
        ) : null}

        {auth.config ? (
          // Bewusst ein normaler Link: Die Route leitet zu Authentik weiter und darf nicht vorab geladen werden.
          <a
            href="/api/auth/login"
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-2.5 text-[14px] font-medium text-black transition-colors duration-300 hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:outline-none"
          >
            Mit Authentik anmelden
          </a>
        ) : (
          <div className="mt-6 text-[13px] leading-relaxed text-white/55">
            <p>Es fehlen Einstellungen in der <code className="font-mono text-white/80">.env</code>:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {auth.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
