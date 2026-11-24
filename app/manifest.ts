import type { MetadataRoute } from 'next'

// Macht das Dashboard als App installierbar ("Zum Startbildschirm hinzufügen"). Funktioniert nur über HTTPS
// (z. B. hinter dem Reverse-Proxy) oder über localhost. Es gibt bewusst keinen Service Worker: Es wird nichts
// zwischengespeichert, angemeldete Inhalte bleiben also nie offline liegen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home Server · Dashboard',
    short_name: 'NAS',
    description: 'Zentrales Dashboard für die Dienste auf deinem NAS.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'de',
    background_color: '#08090b',
    theme_color: '#08090b',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
