import ArcGisMap from "./ArcGisMap";
import "./mapForms.css";
import ReportForm from "./ReportForm";
import QuietZoneForm from "./QuietZonesForm";
import { useAuth } from "../../lib/AuthContext";
import { useCallback, useState } from "react";
import Navbar from "../../components/Navbar";

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

  // Navbar handles auth UI; MapPage only needs user for routing permissions.

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

  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid #ddd",
    cursor: "pointer",
    background: active ? "#16213e" : "#fff",
    color: active ? "#fff" : "#16213e",
    fontWeight: 700,
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Navbar
        hideHomeLink
        leftSlot={
          <>
            <button onClick={() => switchTab("main")} style={tabButtonStyle(activeTab === "main")}>
              Harta zone gălăgioase
            </button>
            <button onClick={() => switchTab("quiet")} style={tabButtonStyle(activeTab === "quiet")}>
              Harta zone liniștite
            </button>
          </>
        }
        rightSlot={
          <>
            {routingStatus ? (
              <span
                style={{
                  maxWidth: 340,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  color: "#444",
                }}
                title={routingStatus}
              >
                {routingStatus}
              </span>
            ) : null}
            <button
              disabled={!canUseRouting}
              onClick={() => {
                if (!canUseRouting) return;
                setRoutingEnabled((v) => {
                  const next = !v;
                  setRoutingStatus(next ? "Rutare: ON (click pe un punct)" : "");
                  return next;
                });
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                cursor: canUseRouting ? "pointer" : "not-allowed",
                background: routingEnabled ? "#16a34a" : "#fff",
                color: routingEnabled ? "#fff" : "#16213e",
                fontWeight: 700,
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
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                cursor: canUseRouting ? "pointer" : "not-allowed",
                background: "#fff",
                color: "#16213e",
                fontWeight: 700,
              }}
              title={canUseRouting ? "Anulează ruta" : "Trebuie să fii logat pentru rutare"}
            >
              Anulează ruta
            </button>
          </>
        }
      />

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div style={{ height: "100%", width: "100%" }}>
          <ArcGisMap
            webmapItemId={
              activeTab === "main"
                ? "214b24b9b3614049bc64254e3fc42b76"
                : "7d8482d6700d4e49a9374f16ea912e01"
            }
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
        </div>

        <div
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            width: 360,
            height: "auto",
            maxHeight: "min(560px, calc(100% - 32px))",
            padding: 14,
            overflowY: "auto",
            background: "rgba(255,255,255,0.98)",
            border: "1px solid rgba(15, 23, 42, 0.10)",
            borderRadius: 22,
            boxShadow: "0 18px 50px rgba(2, 6, 23, 0.22)",
            zIndex: 40,
          }}
        >
          {activeTab === "main" ? (
            <>
              <p style={{ margin: "6px 0 12px", color: "#16213e" }}>
                Raportează un punct de zgomot (click pe hartă pentru coordonate).
              </p>
              <ReportForm
                pickedLat={picked?.lat}
                pickedLon={picked?.lon}
                onSaved={async (payload: ReportSavedPayload) => {
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
                    console.error("❌ ArcGIS sync failed (NoiseReports)", e);
                  }
                }}
              />
            </>
          ) : (
            <>
              <p style={{ margin: "6px 0 12px", color: "#16213e" }}>
                Unde ne putem relaxa undeva în liniște?
              </p>
              <QuietZoneForm
                pickedLat={picked?.lat}
                pickedLon={picked?.lon}
                onSaved={async (payload: QuietSavedPayload) => {
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

