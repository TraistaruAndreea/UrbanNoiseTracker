import ArcGisMap from "./ArcGisMap";
import "./mapForms.css";
import ReportForm from "./ReportForm";
import QuietZoneForm from "./QuietZonesForm";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { logout } from "../../lib/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getDisplayNameForUser } from "../../lib/userProfile";

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
  const [displayName, setDisplayName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"main" | "quiet">("main");
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [savedPoints, setSavedPoints] = useState<
    Array<{ lat: number; lon: number; kind: "report" | "quiet" }>
  >([]);
  const [arcGisApi, setArcGisApi] = useState<ArcGisSyncApi | null>(null);
  const [routingEnabled, setRoutingEnabled] = useState(false);
  const [clearRouteTick, setClearRouteTick] = useState(0);
  const [routingStatus, setRoutingStatus] = useState<string>("");

  const handlePickLocation = useCallback((coords: { lat: number; lon: number }) => {
    setPicked(coords);
  }, []);

  const username = useMemo(() => {
    if (displayName) return displayName;
    const email = user?.email ?? "";
    return email ? email.split("@")[0] : "";
  }, [displayName, user?.email]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setDisplayName("");
        return;
      }
      try {
        const name = await getDisplayNameForUser({ uid: user.uid, email: user.email });
        if (cancelled) return;
        setDisplayName(name);
      } catch {
        // ignore; fallback is email prefix
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const switchTab = useCallback((tab: "main" | "quiet") => {
    setActiveTab(tab);
    // Avoid mixing "picked" coordinates and ArcGIS APIs between maps.
    setPicked(null);
    setArcGisApi(null);
    // Reset routing when switching maps.
    setRoutingEnabled(false);
    setRoutingStatus("");
    setClearRouteTick((t) => t + 1);
  }, []);

  const canUseRouting = Boolean(user);

  return (
    <div style={{
      position: "relative",
      height: "100vh",
      width: "100vw",
      overflow: "hidden"
    }}>
      {/* Map fills whole area */}
      <div style={{ height: "100%", width: "100%" }}>
        {activeTab === "main" ? (
          <ArcGisMap
            webmapItemId="214b24b9b3614049bc64254e3fc42b76"
            onPickLocation={handlePickLocation}
            pickedLocation={picked}
            savedPoints={savedPoints}
            onArcGisReady={(api) => setArcGisApi(api)}
            enablePicking
            enableEdits
            routingEnabled={routingEnabled && canUseRouting}
            clearRouteTick={clearRouteTick}
            onRoutingStatus={setRoutingStatus}
          />
        ) : (
          <ArcGisMap
            webmapItemId="7d8482d6700d4e49a9374f16ea912e01"
            onPickLocation={handlePickLocation}
            pickedLocation={picked}
            savedPoints={savedPoints}
            onArcGisReady={(api) => setArcGisApi(api)}
            enablePicking
            enableEdits
            routingEnabled={routingEnabled && canUseRouting}
            clearRouteTick={clearRouteTick}
            onRoutingStatus={setRoutingStatus}
          />
        )}
      </div>

      {/* Top-left auth controls */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 50 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => switchTab("main")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              background: activeTab === "main" ? "#16213e" : "#fff",
              color: activeTab === "main" ? "#fff" : "#16213e",
            }}
          >
            Harta zone gălăgioase
          </button>
          <button
            onClick={() => switchTab("quiet")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: "pointer",
              background: activeTab === "quiet" ? "#16213e" : "#fff",
              color: activeTab === "quiet" ? "#fff" : "#16213e",
            }}
          >
            Harta zone liniștite
          </button>
        </div>

        {!user ? (
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/login" style={{ padding: '8px 12px', background: '#2f6bed', color: '#fff', borderRadius: 8, textDecoration: 'none' }}>Login</Link>
            <Link to="/register" style={{ padding: '8px 12px', background: '#fff', color: '#2f6bed', borderRadius: 8, textDecoration: 'none' }}>Register</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              to="/account"
              style={{
                background: '#fff',
                color: '#16213e',
                padding: '6px 10px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 700,
              }}
              title="Deschide pagina utilizatorului"
            >
              {username || user.email}
            </Link>
            <button onClick={() => logout()} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Logout</button>
          </div>
        )}

        {/* Routing controls - only for authenticated users */}
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            disabled={!canUseRouting}
            onClick={() => {
              if (!canUseRouting) return;
              setRoutingEnabled((v) => {
                const next = !v;
                setRoutingStatus(
                  next
                    ? "Rutare: ON (click pe un punct pentru a calcula traseul)"
                    : ""
                );
                return next;
              });
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: canUseRouting ? "pointer" : "not-allowed",
              background: routingEnabled ? "#16a34a" : "#fff",
              color: routingEnabled ? "#fff" : "#16213e",
            }}
            title={canUseRouting ? "Activează rutarea" : "Trebuie să fii logat pentru rutare"}
          >
            {routingEnabled ? "Rutare: ON" : "Rutare: OFF"}
          </button>
          <button
            disabled={!canUseRouting}
            onClick={() => {
              if (!canUseRouting) return;
              setClearRouteTick((t) => t + 1);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              cursor: canUseRouting ? "pointer" : "not-allowed",
              background: "#fff",
              color: "#16213e",
            }}
            title={canUseRouting ? "Anulează ruta" : "Trebuie să fii logat pentru rutare"}
          >
            Anulează ruta
          </button>
        </div>

        {routingStatus ? (
          <div
            style={{
              marginTop: 10,
              maxWidth: 320,
              background: "rgba(255,255,255,0.95)",
              border: "1px solid #eee",
              borderRadius: 10,
              padding: "8px 10px",
              color: "#16213e",
              fontSize: 12,
              lineHeight: 1.35,
            }}
          >
            {routingStatus}
          </div>
        ) : null}
      </div>

      {/* Right-side panel for forms (optional) */}
      {activeTab === "main" && (
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
            <p style={{ margin: "6px 0 12px", color: "#16213e" }}>
              Împărtășește cu noi ce zonă e cam gălăgioasă :)
            </p>
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
          </div>
        </div>
      )}

      {activeTab === "quiet" && (
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
            <p style={{ margin: "6px 0 12px", color: "#16213e" }}>
              Unde ne putem relaxa undeva în liniște?
            </p>
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
      )}
    </div>
  );
}

