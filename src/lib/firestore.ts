import { db } from "./firebase";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import type { AppUser, NoiseReport, QuietZone } from "../models/models";

export const createUserDoc = (user: AppUser) =>
  setDoc(doc(db, "users", user.id), user);

export const addNoiseReport = (report: NoiseReport) =>
  addDoc(collection(db, "noiseReports"), report);

export const addQuietZone = (zone: QuietZone) =>
  addDoc(collection(db, "quietZones"), zone);

export const getLatestHourlyAnalytics = async () => {
  const q = query(collection(db, "analytics_hourly"), orderBy("timestamp", "desc"), limit(24));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
