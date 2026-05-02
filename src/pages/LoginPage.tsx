import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  onDone: () => void;
};

export function LoginPage({ onDone }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("choytea@gmail.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Memproses...");

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("Login berhasil.");
      setTimeout(onDone, 500);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username,
        },
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Registrasi berhasil. Cek email jika konfirmasi email aktif, lalu login.");
    setMode("login");
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Login UrbaNoiD" : "Register Buyer"}</h1>
        <p>Gunakan akun Supabase Auth. Untuk seller, pastikan role di profiles adalah ADMIN atau SELLER.</p>

        {mode === "register" && (
          <>
            <label>Nama Lengkap</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama lengkap" />

            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
          </>
        )}

        <label>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@domain.com" required />

        <label>Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" required />

        <button className="btn-primary" type="submit">{mode === "login" ? "Login" : "Register"}</button>

        <button className="link-button" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Belum punya akun? Register" : "Sudah punya akun? Login"}
        </button>

        {message && <div className="message">{message}</div>}
      </form>
    </div>
  );
}
