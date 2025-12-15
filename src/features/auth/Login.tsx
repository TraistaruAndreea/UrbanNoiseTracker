import { useState } from "react";
import { login } from "../../lib/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");

  const submit = async () => {
    setStatus("");
    try {
      await login(email, pass);
      setStatus("Logat.");
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Login</h2>
      <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="parola" type="password" value={pass} onChange={e => setPass(e.target.value)} />
      <button onClick={submit}>Login</button>
      <p>{status}</p>
    </div>
  );
}
