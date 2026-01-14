import { useEffect, useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { addQuietZone } from "../../lib/firestore";

type QuietZoneFormProps = {
  pickedLat?: number;
  pickedLon?: number;
  onSaved?: (payload: {
    lat: number;
    lon: number;
    score: number;
    description: string;
    addedBy: string;
    timestamp: number;
  }) => void | Promise<void>;
};

export default function QuietZoneForm({ pickedLat, pickedLon, onSaved }: QuietZoneFormProps) {
  const [lat, setLat] = useState(44.43);
  const [lon, setLon] = useState(26.1);
  const [score, setScore] = useState(4);
  const [description, setDescription] = useState("Parc liniștit");
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

    await addQuietZone({
      coords: new GeoPoint(lat, lon),
      score,
      addedBy: u.uid,
      description,
      timestamp,
    });

    await onSaved?.({
      lat,
      lon,
      score,
      description,
      addedBy: u.uid,
      timestamp,
    });

    setStatus("Zonă liniștită adăugată.");
  };

  return (
    <div className="map-forms">
      <h3>Adaugă zonă liniștită</h3>

      <div className="form-row">
        <label>Lat</label>
        <input type="number" value={lat} onChange={e => setLat(+e.target.value)} />
      </div>

      <div className="form-row">
        <label>Lon</label>
        <input type="number" value={lon} onChange={e => setLon(+e.target.value)} />
      </div>

      <div className="form-row">
        <label>Scor (1-5)</label>
        <input type="number" value={score} min={1} max={5} onChange={e => setScore(+e.target.value)} />
      </div>

      <div className="form-row">
        <label>Descriere</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div className="form-row">
        <div style={{ flex: 1 }} />
        <button onClick={submit}>Salvează</button>
      </div>

      <p>{status}</p>
    </div>
  );
}
