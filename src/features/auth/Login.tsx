import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../../lib/auth";
import Navbar from "../../components/Navbar";
import "./auth.css";
import illustration from "./Heatmap-1024x576.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const submit = async () => {
    setStatus("");
    try {
      await login(email, pass);
      setStatus("Logat.");
      navigate("/");
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
            <h2 className="auth-title">Autentificare</h2>
            <div className="auth-field">
              <label className="auth-small">Email</label>
              <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="auth-field">
              <label className="auth-small">Parolă</label>
              <input placeholder="parola" type="password" value={pass} onChange={e => setPass(e.target.value)} />
            </div>
            <div className="auth-actions">
              <button className="auth-btn" onClick={submit}>Login</button>
              <Link to="/register" className="auth-link">Creează cont</Link>
            </div>
            {status && <p className="auth-status">{status}</p>}
          </div>
        </div>
        <div className="auth-right" style={{ backgroundImage: `url(${illustration})` }} aria-hidden />
      </div>
    </div>
  );
}
