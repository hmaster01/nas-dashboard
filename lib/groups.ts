/**
 * Gruppenlogik: wer darf welchen Dienst sehen?
 *
 * - Ein Dienst ohne Gruppen (oder mit "*") ist für jeden angemeldeten Nutzer sichtbar.
 * - Sonst muss der Nutzer in mindestens einer der Gruppen sein.
 * - Admin-Gruppen (ADMIN_GROUPS) sehen alles.
 *
 * Wichtig: Das ist nur die Anzeige. Der Zugriff auf den Dienst selbst muss
 * zusätzlich in Authentik (bzw. im Dienst) geschützt sein.
 */

const normalize = (value: string) => value.trim().toLowerCase()

/** "a, b ,,c" -> ["a", "b", "c"] */
export function splitList(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function isAdminUser(userGroups: string[], adminGroups: string[]): boolean {
  const admins = new Set(adminGroups.map(normalize))
  return userGroups.some((group) => admins.has(normalize(group)))
}

export function canSee(serviceGroups: string[], userGroups: string[], adminGroups: string[]): boolean {
  if (serviceGroups.length === 0 || serviceGroups.some((group) => group.trim() === '*')) return true
  if (isAdminUser(userGroups, adminGroups)) return true

  const allowed = new Set(serviceGroups.map(normalize))
  return userGroups.some((group) => allowed.has(normalize(group)))
}
