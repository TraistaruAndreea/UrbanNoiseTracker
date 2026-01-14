import { useEffect, useMemo, useState } from "react";
import { getLatestHourlyAnalytics } from "../../lib/firestore";
import Navbar from "../../components/Navbar";

export default function AnalyticsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      setStatus("");
      setLoading(true);
      try {
        const data = await getLatestHourlyAnalytics();
        setRows(data);
      } catch (e: any) {
        setRows([]);
        setStatus(
          e?.message ??
            "Nu am putut încărca analytics. Verifică Firestore rules/colecția analytics_hourly."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const nums = rows
      .map((r) => Number(r.avgNoise))
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length;
    const max = Math.max(...nums);
    const min = Math.min(...nums);
    return { avg, max, min, count: nums.length };
  }, [rows]);

  return (
    <div>
      <Navbar />
      <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
        <h2 style={{ marginTop: 0 }}>Statistici</h2>
        <p style={{ marginTop: 4, color: "#374151" }}>
          Ultimele 24 înregistrări din <code>analytics_hourly</code>.
        </p>

        {status ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#b91c1c",
              whiteSpace: "pre-wrap",
            }}
          >
            {status}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Status</div>
            <div style={{ fontWeight: 800, marginTop: 6 }}>
              {loading ? "Se încarcă…" : "OK"}
            </div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Înregistrări</div>
            <div style={{ fontWeight: 800, marginTop: 6 }}>{rows.length}</div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Media avgNoise</div>
            <div style={{ fontWeight: 800, marginTop: 6 }}>
              {summary ? summary.avg.toFixed(1) : "-"}
            </div>
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Max avgNoise</div>
            <div style={{ fontWeight: 800, marginTop: 6 }}>
              {summary ? summary.max.toFixed(1) : "-"}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 700 }}>
            Tabel (ultimele 24h)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>timestamp</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>avg</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>max</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>min</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>samples</th>
                  <th style={{ padding: 10, borderBottom: "1px solid #eee" }}>category</th>
                </tr>
              </thead>
              <tbody>
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                      Nu există date în <code>analytics_hourly</code> (încă).
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>
                        {String(r.timestamp?.toDate?.() ?? r.timestamp)}
                      </td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{r.avgNoise ?? "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{r.maxNoise ?? "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{r.minNoise ?? "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{r.sampleCount ?? "-"}</td>
                      <td style={{ padding: 10, borderBottom: "1px solid #f3f4f6" }}>{r.dominantCategory ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
