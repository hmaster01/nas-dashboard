# NAS-Dashboard

Startseite für dein NAS. Nach dem Login zeigt sie die Programme, die gerade auf dem NAS laufen — automatisch,
ohne dass du eine Liste pflegst. Admins sehen zusätzlich die echten Systemwerte (CPU, RAM, Platten, Netzwerk,
Temperatur, Uptime).

- **Dienste erkennt es selbst.** Ein Docker-Container erscheint, sobald er das Label `dashboard.name` trägt.
  Der Status (Online / Eingeschränkt / Offline) kommt vom echten Container-Zustand.
- **Pro Person sichtbar, was sie sehen darf** (optional, mit Authentik): Das Label `dashboard.groups` legt fest,
  welche Gruppen einen Dienst sehen.
- **Aktualisieren heißt: ein Befehl.** Das Image baut GitHub Actions, das NAS lädt es nur noch herunter.

```
./scripts/update.sh
```

## Zwei Betriebsarten

| | Anmeldung | Dienste |
|---|---|---|
| **Einfach** (Standard) | Basic-Auth, ein gemeinsames Konto | feste Liste aus `lib/dashboard-data.ts`, Status „unbekannt“ |
| **Mit Docker-Erkennung** | wie links, oder Authentik | automatisch aus den Container-Labels, echter Status |

Anmeldung und Docker-Erkennung sind unabhängig voneinander: Du kannst Basic-Auth mit Erkennung nutzen oder
Authentik ohne Erkennung.

## Erste Installation

Voraussetzung: Docker mit Compose-Plugin (bei OpenMediaVault über das `omv-extras`-Docker-Plugin).

```sh
git clone https://github.com/hmaster01/nas-dashboard.git
cd nas-dashboard
cp .env.example .env && chmod 600 .env
openssl rand -base64 24        # Ausgabe als DASHBOARD_PASSWORD in die .env
nano .env
docker compose up -d
```

Das Dashboard lauscht nur auf `127.0.0.1:3000`. Für den Zugriff aus dem Heimnetz stellst du einen Reverse-Proxy
davor (z. B. Nginx Proxy Manager, Ziel `http://127.0.0.1:3000`, Zertifikat aktivieren). Direkt ins Internet
gehört es nicht.

**Image von GitHub:** Die Compose-Datei zieht `ghcr.io/hmaster01/nas-dashboard`. Nach dem ersten erfolgreichen
Lauf der Action (Reiter *Actions* im Repo) muss das Paket einmal öffentlich gestellt werden: GitHub → dein Profil →
*Packages* → `nas-dashboard` → *Package settings* → *Change visibility* → *Public*. Bleibt es privat, geht auch
`docker login ghcr.io` mit einem Token, das nur `read:packages` darf.

## Aktualisieren

```sh
cd nas-dashboard
./scripts/update.sh
```

Das Skript holt neue Compose-Dateien (`git pull --ff-only`), lädt das neue Image, startet nur geänderte Container
neu und räumt alte Images weg. Deine `.env` und `config/services.json` bleiben unberührt.

Das Image wird bei jedem Push auf `main` und zusätzlich einmal pro Woche neu gebaut (Sicherheitsupdates des
Basis-Images). Dependabot schlägt Updates für Abhängigkeiten, das Dockerfile und die Actions als Pull Requests vor.
Wer eine bestimmte Version festhalten will, setzt in der `.env` `DASHBOARD_TAG=sha-<kurzer Commit>`.

## Docker-Erkennung einschalten

1. Auf der Datenplatte einen **leeren** Ordner anlegen, der nur zum Messen der Füllung dient:
   ```sh
   mkdir /srv/dev-disk-by-uuid-XXXX/.dashboard-probe
   ```
2. In der `.env` eintragen:
   ```
   COMPOSE_FILE=docker-compose.yml:docker-compose.discovery.yml
   AGENT_TOKEN=<openssl rand -hex 32>
   DATA_DISK_PROBE=/srv/dev-disk-by-uuid-XXXX/.dashboard-probe
   ```
3. `./scripts/update.sh` (oder `docker compose up -d`).
4. Den Containern, die erscheinen sollen, Labels geben (in deren Compose-Datei, in Portainer unter *Labels* oder
   bei `docker run` mit `--label`):

```yaml
services:
  jellyfin:
    labels:
      dashboard.name: "Jellyfin"            # Pflicht — ohne dieses Label bleibt der Container unsichtbar
      dashboard.description: "Filme und Serien"
      dashboard.port: "8096"                # Link = Adresse, unter der du das Dashboard aufrufst + Port
      dashboard.icon: "play"
      dashboard.groups: "familie,authentik Admins"
      dashboard.keywords: "film,serie,musik"
```

| Label | Bedeutung |
|---|---|
| `dashboard.name` | Anzeigename. **Pflicht.** |
| `dashboard.description` | Kurzbeschreibung unter dem Namen. |
| `dashboard.url` | Feste Adresse, z. B. `https://jellyfin.home.arpa`. Hat Vorrang vor `port`. |
| `dashboard.port` | Port; der Link nimmt den Host, unter dem du das Dashboard gerade aufrufst. |
| `dashboard.protocol` | `http` (Standard) oder `https`, nur zusammen mit `port`. |
| `dashboard.icon` | `box`, `boxes`, `server`, `database`, `globe`, `play`, `file`, `shield`, `home`. |
| `dashboard.groups` | Kommagetrennte Gruppen, die den Dienst sehen. Leer = alle angemeldeten Personen. |
| `dashboard.keywords` | Zusätzliche Suchbegriffe für die Suche im Dashboard. |

