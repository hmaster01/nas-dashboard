import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  CirclePlay,
  Cpu,
  FileText,
  HardDrive,
  HousePlug,
  MemoryStick,
  Network,
  ShieldCheck,
} from 'lucide-react'

/** A single label/value pair inside a modal detail group. */
export type DetailRow = {
  label: string
  value: string
  /** Optional 0–100 value: renders a thin progress track under the row. */
  percent?: number
}

/** A titled group of rows inside a modal. */
export type DetailGroup = {
  title: string
  rows: DetailRow[]
}

export type MetricId = 'cpu' | 'ram' | 'storage' | 'network'

export type SystemMetric = {
  id: MetricId
  icon: LucideIcon
  /** Short label shown in the status bar. */
  label: string
  /** Primary readout, e.g. "18 %". */
  value: string
  /** Secondary readout, e.g. "8 Kerne · 3.4 GHz". */
  caption: string
  /** 0–100, drives the bar in the status bar. */
  percent: number
  /** When true the status bar animates this readout as live traffic. */
  live?: boolean
  modalTitle: string
  modalSubtitle: string
  groups: DetailGroup[]
}

export type ServiceStatus = 'online' | 'degraded' | 'offline'

export type Service = {
  id: string
  icon: LucideIcon
  name: string
  description: string
  status: ServiceStatus
  /** Direct link to the running service. */
  url: string
  /** Short line under the modal title. */
  tagline: string
  /** Extra terms the spotlight search should match against. */
  keywords: string[]
  groups: DetailGroup[]
}

export const SYSTEM_METRICS: SystemMetric[] = [
  {
    id: 'cpu',
    icon: Cpu,
    label: 'CPU',
    value: '18 %',
    caption: 'Lädt Live-Daten …',
    percent: 18,
    modalTitle: 'Prozessor',
    modalSubtitle: 'Intel Core i5-12500T · 8 Threads',
    groups: [
      {
        title: 'Kern-Auslastung',
        rows: [
          { label: 'Kern 1', value: '24 %', percent: 24 },
          { label: 'Kern 2', value: '12 %', percent: 12 },
          { label: 'Kern 3', value: '31 %', percent: 31 },
          { label: 'Kern 4', value: '9 %', percent: 9 },
          { label: 'Kern 5', value: '17 %', percent: 17 },
          { label: 'Kern 6', value: '14 %', percent: 14 },
        ],
      },
      {
        title: 'Thermik & Last',
        rows: [
          { label: 'Package-Temperatur', value: '42 °C' },
          { label: 'Lüfterdrehzahl', value: '870 rpm' },
          { label: 'Load Average', value: '0.42 / 0.38 / 0.31' },
          { label: 'Taktfrequenz', value: '3.42 GHz' },
        ],
      },
    ],
  },
  {
    id: 'ram',
    icon: MemoryStick,
    label: 'RAM',
    value: '9.2 / 32 GB',
    caption: 'Lädt Live-Daten …',
    percent: 29,
    modalTitle: 'Arbeitsspeicher',
    modalSubtitle: '32 GB DDR4 · 2 × 16 GB Dual Channel',
    groups: [
      {
        title: 'Belegung',
        rows: [
          { label: 'Aktiv genutzt', value: '9.2 GB', percent: 29 },
          { label: 'Cache & Puffer', value: '6.8 GB', percent: 21 },
          { label: 'Verfügbar', value: '22.8 GB', percent: 71 },
        ],
      },
      {
        title: 'Swap & Top-Prozesse',
        rows: [
          { label: 'Swap', value: '0.4 / 8 GB', percent: 5 },
          { label: 'jellyfin', value: '2.1 GB' },
          { label: 'paperless-ngx', value: '1.4 GB' },
          { label: 'postgres', value: '0.9 GB' },
        ],
      },
    ],
  },
  {
    id: 'storage',
    icon: HardDrive,
    label: 'Speicher',
    value: '4.1 TB frei',
    caption: 'Lädt Live-Daten …',
    percent: 49,
    modalTitle: 'Massenspeicher',
    modalSubtitle: '2 × 8 TB HDD im RAID 1 · 1 TB NVMe Cache',
    groups: [
      {
        title: 'Partitionen',
        rows: [
          { label: '/ (System, NVMe)', value: '84 / 512 GB', percent: 16 },
          { label: '/mnt/media', value: '2.9 / 5.0 TB', percent: 58 },
          { label: '/mnt/documents', value: '310 GB / 1.5 TB', percent: 21 },
          { label: '/mnt/backups', value: '640 GB / 1.5 TB', percent: 43 },
        ],
      },
      {
        title: 'Zustand',
        rows: [
          { label: 'RAID-Status', value: 'Synchron' },
          { label: 'SMART', value: 'Fehlerfrei' },
          { label: 'Laufwerkstemperatur', value: '36 °C' },
          { label: 'Letztes Scrub', value: 'vor 6 Tagen' },
        ],
      },
    ],
  },
  {
    id: 'network',
    icon: Network,
    label: 'Netzwerk',
    value: '0.0 Mbit/s',
    caption: 'Lädt Live-Daten …',
    percent: 0,
    live: true,
    modalTitle: 'Netzwerk',
    modalSubtitle: '2.5 GbE · enp3s0 · 192.168.178.75',
    groups: [
      {
        title: 'Durchsatz',
        rows: [
          { label: 'Download', value: '48.2 Mbit/s', percent: 32 },
          { label: 'Upload', value: '6.4 Mbit/s', percent: 11 },
          { label: 'Spitze (24 h)', value: '412 Mbit/s' },
          { label: 'Latenz zum Gateway', value: '0.8 ms' },
        ],
      },
      {
        title: 'Verbindung',
        rows: [
          { label: 'Aktive Verbindungen', value: '186' },
          { label: 'Transfer heute', value: '84.6 GB ↓ · 11.2 GB ↑' },
          { label: 'VPN (WireGuard)', value: '2 Peers verbunden' },
          { label: 'Paketverluste', value: '0.00 %' },
        ],
      },
    ],
  },
]

