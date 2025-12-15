import { useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { addNoiseReport } from "../../lib/firestore";
import type { NoiseCategory } from "../../models/models";

export default function ReportForm() {
  const [lat, setLat] = useState(44.43);
  const [lon, setLon] = useState(26.1);
  const [category, setCategory] = useState<NoiseCategory>("trafic");
  const [decibels, setDecibels] = useState(70);
  const [status, setStatus] = useState("");

  const submit = async () => {
    setStatus("");
    const u = auth.currentUser;
    if (!u) return setStatus("Trebuie să fii logat.");

    await addNoiseReport({
      userId: u.uid,
      noiseLevel: new GeoPoint(lat, lon),
      category,
      timestamp: Date.now(),
      decibels,
    });

    setStatus("Raport trimis.");
  };

  return (
    <div>
      <h3>Raportează zgomot</h3>

      <label>Lat</label>
      <input type="number" value={lat} onChange={e => setLat(+e.target.value)} />

      <label>Lon</label>
      <input type="number" value={lon} onChange={e => setLon(+e.target.value)} />

      <label>Categorie</label>
      <select value={category} onChange={e => setCategory(e.target.value as NoiseCategory)}>
        <option value="trafic">Trafic</option>
        <option value="santier">Șantier</option>
        <option value="muzica">Muzică</option>
        <option value="eveniment">Eveniment</option>
        <option value="altul">Altul</option>
      </select>

      <label>dB (simulat)</label>
      <input type="number" value={decibels} onChange={e => setDecibels(+e.target.value)} />

      <button onClick={submit}>Trimite</button>
      <p>{status}</p>
    </div>
  );
}
