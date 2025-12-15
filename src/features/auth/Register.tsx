import { useState } from "react";
import { register } from "../../lib/auth";
import { createUserDoc } from "../../lib/firestore";

export default function Register() {
  const [name, setName] = useState("User");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");

  const submit = async () => {
    setStatus("");
    try {
      const cred = await register(email, pass);
      await createUserDoc({
        id: cred.user.uid,
        name,
        role: "user",
        favoriteZones: [],
      });
      setStatus("Cont creat.");
    } catch (e: any) {
      setStatus(e.message);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Register</h2>
      <input placeholder="nume" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input placeholder="parola" type="password" value={pass} onChange={e => setPass(e.target.value)} />
      <button onClick={submit}>Creează cont</button>
      <p>{status}</p>
    </div>
  );
}
