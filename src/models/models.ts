import { GeoPoint, Timestamp } from "firebase/firestore";

export type NoiseCategory = "trafic" | "santier" | "muzica" | "eveniment" | "altul";

export interface AppUser {
  id: string; // uid
  name: string;
  role: "user" | "admin";
  favoriteZones: string[];
}

export interface NoiseReport {
  id?: string;
  userId: string;
  noiseLevel: GeoPoint; // coordonate (cum cere doc-ul)
  category: NoiseCategory;
  timestamp: number;
  decibels: number; // util pentru heatmap / analytics
}

export interface QuietZone {
  id?: string;
  coords: GeoPoint;
  score: number;
  addedBy: string;
  description: string;
}

export interface HourlyAnalytics {
  id: string;
  timestamp: Timestamp;
  zoneId: string;
  avgNoise: number;
  maxNoise: number;
  minNoise: number;
  sampleCount: number;
  dominantCategory: string;
}
