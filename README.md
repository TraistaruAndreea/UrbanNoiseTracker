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