export const SERVICES: Service[] = [
  {
    id: 'portainer',
    icon: Boxes,
    name: 'Portainer',
    description: 'Container Management',
    status: 'online',
    url: 'https://192.168.178.75:9443/',
    tagline: 'Container-Verwaltung · Port 9443',
    keywords: ['docker', 'container', 'images', 'stacks', 'compose'],
    groups: [
      {
        title: 'Container',
        rows: [
          { label: 'Laufend', value: '14' },
          { label: 'Gestoppt', value: '2' },
          { label: 'Images', value: '23 · 8.4 GB' },
          { label: 'Volumes', value: '11' },
        ],
      },
      {
        title: 'Dienst',
        rows: [
          { label: 'Version', value: '2.21.4 CE' },
          { label: 'Laufzeit', value: '18 Tage' },
          { label: 'Interner Port', value: '9443 (HTTPS)' },
          { label: 'CPU-Anteil', value: '1.2 %', percent: 12 },
          { label: 'Speicher', value: '186 MB' },
        ],
      },
    ],
  },
  {
    id: 'jellyfin',
    icon: CirclePlay,
    name: 'Jellyfin',
    description: 'Medien & Streaming',
    status: 'online',
    url: 'http://192.168.178.75:8096/',
    tagline: 'Medienserver · Port 8096',
    keywords: ['filme', 'serien', 'musik', 'streaming', 'media', 'kino'],
    groups: [
      {
        title: 'Bibliothek',
        rows: [
          { label: 'Filme', value: '412' },
          { label: 'Serien', value: '38 · 1 204 Folgen' },
          { label: 'Musik', value: '6 830 Titel' },
          { label: 'Belegter Platz', value: '2.9 TB' },
        ],
      },
      {
        title: 'Wiedergabe',
        rows: [
          { label: 'Aktive Streams', value: '1' },
          { label: 'Transcoding', value: 'Hardware (QSV)' },
          { label: 'Bandbreite', value: '18 Mbit/s' },
          { label: 'Version', value: '10.9.11' },
          { label: 'Laufzeit', value: '11 Tage' },
          { label: 'Interner Port', value: '8096 (HTTP)' },
        ],
      },
    ],
  },
  {
    id: 'paperless',
    icon: FileText,
    name: 'Paperless-ngx',
    description: 'Dokumentenarchiv',
    status: 'online',
    url: 'http://192.168.178.75:8000/',
    tagline: 'Dokumentenarchiv · Port 8000',
    keywords: ['dokumente', 'scan', 'ocr', 'archiv', 'rechnungen', 'papier'],
    groups: [
      {
        title: 'Archiv',
        rows: [
          { label: 'Dokumente', value: '3 128' },
          { label: 'Korrespondenten', value: '96' },
          { label: 'Tags', value: '42' },
          { label: 'Posteingang', value: '7 unbearbeitet' },
        ],
      },
      {
        title: 'Verarbeitung',
        rows: [
          { label: 'OCR-Warteschlange', value: 'Leer' },
          { label: 'Letzter Import', value: 'vor 2 Stunden' },
          { label: 'Index', value: 'Aktuell' },
          { label: 'Version', value: '2.13.5' },
          { label: 'Laufzeit', value: '18 Tage' },
          { label: 'Interner Port', value: '8000 (HTTP)' },
        ],
      },
    ],
  },
  {
    id: 'vaultwarden',
    icon: ShieldCheck,
    name: 'Vaultwarden',
    description: 'Passwortmanager',
    status: 'online',
    url: 'http://192.168.178.75:8080/',
    tagline: 'Passwort-Tresor · Port 8080',
    keywords: ['passwort', 'bitwarden', 'tresor', 'vault', 'sicherheit', '2fa'],
    groups: [
      {
        title: 'Tresor',
        rows: [
          { label: 'Einträge', value: '284' },
          { label: 'Benutzer', value: '3' },
          { label: 'Organisationen', value: '1' },
          { label: 'Anhänge', value: '46 MB' },
        ],
      },
      {
        title: 'Sicherheit',
        rows: [
          { label: 'Zwei-Faktor', value: 'Aktiv (TOTP)' },
          { label: 'Registrierung', value: 'Gesperrt' },
          { label: 'Letztes Backup', value: 'heute, 04:00' },
          { label: 'Version', value: '1.32.5' },
          { label: 'Laufzeit', value: '18 Tage' },
          { label: 'Interner Port', value: '8080 (HTTP)' },
        ],
      },
    ],
  },
  {
    id: 'homeassistant',
    icon: HousePlug,
    name: 'Home Assistant',
    description: 'Smart-Home-Zentrale',
    status: 'online',
    url: 'http://192.168.178.75:8123/',
    tagline: 'Smart-Home-Zentrale · Port 8123',
    keywords: ['smart home', 'automation', 'zigbee', 'sensoren', 'lampen', 'heizung'],
    groups: [
      {
        title: 'Geräte',
        rows: [
          { label: 'Entitäten', value: '412' },
          { label: 'Aktive Geräte', value: '68' },
          { label: 'Automationen', value: '34' },
          { label: 'Nicht erreichbar', value: '1 (Balkonsensor)' },
        ],
      },
      {
        title: 'Betrieb',
        rows: [
          { label: 'Zigbee-Koordinator', value: 'Online · 41 Knoten' },
          { label: 'Datenbankgröße', value: '1.2 GB' },
          { label: 'Letzter Neustart', value: 'vor 6 Tagen' },
          { label: 'Version', value: '2025.8.2' },
          { label: 'Laufzeit', value: '6 Tage' },
          { label: 'Interner Port', value: '8123 (HTTP)' },
        ],
      },
    ],
  },
]
