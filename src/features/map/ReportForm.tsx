import { useEffect, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { addNoiseReport } from "../../lib/firestore";
import type { NoiseCategory } from "../../models/models";

type ReportFormProps = {
  pickedLat?: number;
  pickedLon?: number;
  onSaved?: (payload: {
    lat: number;
    lon: number;
    category: NoiseCategory;
    decibels: number;
    timestamp: number;
    userId: string;
  }) => void | Promise<void>;
};

export default function ReportForm({ pickedLat, pickedLon, onSaved }: ReportFormProps) {
  const [lat, setLat] = useState(44.43);
  const [lon, setLon] = useState(26.1);
  const [category, setCategory] = useState<NoiseCategory>("trafic");
  const [decibels, setDecibels] = useState(70);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (typeof pickedLat === "number" && Number.isFinite(pickedLat)) {
      setLat(pickedLat);
    }
  }, [pickedLat]);

  useEffect(() => {
    if (typeof pickedLon === "number" && Number.isFinite(pickedLon)) {
      setLon(pickedLon);
    }
  }, [pickedLon]);

  const submit = async () => {
    setStatus("");
    const u = auth.currentUser;
    if (!u) return setStatus("Trebuie să fii logat.");

    const timestamp = Date.now();

    await addNoiseReport({
      userId: u.uid,
      noiseLevel: new GeoPoint(lat, lon),
      category,
      timestamp,
      decibels,
    });

    await onSaved?.({
      lat,
      lon,
      category,
      decibels,
      timestamp,
      userId: u.uid,
    });

    setStatus("Raport trimis.");
  };

  return (
    <div className="map-forms">
      <h3>Raportează zgomot</h3>

      <div className="form-row">
        <label>Lat</label>
        <input type="number" value={lat} onChange={e => setLat(+e.target.value)} />
      </div>

      <div className="form-row">
        <label>Lon</label>
        <input type="number" value={lon} onChange={e => setLon(+e.target.value)} />
      </div>

      <div className="form-row">
        <label>Categorie</label>
        <select value={category} onChange={e => setCategory(e.target.value as NoiseCategory)}>
          <option value="trafic">Trafic</option>
          <option value="santier">Șantier</option>
          <option value="muzica">Muzică</option>
          <option value="eveniment">Eveniment</option>
          <option value="altul">Altul</option>
        </select>
      </div>

      <div className="form-row">
        <label>dB (simulat)</label>
        <input type="number" value={decibels} onChange={e => setDecibels(+e.target.value)} />
      </div>

      <div className="form-row">
        <div style={{ flex: 1 }} />
        <button onClick={submit}>Trimite</button>
      </div>

      <p>{status}</p>
    </div>
  );
}
