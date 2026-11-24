import type { LucideIcon } from 'lucide-react'
import { Boxes, CirclePlay, FileText, Globe, HardDrive, HousePlug, Network, ShieldCheck } from 'lucide-react'
import type { IconKey } from '@/lib/services'

/**
 * Die Schlüssel stammen aus dashboard.icon (siehe lib/services.ts, ICON_KEYS).
 * Es sind bewusst nur Icons, die das Dashboard ohnehin schon verwendet.
 */
export const SERVICE_ICONS: Record<IconKey, LucideIcon> = {
  box: Boxes,
  boxes: Boxes,
  server: Network,
  database: HardDrive,
  globe: Globe,
  play: CirclePlay,
  file: FileText,
  shield: ShieldCheck,
  home: HousePlug,
}

export function iconComponent(key: string): LucideIcon {
  return (SERVICE_ICONS as Record<string, LucideIcon>)[key] ?? Boxes
}
