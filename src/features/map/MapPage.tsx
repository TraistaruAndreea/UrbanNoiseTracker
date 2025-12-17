import ArcGisMap from "./ArcGisMap";
import ReportForm from "./ReportForm";
import QuietZoneForm from "./QuietZonesForm";
import { Link } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";
import { logout } from "../../lib/auth";

export default function MapPage() {
  const { user } = useAuth();

  return (
    <div style={{
      position: "relative",
      height: "100vh",
      width: "100vw",
      overflow: "hidden"
    }}>
      {/* Map fills whole area */}
      <div style={{ height: "100%", width: "100%" }}>
        <ArcGisMap />
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
          <ReportForm />
          <hr />
          <QuietZoneForm />
        </div>
      </div>
    </div>
  );
}

