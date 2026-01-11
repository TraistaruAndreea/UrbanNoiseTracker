import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
};

const inPath = getArg("in", "exports/statisticiOrare.csv");
const collectionName = getArg("collection", "statisticiOrare");
const pageSize = Number(getArg("batchSize", "500"));
const credsPathArg = getArg("creds", undefined);
const dryRun = argv.includes("--dry-run");

const cleanEnv = (value) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed || trimmed === "..." || trimmed === "<...>") return undefined;
  return trimmed;
};

const resolveServiceAccountJson = async () => {
  const credsPath = cleanEnv(credsPathArg);
  if (credsPath) {
    const full = path.isAbsolute(credsPath)
      ? credsPath
      : path.join(process.cwd(), credsPath.replaceAll("/", path.sep));
    const raw = await fs.readFile(full, "utf8");
    return JSON.parse(raw);
  }

  const jsonInline = cleanEnv(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON);
  if (jsonInline) return JSON.parse(jsonInline);

  const explicitPath = cleanEnv(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH);
  const googlePath = cleanEnv(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const filePath = explicitPath || googlePath;
  if (!filePath) return undefined;

  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const resolveInputPath = (p) => {
  const full = path.isAbsolute(p) ? p : path.join(process.cwd(), p.replaceAll("/", path.sep));
  return full;
};

// Minimal CSV parser that supports quotes and commas.
const parseCsv = (text) => {
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      cell = "";
      // Ignore fully-empty trailing row
      if (row.length !== 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }

    if (ch === "\r") {
      continue;
    }

    cell += ch;
  }

  // Flush last row
  if (inQuotes) throw new Error("Invalid CSV: unterminated quote");
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length !== 1 || row[0] !== "") rows.push(row);
  }

  return rows;
};

const toNum = (v) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const toDate = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const main = async () => {
  const serviceAccount = await resolveServiceAccountJson();
  if (!serviceAccount) {
    throw new Error(
      "Missing service account credentials. Set one of:\n" +
        "- GOOGLE_APPLICATION_CREDENTIALS=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_PATH=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_JSON=<json-string>\n" +
        "Or pass: --creds=secrets/service-account.json\n"
    );
  }

  const fullInPath = resolveInputPath(inPath);
  const raw = await fs.readFile(fullInPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error(`CSV has no data rows: ${fullInPath}`);

  const header = rows[0].map((h) => h.trim());
  const idx = (name) => header.findIndex((h) => h === name);

  const idIdx = idx("id");
  const zoneIdx = idx("zoneId");
  const tsIdx = idx("timestamp");
  const sampleIdx = idx("sampleCount");
  const avgIdx = idx("avgNoise");
  const minIdx = idx("minNoise");
  const maxIdx = idx("maxNoise");
  const domIdx = idx("dominantCategory");

  if (idIdx < 0 || tsIdx < 0) {
    throw new Error(
      `CSV missing required columns. Required: id, timestamp. Got: ${header.join(", ")}`
    );
  }

  const admin = (await import("firebase-admin")).default;
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: (process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id || "").trim(),
    });
  }
  const db = admin.firestore();

  let total = 0;
  let written = 0;
  const docs = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const id = (row[idIdx] ?? "").toString().trim();
    if (!id) continue;

    const timestampDate = toDate(row[tsIdx]);
    if (!timestampDate) continue;

    const docData = {
      id,
      zoneId: zoneIdx >= 0 ? (row[zoneIdx] ?? "").toString() : "",
      timestamp: admin.firestore.Timestamp.fromDate(timestampDate),
      sampleCount: toNum(sampleIdx >= 0 ? row[sampleIdx] : undefined) ?? 0,
      minNoise: toNum(minIdx >= 0 ? row[minIdx] : undefined) ?? 0,
      maxNoise: toNum(maxIdx >= 0 ? row[maxIdx] : undefined) ?? 0,
      dominantCategory: domIdx >= 0 ? (row[domIdx] ?? "").toString() : "",
    };

    if (avgIdx >= 0) {
      const avg = toNum(row[avgIdx]);
      if (avg !== undefined) docData.avgNoise = avg;
    }

    docs.push(docData);
    total++;
  }

  console.log(`ℹ️  Parsed ${total} CSV rows -> ${docs.length} docs.`);
  console.log(`ℹ️  Target collection: ${collectionName}`);
  if (dryRun) {
    console.log("✅ Dry run (no writes). Example:");
    console.log(docs.slice(0, 5));
    return;
  }

  const batchSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 500;
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();

    for (const d of chunk) {
      const ref = db.collection(collectionName).doc(d.id);
      batch.set(ref, d, { merge: false });
    }

    await batch.commit();
    written += chunk.length;
  }

  console.log(`✅ Wrote ${written} documents to ${collectionName}.`);
};

await main();
