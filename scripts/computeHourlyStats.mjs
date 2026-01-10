import "dotenv/config";
import fs from "node:fs/promises";

const argv = process.argv.slice(2);
const getArg = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const cleanEnv = (value) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed || trimmed === "..." || trimmed === "<...>") return undefined;
  return trimmed;
};

const parseIsoDate = (value) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date for ${value}. Use ISO like 2024-06-01T00:00:00Z`);
  }
  return d;
};

const toSafeIdPart = (value) => value.replaceAll(".", "p").replaceAll("-", "m");

const getLatLon = (location) => {
  if (!location) return undefined;

  // firebase-admin GeoPoint
  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    return { lat: location.latitude, lon: location.longitude };
  }

  // fallback (some serializers)
  if (typeof location._latitude === "number" && typeof location._longitude === "number") {
    return { lat: location._latitude, lon: location._longitude };
  }

  return undefined;
};

const computeGridZoneId = ({ lat, lon }, gridDeg) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (!Number.isFinite(gridDeg) || gridDeg <= 0) return "";

  const latCell = Math.floor(lat / gridDeg);
  const lonCell = Math.floor(lon / gridDeg);
  const gridPart = toSafeIdPart(String(gridDeg));
  return `grid_${gridPart}_${latCell}_${lonCell}`;
};

const formatBucketId = (date, zoneId) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const zonePart = zoneId && zoneId.trim() ? zoneId.trim() : "global";
  return `${zonePart}_${yyyy}${mm}${dd}_${hh}`;
};

const startOfHourLocal = (date) => {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
};

const resolveServiceAccountJson = async () => {
  const jsonInline = cleanEnv(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON);
  if (jsonInline) return JSON.parse(jsonInline);

  const explicitPath = cleanEnv(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH);
  const googlePath = cleanEnv(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const filePath = explicitPath || googlePath;
  if (!filePath) return undefined;

  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const toDate = (firestoreTimestampOrDate) => {
  if (!firestoreTimestampOrDate) return undefined;
  if (firestoreTimestampOrDate instanceof Date) return firestoreTimestampOrDate;
  if (typeof firestoreTimestampOrDate.toDate === "function") return firestoreTimestampOrDate.toDate();
  const d = new Date(firestoreTimestampOrDate);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const main = async () => {
  const start = parseIsoDate(getArg("start"));
  const end = parseIsoDate(getArg("end"));
  const pageSize = Number(getArg("pageSize") ?? "1000");
  const outCollection = getArg("outCollection") ?? "statisticiOrare";
  const dryRun = argv.includes("--dry-run");
  const zoneMode = (getArg("zoneMode") ?? "grid").toLowerCase();
  const gridDeg = Number(getArg("gridDeg") ?? "0.01");

  const serviceAccount = await resolveServiceAccountJson();
  if (!serviceAccount) {
    throw new Error(
      "Missing service account credentials. Set one of:\n" +
        "- GOOGLE_APPLICATION_CREDENTIALS=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_PATH=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_JSON=<json-string>\n"
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

  // Aggregate: key = `${bucketStartMs}|${zoneId}`
  /** @type {Map<string, { bucketStart: Date, zoneId: string, minNoise: number, maxNoise: number, sampleCount: number, categoryCounts: Map<string, number>, categoryNoiseSum: Map<string, number> }>} */
  const buckets = new Map();

  let lastDoc = undefined;
  let processed = 0;

  while (true) {
    let q = db.collection("noiseReports").orderBy("reportTimestamp").limit(pageSize);
    if (start) {
      q = q.where("reportTimestamp", ">=", admin.firestore.Timestamp.fromDate(start));
    }
    if (end) {
      q = q.where("reportTimestamp", "<=", admin.firestore.Timestamp.fromDate(end));
    }
    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const v = doc.data();
      const ts = toDate(v.reportTimestamp);
      if (!ts) continue;

      const bucketStart = startOfHourLocal(ts);
      let zoneId = (v.zoneId ?? "").toString();
      if ((!zoneId || !zoneId.trim()) && zoneMode === "grid") {
        const ll = getLatLon(v.location);
        if (ll) zoneId = computeGridZoneId(ll, gridDeg);
      }
      if ((!zoneId || !zoneId.trim()) && zoneMode === "none") {
        zoneId = "";
      }
      const key = `${bucketStart.getTime()}|${zoneId}`;

      const noiseLevel = Number(v.noiseLevel);
      if (Number.isNaN(noiseLevel)) continue;

      let agg = buckets.get(key);
      if (!agg) {
        agg = {
          bucketStart,
          zoneId,
          minNoise: noiseLevel,
          maxNoise: noiseLevel,
          sampleCount: 0,
          categoryCounts: new Map(),
          categoryNoiseSum: new Map(),
        };
        buckets.set(key, agg);
      }

      agg.sampleCount += 1;
      agg.minNoise = Math.min(agg.minNoise, noiseLevel);
      agg.maxNoise = Math.max(agg.maxNoise, noiseLevel);

      const category = (v.category ?? "").toString() || "unknown";
      agg.categoryCounts.set(category, (agg.categoryCounts.get(category) ?? 0) + 1);
      agg.categoryNoiseSum.set(category, (agg.categoryNoiseSum.get(category) ?? 0) + noiseLevel);

      processed += 1;
    }

    lastDoc = snap.docs[snap.docs.length - 1];
  }

  const docsToWrite = [];
  for (const agg of buckets.values()) {
    // dominantCategory: max count; tie-break by avg noise; then name
    let dominantCategory = "";
    let bestCount = -1;
    let bestAvg = -Infinity;

    for (const [category, count] of agg.categoryCounts.entries()) {
      const sum = agg.categoryNoiseSum.get(category) ?? 0;
      const avg = count > 0 ? sum / count : 0;

      if (count > bestCount) {
        bestCount = count;
        bestAvg = avg;
        dominantCategory = category;
        continue;
      }

      if (count === bestCount) {
        if (avg > bestAvg) {
          bestAvg = avg;
          dominantCategory = category;
          continue;
        }
        if (avg === bestAvg && category < dominantCategory) {
          dominantCategory = category;
        }
      }
    }

    const id = formatBucketId(agg.bucketStart, agg.zoneId);
    docsToWrite.push({
      id,
      zoneId: agg.zoneId,
      timestamp: admin.firestore.Timestamp.fromDate(agg.bucketStart),
      sampleCount: agg.sampleCount,
      minNoise: agg.minNoise,
      maxNoise: agg.maxNoise,
      dominantCategory,
    });
  }

  docsToWrite.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

  console.log(`ℹ️  Processed ${processed} noiseReports.`);
  console.log(`ℹ️  Computed ${docsToWrite.length} hourly buckets.`);

  if (dryRun) {
    console.log("✅ Dry run (no writes). Example:");
    console.log(docsToWrite.slice(0, 5));
    return;
  }

  // Write in batches of 500
  const batchSize = 500;
  let written = 0;

  for (let i = 0; i < docsToWrite.length; i += batchSize) {
    const chunk = docsToWrite.slice(i, i + batchSize);
    const batch = db.batch();

    for (const docData of chunk) {
      const ref = db.collection(outCollection).doc(docData.id);
      batch.set(ref, docData, { merge: false });
    }

    await batch.commit();
    written += chunk.length;
  }

  console.log(`✅ Wrote ${written} documents to ${outCollection}.`);
};

await main();
