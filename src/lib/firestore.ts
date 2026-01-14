import { db } from "./firebase";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import type { AppUser, NoiseReport, QuietZone } from "../models/models";

export const createUserDoc = (user: AppUser) =>
  setDoc(doc(db, "users", user.id), user);

export const addNoiseReport = (report: NoiseReport) =>
  addDoc(collection(db, "noiseReports"), report);

export const addQuietZone = (zone: QuietZone) =>
  addDoc(collection(db, "quietZones"), zone);

export const getUserDoc = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as AppUser) : null;
};

const ensureUserDocExists = async (uid: string) => {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  // Minimal doc so updateDoc works for favorites.
  await setDoc(
    ref,
    {
      id: uid,
      name: "",
      role: "user",
      favoriteZones: [],
    } satisfies AppUser,
    { merge: true }
  );
};

/**
 * We'll store favorites as string ids in users/{uid}.favoriteZones.
 * For now, we use an app-generated id like: `${source}:${layerTitle}:${objectId}`.
 */
export const addFavoriteZoneId = (uid: string, favoriteId: string) =>
  ensureUserDocExists(uid).then(() =>
    updateDoc(doc(db, "users", uid), { favoriteZones: arrayUnion(favoriteId) })
  );

export const removeFavoriteZoneId = (uid: string, favoriteId: string) =>
  ensureUserDocExists(uid).then(() =>
    updateDoc(doc(db, "users", uid), { favoriteZones: arrayRemove(favoriteId) })
  );

export const getUserNoiseReports = async (uid: string, max = 50) => {
  const q = query(
    collection(db, "noiseReports"),
    where("userId", "==", uid),
    limit(max)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as NoiseReport[];
  // Sort client-side to avoid requiring a composite Firestore index.
  rows.sort((a: any, b: any) => Number(b?.timestamp ?? 0) - Number(a?.timestamp ?? 0));
  return rows;
};

export const getUserQuietZones = async (uid: string, max = 50) => {
  const q = query(
    collection(db, "quietZones"),
    where("addedBy", "==", uid),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as QuietZone[];
};

export const getLatestHourlyAnalytics = async () => {
  const q = query(collection(db, "analytics_hourly"), orderBy("timestamp", "desc"), limit(24));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
