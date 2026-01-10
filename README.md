Instalare dependințe
===================
npm i firebase @arcgis/core react-router-dom


Import noiseReports (Firestore)
==============================

Script: `import-json.js` importă documentele din `noiseReports_import.json` în colecția `noiseReports`.

1) Varianta recomandată (Admin / service account)
-------------------------------------------------

- Creează un Service Account key (JSON) din Firebase Console / Google Cloud.
- Setează una dintre variabilele de mai jos (în `.env` sau în environment-ul shell-ului):
	- `GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\service-account.json`
	- sau `FIREBASE_ADMIN_CREDENTIALS_PATH=C:\\path\\to\\service-account.json`
	- sau `FIREBASE_ADMIN_CREDENTIALS_JSON={...}` (conținutul JSON ca string)

Rulează:
- `npm run import:noiseReports:admin`

2) Varianta alternativă (User / email + parolă)
----------------------------------------------

Această variantă folosește Firebase Auth și respectă regulile Firestore. Contul trebuie să aibă drepturi de scriere conform regulilor.

În `.env` adaugă:
- `FIREBASE_IMPORT_EMAIL=...`
- `FIREBASE_IMPORT_PASSWORD=...`

Rulează:
- `npm run import:noiseReports:user`


Statistici orare (Firestore: `statisticiOrare`)
=============================================

Scriptul calculează statistici pe oră din colecția `noiseReports` și scrie în `statisticiOrare` documente cu câmpurile:
`dominantCategory`, `minNoise`, `maxNoise`, `sampleCount`, `timestamp`, `zoneId`, `id`.

Necesită service account (admin):
- `GOOGLE_APPLICATION_CREDENTIALS=...` (sau `FIREBASE_ADMIN_CREDENTIALS_PATH` / `FIREBASE_ADMIN_CREDENTIALS_JSON`)

Rulează:
- `npm run compute:statisticiOrare`

Opțional:
- interval: `node scripts/computeHourlyStats.mjs --start=2024-06-01T00:00:00 --end=2024-06-02T00:00:00`
- dry-run: `node scripts/computeHourlyStats.mjs --dry-run`

ZoneId automat (grid)
---------------------

Dacă rapoartele nu au `zoneId`, scriptul poate calcula automat un `zoneId` din coordonate (grid). Implicit `zoneMode=grid`.

- schimbă dimensiunea grilei (grade): `node scripts/computeHourlyStats.mjs --gridDeg=0.01` (≈1.1km)
- dezactivează zonarea: `node scripts/computeHourlyStats.mjs --zoneMode=none`


Grafana local (fără Billing) — CSV
=================================

Scop: pui un CSV în folderul `exports/`, iar Grafana (cu pluginul Infinity) îl citește prin URL.

1) Pune CSV-ul în proiect
------------------------

- Copiază fișierul CSV în folderul `exports/` (ex: `exports/noiseReports.csv`).

2) Pornește Grafana + serverul de CSV (Docker)
----------------------------------------------

Rulează:
- `docker compose -f docker-compose.grafana.yml up -d`

Grafana:
- `http://localhost:3001` (user/parolă: `admin` / `admin`)

CSV (test în browser):
- `http://localhost:8082/noiseReports.csv`

3) Configurează Infinity datasource
----------------------------------

- Connections → Data sources → Add data source → **Infinity**
- Type: **CSV**
- Parser: **Backend**
- URL: `http://exports/noiseReports.csv`

Note:
- Folosește `http://exports/...` (numele serviciului din docker compose). Asta evită problemele cu `host.docker.internal`.

