import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const pref = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
};

const outPath = getArg("out", "exports/statisticiOrare.csv");
const pageSize = Number(getArg("pageSize", "1000"));
const collectionName = getArg("collection", "statisticiOrare");
const start = getArg("start", undefined);
const end = getArg("end", undefined);
const credsPathArg = getArg("creds", undefined);

const cleanEnv = (value) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed || trimmed === "..." || trimmed === "<...>") return undefined;
  return trimmed;
};

const parseIsoDate = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}. Use ISO like 2024-06-01T00:00:00Z`);
  }
  return d;
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

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[\n\r\","]/.test(s)) return `"${s.replaceAll("\"", '""')}"`;
  return s;
};

const toIso = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

const main = async () => {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);

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

  const admin = (await import("firebase-admin")).default;
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: (process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id || "").trim(),
    });
  }

  const db = admin.firestore();

  const rows = [];
  rows.push([
    "id",
    "zoneId",
    "timestamp",
    "sampleCount",
    "minNoise",
    "maxNoise",
    "dominantCategory",
  ]);

  let exported = 0;
  let lastDoc = undefined;

  while (true) {
    let q = db.collection(collectionName).orderBy("timestamp").limit(pageSize);

    if (startDate) {
      q = q.where("timestamp", ">=", admin.firestore.Timestamp.fromDate(startDate));
    }
    if (endDate) {
      q = q.where("timestamp", "<=", admin.firestore.Timestamp.fromDate(endDate));
    }

    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const v = d.data();
      rows.push([
        v.id ?? d.id,
        v.zoneId ?? "",
        toIso(v.timestamp),
        v.sampleCount ?? "",
        v.minNoise ?? "",
        v.maxNoise ?? "",
        v.dominantCategory ?? "",
      ]);
      exported++;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n") + "\n";

  const fullOutPath = path.isAbsolute(outPath)
    ? outPath
    : path.join(process.cwd(), outPath.replaceAll("/", path.sep));

  await fs.mkdir(path.dirname(fullOutPath), { recursive: true });
  await fs.writeFile(fullOutPath, csv, "utf8");

  console.log(`✅ Exported ${exported} documents from ${collectionName} to ${fullOutPath}`);
};

await main();
