import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../lib/AuthContext";
import { getUserDoc, getUserNoiseReports, getUserQuietZones } from "../../lib/firestore";
import Navbar from "../../components/Navbar";

export default function AccountPage() {
  const { user } = useAuth();
  const [name, setName] = useState<string>("");
  const [favoriteZoneIds, setFavoriteZoneIds] = useState<string[]>([]);
  const [reportedZones, setReportedZones] = useState<any[]>([]);
  const [quietZones, setQuietZones] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");

  const email = user?.email ?? "";

  const username = useMemo(() => {
    if (name) return name;
    if (email) return email.split("@")[0];
    return "";
  }, [name, email]);

  const parsedFavorites = useMemo(() => {
    // New format: arcgis:<noisy|quiet|unknown>:<layerTitle>:<oid>
    // Legacy format: arcgis:<layerTitle>:<oid>
    const noisy: string[] = [];
    const quiet: string[] = [];
    const other: string[] = [];

    for (const fav of favoriteZoneIds) {
      const parts = String(fav).split(":");
      if (parts.length >= 4 && parts[0] === "arcgis") {
        const type = parts[1];
        if (type === "noisy") noisy.push(fav);
        else if (type === "quiet") quiet.push(fav);
        else other.push(fav);
      } else {
        other.push(fav);
      }
    }

    return { noisy, quiet, other };
  }, [favoriteZoneIds]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setStatus("");
      try {
        const u = await getUserDoc(user.uid);
        setName(u?.name ?? "");
        setFavoriteZoneIds(u?.favoriteZones ?? []);
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }

      try {
        const [reports, quiet] = await Promise.all([
          getUserNoiseReports(user.uid, 50),
          getUserQuietZones(user.uid, 50),
        ]);
        setReportedZones(reports as any[]);
        setQuietZones(quiet as any[]);
      } catch (e: any) {
        // If rules deny reads, show a friendly message.
        setStatus((prev) => prev || (e?.message ?? String(e)));
      }
    })();
  }, [user]);

  if (!user) return <div style={{ padding: 20 }}>Trebuie să fii logat.</div>;

  return (
    <div>
      <Navbar />
      <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h2>Cont utilizator</h2>

      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 8, columnGap: 12 }}>
          <div style={{ fontWeight: 600 }}>Username</div>
          <div>{username || "-"}</div>

          <div style={{ fontWeight: 600 }}>E-mail</div>
          <div>{email || "-"}</div>

          <div style={{ fontWeight: 600 }}>Zone favorite</div>
          <div>
            {favoriteZoneIds.length === 0 ? (
              <span style={{ color: "#666" }}>Nicio zonă favorită încă.</span>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Zone gălăgioase favorite</div>
                  {parsedFavorites.noisy.length === 0 ? (
                    <div style={{ color: "#666" }}>Nicio zonă gălăgioasă favorită.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {parsedFavorites.noisy.map((id) => (
                        <li key={id} style={{ fontFamily: "monospace" }}>
                          {id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Zone liniștite favorite</div>
                  {parsedFavorites.quiet.length === 0 ? (
                    <div style={{ color: "#666" }}>Nicio zonă liniștită favorită.</div>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {parsedFavorites.quiet.map((id) => (
                        <li key={id} style={{ fontFamily: "monospace" }}>
                          {id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {parsedFavorites.other.length > 0 ? (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Altele (format vechi / necunoscut)</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {parsedFavorites.other.map((id) => (
                        <li key={id} style={{ fontFamily: "monospace" }}>
                          {id}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Zone raportate</h3>
          {reportedZones.length === 0 ? (
            <div style={{ color: "#666" }}>N-ai raportat nimic încă.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {reportedZones.map((r: any) => (
                <li key={r.id}>
                  <span style={{ fontFamily: "monospace" }}>{r.id}</span>
                  {typeof r.decibels === "number" ? ` — ${r.decibels} dB` : ""}
                  {r.category ? ` — ${String(r.category)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Zone liniștite adăugate</h3>
          {quietZones.length === 0 ? (
            <div style={{ color: "#666" }}>N-ai adăugat recomandări încă.</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {quietZones.map((z: any) => (
                <li key={z.id}>
                  <span style={{ fontFamily: "monospace" }}>{z.id}</span>
                  {typeof z.score === "number" ? ` — scor ${z.score}` : ""}
                  {z.description ? ` — ${String(z.description)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {status ? (
        <div style={{ marginTop: 12, color: "#b91c1c" }}>
          {status}
        </div>
      ) : null}
      </div>
    </div>
  );
}
