import ArcGisMap from "./ArcGisMap";
import "./mapForms.css";
import ReportForm from "./ReportForm";
import QuietZoneForm from "./QuietZonesForm";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { logout } from "../../lib/auth";
import { useCallback, useState } from "react";

type ReportSavedPayload = {
  lat: number;
  lon: number;
  category: string;
  decibels: number;
  timestamp: number;
  userId: string;
};

type QuietSavedPayload = {
  lat: number;
  lon: number;
  score: number;
  description: string;
  addedBy: string;
  timestamp: number;
};

type ArcGisSyncApi = {
  addNoiseReportFeature: (p: {
    lat: number;
    lon: number;
    category: string;
    decibels: number;
    timestamp: number;
    userId: string;
  }) => Promise<void>;
  addQuietZoneFeature: (p: {
    lat: number;
    lon: number;
    score: number;
    description: string;
    addedBy: string;
    timestamp: number;
  }) => Promise<void>;
};

export default function MapPage() {
  const { user } = useAuth();
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [savedPoints, setSavedPoints] = useState<
    Array<{ lat: number; lon: number; kind: "report" | "quiet" }>
  >([]);
  const [arcGisApi, setArcGisApi] = useState<ArcGisSyncApi | null>(null);

  const handlePickLocation = useCallback((coords: { lat: number; lon: number }) => {
    setPicked(coords);
  }, []);

  return (
    <div style={{
      position: "relative",
      height: "100vh",
      width: "100vw",
      overflow: "hidden"
    }}>
      {/* Map fills whole area */}
      <div style={{ height: "100%", width: "100%" }}>
        <ArcGisMap
          onPickLocation={handlePickLocation}
          pickedLocation={picked}
          savedPoints={savedPoints}
          onArcGisReady={(api) => setArcGisApi(api)}
        />
      </div>

      {/* Top-left auth controls */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 50 }}>
        {!user ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/login" style={{ padding: '8px 12px', background: '#2f6bed', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Login</Link>
            <Link to="/register" style={{ padding: '8px 12px', background: '#fff', color: '#2f6bed', borderRadius: 8, textDecoration: 'none' }}>Register</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ background: '#fff', color: '#16213e', padding: '6px 10px', borderRadius: 8 }}>{user.email}</div>
            <button onClick={() => logout()} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Logout</button>
          </div>
        )}
      </div>

      {/* Right-side panel for forms (optional) */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 0,
        width: 360,
        height: '100%',
        borderLeft: '1px solid #ddd',
        padding: 12,
        overflowY: 'auto',
        background: '#ffffff',
        zIndex: 40
      }}>
        <div style={{ maxWidth: '100%' }}>
          <ReportForm
            pickedLat={picked?.lat}
            pickedLon={picked?.lon}
            onSaved={async (payload: ReportSavedPayload) => {
              // Local fallback marker (in case ArcGIS edit fails)
              setSavedPoints((prev) => [
                ...prev,
                { lat: payload.lat, lon: payload.lon, kind: "report" },
              ]);

              if (!arcGisApi) return;
              try {
                await arcGisApi.addNoiseReportFeature({
                  lat: payload.lat,
                  lon: payload.lon,
                  category: payload.category,
                  decibels: payload.decibels,
                  timestamp: payload.timestamp,
                  userId: payload.userId,
                });
              } catch (e) {
                console.error("❌ ArcGIS sync failed (User_Reports)", e);
              }
            }}
          />
          <hr />
          <QuietZoneForm
            pickedLat={picked?.lat}
            pickedLon={picked?.lon}
            onSaved={async (payload: QuietSavedPayload) => {
              // Local fallback marker (in case ArcGIS edit fails)
              setSavedPoints((prev) => [
                ...prev,
                { lat: payload.lat, lon: payload.lon, kind: "quiet" },
              ]);

              if (!arcGisApi) return;
              try {
                await arcGisApi.addQuietZoneFeature({
                  lat: payload.lat,
                  lon: payload.lon,
                  score: payload.score,
                  description: payload.description,
                  addedBy: payload.addedBy,
                  timestamp: payload.timestamp,
                });
              } catch (e) {
                console.error("❌ ArcGIS sync failed (QuietRecommendations)", e);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

