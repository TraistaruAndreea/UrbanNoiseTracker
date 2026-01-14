import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { register } from "../../lib/auth";
import { createUserDoc } from "../../lib/firestore";
import Navbar from "../../components/Navbar";
import "./auth.css";
import illustration from "./Heatmap-1024x576.png";

export default function Register() {
  const [name, setName] = useState("User");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const submit = async () => {
    setStatus("");
    try {
      const cred = await register(email, pass);
      try {
        await createUserDoc({
          id: cred.user.uid,
          name,
          role: "user",
          favoriteZones: [],
        });
      } catch (innerErr: any) {
        console.warn("createUserDoc failed (ignored):", innerErr);
      }

      setStatus("Cont creat. Te redirecționez la login...");
      setTimeout(() => navigate("/login"), 700);
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  return (
    <div>
      <Navbar />
      <div className="auth-page">
        <div className="auth-left">
          <div className="auth-container">
            <h2 className="auth-title">Creează cont</h2>
            <div className="auth-field">
              <label className="auth-small">Nume</label>
              <input placeholder="nume" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-small">Email</label>
              <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-small">Parolă</label>
              <input placeholder="parola" type="password" value={pass} onChange={e => setPass(e.target.value)} />
            </div>
            <div className="auth-actions">
              <button className="auth-btn" onClick={submit}>Creează cont</button>
              <Link to="/login" className="auth-link">Am deja cont</Link>
            </div>
            {status && <p className="auth-status">{status}</p>}
          </div>
        </div>
        <div className="auth-right" style={{ backgroundImage: `url(${illustration})` }} aria-hidden />
      </div>
    </div>
  );
}
