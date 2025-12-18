import { useState } from "react";
import { GeoPoint } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { addQuietZone } from "../../lib/firestore";

export default function QuietZoneForm() {
  const [lat, setLat] = useState(44.43);
  const [lon, setLon] = useState(26.1);
  const [score, setScore] = useState(4);
  const [description, setDescription] = useState("Parc liniștit");
  const [status, setStatus] = useState("");

  const submit = async () => {
    setStatus("");
    const u = auth.currentUser;
    if (!u) return setStatus("Trebuie să fii logat.");

    await addQuietZone({
      coords: new GeoPoint(lat, lon),
      score,
      addedBy: u.uid,
      description,
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
