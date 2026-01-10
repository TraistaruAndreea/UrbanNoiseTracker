import "dotenv/config";
import fs from "node:fs/promises";

const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const requestedMode = modeArg ? modeArg.split("=")[1] : undefined;

const debug =
  process.argv.includes("--debug") ||
  process.env.DEBUG_IMPORT === "1" ||
  process.env.DEBUG_IMPORT === "true";

const cleanEnv = (value) => {
  const trimmed = (value ?? "").toString().trim();
  if (!trimmed || trimmed === "..." || trimmed === "<...>") return undefined;
  return trimmed;
};

const jsonPath = new URL("./noiseReports_import.json", import.meta.url);
const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));

const canUseAdmin =
  Boolean(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON?.trim()) ||
  Boolean(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH?.trim()) ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());

const canUseUser =
  Boolean(process.env.FIREBASE_IMPORT_EMAIL?.trim()) &&
  Boolean(process.env.FIREBASE_IMPORT_PASSWORD?.trim());

const mode =
  requestedMode ?? (canUseAdmin ? "admin" : canUseUser ? "user" : undefined);

if (requestedMode && requestedMode !== "admin" && requestedMode !== "user") {
  throw new Error(`Invalid --mode value: ${requestedMode}. Use --mode=admin or --mode=user.`);
}

if (!mode) {
  throw new Error(
    "No usable credentials found.\n" +
      "Provide one of:\n" +
      "- Admin mode (recommended): set GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json> OR FIREBASE_ADMIN_CREDENTIALS_JSON=<json> OR FIREBASE_ADMIN_CREDENTIALS_PATH=<path>\n" +
      "- User mode: set FIREBASE_IMPORT_EMAIL and FIREBASE_IMPORT_PASSWORD (must have Firestore write permissions per rules)\n" +
      "Then run: node import-json.js --mode=admin (or --mode=user)"
  );
}

const batchSize = 500;

if (mode === "admin") {
  const admin = (await import("firebase-admin")).default;

  if (!canUseAdmin) {
    throw new Error(
      "Admin mode selected, but no admin credentials were found.\n" +
        "Set ONE of:\n" +
        "- GOOGLE_APPLICATION_CREDENTIALS=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_PATH=<absolute-path-to-service-account.json>\n" +
        "- FIREBASE_ADMIN_CREDENTIALS_JSON=<service-account-json-content>\n"
    );
  }

  if (admin.apps.length === 0) {
    if (process.env.FIREBASE_ADMIN_CREDENTIALS_JSON?.trim()) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIALS_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: (process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id || "").trim(),
      });
    } else if (process.env.FIREBASE_ADMIN_CREDENTIALS_PATH?.trim()) {
      const raw = await fs.readFile(process.env.FIREBASE_ADMIN_CREDENTIALS_PATH, "utf8");
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: (process.env.VITE_FIREBASE_PROJECT_ID || serviceAccount.project_id || "").trim(),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: (process.env.VITE_FIREBASE_PROJECT_ID || "").trim(),
      });
    }
  }

  const db = admin.firestore();
  let batch = db.batch();
  let count = 0;

  for (const item of data) {
    const ref = db.collection("noiseReports").doc();

    batch.set(ref, {
      userId: item.userId,
      category: item.category,
      noiseLevel: item.noiseLevel,
      reportTimestamp: new Date(item.reportTimestamp),
      location: new admin.firestore.GeoPoint(item.location.latitude, item.location.longitude),
    });

    count++;
    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`✅ Imported ${count} documents (admin mode)`);
} else {
  const requiredEnvVars = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "FIREBASE_IMPORT_EMAIL",
    "FIREBASE_IMPORT_PASSWORD",
  ];

  const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]?.trim());
  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing env vars for user mode: ${missingEnvVars.join(", ")}. Ensure .env is present or variables are exported.`
    );
  }

  const { initializeApp } = await import("firebase/app");
  const { getAuth, signInWithEmailAndPassword } = await import("firebase/auth");
  const {
    GeoPoint,
    Timestamp,
    collection,
    doc,
    getFirestore,
    writeBatch,
  } = await import("firebase/firestore");

  const firebaseConfig = {
    apiKey: cleanEnv(process.env.VITE_FIREBASE_API_KEY),
    authDomain: cleanEnv(process.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: cleanEnv(process.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: cleanEnv(process.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanEnv(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanEnv(process.env.VITE_FIREBASE_APP_ID),
  };

  if (debug) {
    console.log("ℹ️  User-mode Firebase config:", {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      apiKeyPrefix: firebaseConfig.apiKey ? firebaseConfig.apiKey.slice(0, 6) + "…" : undefined,
    });
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);

  const email = cleanEnv(process.env.FIREBASE_IMPORT_EMAIL);
  const password = process.env.FIREBASE_IMPORT_PASSWORD ?? "";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    const code = err?.code || "unknown";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      throw new Error(
        "Firebase Auth login failed (" +
          code +
          ").\n" +
          "Verifică următoarele:\n" +
          "- Email/Password provider este ENABLED în Firebase Console → Authentication → Sign-in method\n" +
          "- User-ul există în Firebase Console → Authentication → Users (în același proiect ca VITE_FIREBASE_PROJECT_ID)\n" +
          "- FIREBASE_IMPORT_EMAIL și FIREBASE_IMPORT_PASSWORD sunt exacte (atenție la spații / caractere speciale)\n" +
          "Sugestie: rulează cu --debug ca să vezi ce proiect țintește: node import-json.js --mode=user --debug"
      );
    }
    throw err;
  }

  const db = getFirestore(app);
  let batch = writeBatch(db);
  let count = 0;

  for (const item of data) {
    const ref = doc(collection(db, "noiseReports"));

    batch.set(ref, {
      userId: item.userId,
      category: item.category,
      noiseLevel: item.noiseLevel,
      reportTimestamp: Timestamp.fromDate(new Date(item.reportTimestamp)),
      location: new GeoPoint(item.location.latitude, item.location.longitude),
    });

    count++;
    if (count % batchSize === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`✅ Imported ${count} documents (user mode)`);
}
