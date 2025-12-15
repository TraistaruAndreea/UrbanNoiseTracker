import ArcGisMap from "./ArcGisMap";
import ReportForm from "./ReportForm";
import QuietZoneForm from "./QuietZonesForm";

export default function MapPage() {
  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      overflow: "hidden"
    }}>
      {/* HARTA */}
      <div style={{ flex: 1 }}>
        <ArcGisMap />
      </div>

      {/* PANEL */}
      <div style={{
        width: 360,
        borderLeft: "1px solid #444",
        padding: 12,
        overflowY: "auto",
        background: "#1e1e1e",
        color: "#fff"
      }}>
        <ReportForm />
        <hr />
        <QuietZoneForm />
      </div>
    </div>
  );
}

