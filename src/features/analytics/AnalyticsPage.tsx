import { useEffect, useState } from "react";
import { getLatestHourlyAnalytics } from "../../lib/firestore";

export default function AnalyticsPage() {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const data = await getLatestHourlyAnalytics();
      setRows(data);
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Analytics (UI)</h2>
      <p>Ultimele 24 înregistrări (exemplu)</p>

      <table border={1} cellPadding={8}>
        <thead>
          <tr>
            <th>timestamp</th>
            <th>avg</th>
            <th>max</th>
            <th>min</th>
            <th>samples</th>
            <th>category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{String(r.timestamp?.toDate?.() ?? r.timestamp)}</td>
              <td>{r.avgNoise}</td>
              <td>{r.maxNoise}</td>
              <td>{r.minNoise}</td>
              <td>{r.sampleCount}</td>
              <td>{r.dominantCategory}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
