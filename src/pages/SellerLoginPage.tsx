import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  onDone: (targetPath?: string) => void;
  redirectPath?: string;
};

function isStaffRole(role: unknown) {
  const normalized = String(role || "").toUpperCase();
  return normalized === "ADMIN" || normalized === "SUPERADMIN" || normalized === "SELLER";
}

export function SellerLoginPage({ onDone, redirectPath = "/seller" }: Props) {
  const [email, setEmail] = useState("choytea@gmail.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Memproses...");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    const userId = data.session?.user.id;
    if (!userId) {
      setMessage("Session seller tidak terbaca.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      setMessage("Akun seller/admin nonaktif.");
      return;
    }

    if (!isStaffRole(profile?.role)) {
      await supabase.auth.signOut();
      setMessage("Akun ini bukan Seller/Admin. Gunakan Login Buyer untuk belanja.");
      return;
    }

    setMessage("Login seller/admin berhasil.");
    setTimeout(() => onDone(redirectPath), 250);
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h1>Login Seller/Admin</h1>
        <p>Halaman Seller, Product Matrix, Master Data, Pesanan, Ekspedisi, Profil Toko, dan Pengguna hanya untuk role ADMIN/SELLER.</p>

        <label>Email Seller/Admin</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required />

        <label>Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" required />

        <button className="btn-primary" type="submit">Login Seller/Admin</button>
        <a className="link-button center-link" href="#/buyer-login">Masuk sebagai Buyer</a>
        {message && <div className="message">{message}</div>}
      </form>
    </div>
  );
}

export default SellerLoginPage;
