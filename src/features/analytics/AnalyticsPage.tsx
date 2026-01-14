import { useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import GrafanaDashboardEmbed from "../../components/GrafanaDashboardEmbed";

export default function AnalyticsPage() {
  type DashboardKey = "maxmin" | "peak" | "dominant";
  const [active, setActive] = useState<DashboardKey>("maxmin");

  const dashboards = useMemo(
    () =>
      [
        { key: "maxmin" as const, label: "Max/Min pe oră", title: "Max/Min Noise per Hour", uid: "cf9r2l1gwc7b4a", panelId: 1 },
        { key: "peak" as const, label: "Peak pe zone", title: "Peak noir per zone Id", uid: "df9r4by2yuo74e", panelId: 1 },
        { key: "dominant" as const, label: "Categorie dominantă", title: "New dashboard", uid: "bf9r37vo6n8cgb", panelId: 1 },
      ] satisfies Array<{ key: DashboardKey; label: string; title: string; uid: string; panelId: number }>,
    []
  );

  const current = dashboards.find((d) => d.key === active) ?? dashboards[0];

  const tabStyle = (isActive: boolean) => ({
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: isActive ? "#111827" : "#ffffff",
    color: isActive ? "#ffffff" : "#111827",
    fontWeight: 800,
    cursor: "pointer",
    opacity: isActive ? 1 : 0.85,
  });

  return (
    <div style={{ background: "#ffffff", minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: 12, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, color: "#111827" }}>Statistici</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dashboards.map((d) => (
              <button key={d.key} onClick={() => setActive(d.key)} style={tabStyle(d.key === active)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <GrafanaDashboardEmbed
            title={current.title}
            uid={current.uid}
            panelId={current.panelId}
            height="calc(100vh - 170px)"
            theme="light"
          />
        </div>
      </div>
    </div>
  );
}