Dienste, die nicht in Docker laufen (z. B. die OpenMediaVault-Oberfläche), trägst du in `config/services.json`
ein. Als Vorlage dient `config/services.example.json`; die Datei ist per `.gitignore` vom Repo ausgeschlossen.

## Anmeldung über Authentik (optional)

Ohne diese Einstellungen gilt Basic-Auth. Sobald `OIDC_ISSUER` gesetzt ist, gilt Authentik.

1. In Authentik: *Applications → Create with Provider*, Typ **OAuth2/OpenID**.
   - Client-Typ *Confidential*, Redirect-URI (strikt): `https://dashboard.home.arpa/api/auth/callback`
   - Scopes: `openid`, `profile`, `email`. Die Gruppen holt das Dashboard über den Userinfo-Endpunkt.
2. In der `.env`:
   ```
   OIDC_ISSUER=https://auth.home.arpa/application/o/nas-dashboard/
   OIDC_CLIENT_ID=...
   OIDC_CLIENT_SECRET=...
   PUBLIC_URL=https://dashboard.home.arpa
   SESSION_SECRET=<openssl rand -hex 32>
   ADMIN_GROUPS=authentik Admins
   ```
3. `docker compose up -d`.

Wer in `ADMIN_GROUPS` steht, sieht die Systemwerte und alle Dienste. Alle anderen sehen nur Dienste, deren
`dashboard.groups` zu einer ihrer Gruppen passt (oder die kein `dashboard.groups` haben). Gruppenänderungen gelten
nach dem nächsten Login, spätestens nach 8 Stunden. Fehlt eine Einstellung, lässt das Dashboard niemanden herein
und nennt auf der Login-Seite, was fehlt. Hat Authentik ein selbst signiertes Zertifikat, lege es als
`config/ca.pem` ab und setze `NODE_EXTRA_CA_CERTS=/config/ca.pem`.

## Aufbau und Schutz

```
Browser ──HTTPS──> Reverse-Proxy ──> dashboard (Next.js, isoliert, 127.0.0.1:3000)
                                        │  Unix-Socket im gemeinsamen Volume + Token
                                        ▼
                                      agent (Host-Netz, kein offener Port)
                                        │  127.0.0.1
                                        ▼
                                      socket-proxy ──> /var/run/docker.sock (nur Container-Liste lesen)
```

| Geschützt | Wie |
|---|---|
| Zugang | Basic-Auth (Passwort ≥ 24 Zeichen) oder Authentik mit PKCE; Sitzungscookie `HttpOnly`, `SameSite=Lax`, bei HTTPS `Secure` und `__Host-` |
| Systemwerte | Nur Admins; die API prüft das, nicht nur die Anzeige |
| Agent | Kein TCP-Port, nur ein Unix-Socket (Rechte 0660) mit Token; gibt nur `dashboard.*`-Labels weiter, nie Umgebungsvariablen |
| Docker | Nur über den Socket-Proxy, der ausschließlich die Container-Liste lesen darf |
| Container | Nicht-root, `read_only`, `cap_drop: ALL`, `no-new-privileges`; das Dashboard bekommt **nie** den Docker-Socket |
| Fehlende Einstellungen | Das Dashboard startet nicht offen, sondern verweigert den Zugang |

**Wichtig:** Ausblenden im Dashboard ersetzt keinen Zugriffsschutz. Wer die Adresse eines Dienstes kennt, kommt
trotzdem hin, sofern der Dienst nicht selbst geschützt ist (eigenes Login oder Authentik-Forward-Auth). Die
Labels steuern nur, welche Kacheln jemand sieht.

## Fehlersuche

| Symptom | Ursache / Lösung |
|---|---|
| Seite antwortet mit Fehler 503 | `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` fehlen oder das Passwort ist kürzer als 24 Zeichen. Das Dashboard bleibt dann absichtlich zu. |
| Login-Seite listet fehlende Einstellungen | Authentik-Modus: die genannten Variablen in der `.env` ergänzen. |
| `docker compose pull` meldet „denied“ | Paket ist noch privat: siehe *Image von GitHub*. |
| Dienste-Liste zeigt „Zustand wird nicht überwacht“ | Docker-Erkennung ist nicht eingeschaltet (`COMPOSE_FILE` in der `.env`). |
| Hinweis „Docker-Erkennung nicht verfügbar (Agent nicht erreichbar)“ | `docker compose ps`: läuft `nas-dashboard-agent`? `docker compose logs agent` zeigt den Grund (z. B. falscher `AGENT_TOKEN`). |
| Ein Container fehlt in der Liste | Label `dashboard.name` fehlt oder die Gruppe des Nutzers passt nicht zu `dashboard.groups`. |
| Link öffnet falsche Adresse | `dashboard.url` setzen, oder `dashboard.port` prüfen. |
| Platte zeigt falsche Füllung | `DATA_DISK_PROBE` muss auf einem Ordner **der Datenplatte** liegen, nicht auf der Systemplatte. |

## Entwicklung

```sh
pnpm install --frozen-lockfile
pnpm test        # Node-Testrunner, ohne zusätzliche Pakete (Node 22 oder neuer)
pnpm dev
```
