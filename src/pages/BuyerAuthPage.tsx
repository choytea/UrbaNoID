import { useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  mode: "login" | "register";
  onDone: (targetPath?: string) => void;
};

function usernameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[^a-zA-Z0-9_]+/g, "_") || "buyer";
}

export function BuyerAuthPage({ mode: initialMode, onDone }: Props) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function upsertBuyerProfile(userId: string, userEmail: string) {
    await supabase.from("profiles").upsert({
      id: userId,
      role: "BUYER",
      username: username.trim() || usernameFromEmail(userEmail),
      full_name: fullName.trim() || usernameFromEmail(userEmail),
      email: userEmail,
      phone: phone.trim() || null,
      address_line: addressLine.trim() || null,
      district: district.trim() || null,
      city: city.trim() || null,
      province: province.trim() || null,
      postal_code: postalCode.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("Memproses...");

    if (mode === "register") {
      if (!fullName.trim() || !username.trim() || !email.trim() || !phone.trim() || !addressLine.trim() || !city.trim() || !province.trim()) {
        setMessage("Lengkapi nama lengkap, username, email, HP, alamat, kota, dan provinsi.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: "BUYER",
            username,
            full_name: fullName,
            phone,
            address_line: addressLine,
            district,
            city,
            province,
            postal_code: postalCode,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.user?.id) {
        await upsertBuyerProfile(data.user.id, data.user.email || email);
      }

      await supabase.auth.signOut();
      setMessage("Registrasi berhasil. Silakan login untuk melanjutkan keranjang atau checkout.");
      setMode("login");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      return;
    }

    if (data.user?.id) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id,role,is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (existing?.is_active === false) {
        await supabase.auth.signOut();
        setMessage("Akun ini nonaktif. Hubungi admin toko.");
        return;
      }

      if (!existing) {
        await upsertBuyerProfile(data.user.id, data.user.email || email);
      }
    }

    setMessage("Login buyer berhasil.");
    setTimeout(() => onDone("/buyer"), 250);
  }

  return (
    <div className="auth-wrap buyer-auth-wrap">
      <form className="auth-card buyer-auth-card" onSubmit={submit}>
        <h1>{mode === "login" ? "Login Buyer" : "Registrasi Buyer"}</h1>
        <p>Buyer dapat melihat katalog tanpa login. Login/registrasi diperlukan saat memasukkan produk ke keranjang atau checkout.</p>

        {mode === "register" && (
          <div className="auth-grid">
            <label>Nama Lengkap<input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama lengkap" /></label>
            <label>Username<input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" /></label>
            <label>Nomor HP / WhatsApp<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" /></label>
            <label>Kota/Kabupaten<input value={city} onChange={e => setCity(e.target.value)} placeholder="Kota/Kabupaten" /></label>
            <label className="auth-full">Alamat Lengkap<textarea value={addressLine} onChange={e => setAddressLine(e.target.value)} rows={3} placeholder="Alamat lengkap pengiriman" /></label>
            <label>Kecamatan<input value={district} onChange={e => setDistrict(e.target.value)} placeholder="Kecamatan" /></label>
            <label>Provinsi<input value={province} onChange={e => setProvince(e.target.value)} placeholder="Provinsi" /></label>
            <label>Kode Pos<input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="Kode pos" /></label>
          </div>
        )}

        <label>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@domain.com" required />

        <label>Password</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password minimal 6 karakter" required />

        <button className="btn-primary" type="submit">{mode === "login" ? "Login Buyer" : "Daftar Buyer"}</button>

        <button className="link-button" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Belum punya akun? Registrasi Buyer" : "Sudah register? Login Buyer"}
        </button>

        <a className="link-button center-link" href="#/seller-login">Masuk sebagai Seller/Admin</a>
        {message && <div className="message">{message}</div>}
      </form>
    </div>
  );
}

export default BuyerAuthPage;
