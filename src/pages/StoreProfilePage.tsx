import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { StoreProfile } from "../types";

const emptyStore = {
  id: "",
  store_name: "UrbaNoiD Official Store",
  tagline: "Identity in Motion · Premium Urban Apparel",
  logo_url: "",
  banner_url: "",
  whatsapp: "",
  email: "",
  phone: "",
  address_line: "",
  district: "",
  city: "",
  province: "",
  postal_code: "",
  description: "",
  instagram_url: "",
  tiktok_url: "",
  is_active: true,
};

export function StoreProfilePage() {
  const [form, setForm] = useState(emptyStore);
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await supabase.from("store_profiles").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") {
      setMessage(error.message);
      return;
    }

    if (data) {
      const row = data as StoreProfile;
      setForm({
        id: row.id,
        store_name: row.store_name || "",
        tagline: row.tagline || "",
        logo_url: row.logo_url || "",
        banner_url: row.banner_url || "",
        whatsapp: row.whatsapp || "",
        email: row.email || "",
        phone: row.phone || "",
        address_line: row.address_line || "",
        district: row.district || "",
        city: row.city || "",
        province: row.province || "",
        postal_code: row.postal_code || "",
        description: row.description || "",
        instagram_url: row.instagram_url || "",
        tiktok_url: row.tiktok_url || "",
        is_active: row.is_active,
      });
    }
  }

  useEffect(() => { load(); }, []);

  async function uploadStoreImage(file: File, field: "logo_url" | "banner_url") {
    setMessage("Mengunggah gambar toko...");
    const cleanName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
    const path = `${field}/${Date.now()}-${cleanName}`;

    const { error } = await supabase.storage.from("store-assets").upload(path, file, { upsert: true });
    if (error) {
      setMessage(error.message);
      return;
    }

    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
    setForm(prev => ({ ...prev, [field]: data.publicUrl }));
    setMessage("Gambar berhasil diunggah. Klik Simpan Profil Toko untuk menyimpan.");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    if (!form.store_name.trim()) {
      setMessage("Nama toko wajib diisi.");
      return;
    }

    const payload = {
      store_name: form.store_name.trim(),
      tagline: form.tagline.trim() || null,
      logo_url: form.logo_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address_line: form.address_line.trim() || null,
      district: form.district.trim() || null,
      city: form.city.trim() || null,
      province: form.province.trim() || null,
      postal_code: form.postal_code.trim() || null,
      description: form.description.trim() || null,
      instagram_url: form.instagram_url.trim() || null,
      tiktok_url: form.tiktok_url.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    const result = form.id
      ? await supabase.from("store_profiles").update(payload).eq("id", form.id)
      : await supabase.from("store_profiles").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage("Profil toko berhasil disimpan.");
    await load();
  }

  return (
    <section className="panel store-profile-admin">
      <div className="section-title">
        <div>
          <h1>Profil Toko</h1>
          <p>Kelola profil toko, logo, alamat, kontak, dan deskripsi yang terlihat di sisi buyer.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      {message && <div className="success-box">{message}</div>}

      <form onSubmit={save} className="profile-form">
        <div className="store-preview">
          <div className="store-logo-preview">
            <img src={form.logo_url || "https://placehold.co/120x120/111827/ffffff?text=UO"} alt="Logo toko" />
            <label>Upload Logo<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) uploadStoreImage(file, "logo_url"); }} /></label>
          </div>
          <div className="store-banner-preview">
            {form.banner_url ? <img src={form.banner_url} alt="Banner toko" /> : <span>Banner Toko</span>}
            <label>Upload Banner<input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) uploadStoreImage(file, "banner_url"); }} /></label>
          </div>
        </div>

        <div className="checkout-grid">
          <label>Nama Toko<input value={form.store_name} onChange={e => setForm({ ...form, store_name: e.target.value })} required /></label>
          <label>Tagline<input value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} /></label>
          <label>WhatsApp<input value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></label>
          <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" /></label>
          <label>Telepon<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
          <label>Kota/Kabupaten<input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
          <label className="checkout-full">Alamat Toko<textarea value={form.address_line} onChange={e => setForm({ ...form, address_line: e.target.value })} rows={3} /></label>
          <label>Kecamatan<input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></label>
          <label>Provinsi<input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} /></label>
          <label>Kode Pos<input value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} /></label>
          <label>Instagram URL<input value={form.instagram_url} onChange={e => setForm({ ...form, instagram_url: e.target.value })} /></label>
          <label>TikTok URL<input value={form.tiktok_url} onChange={e => setForm({ ...form, tiktok_url: e.target.value })} /></label>
          <label className="checkout-full">Deskripsi Toko<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={5} /></label>
          <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Profil aktif</label>
        </div>

        <button className="btn-primary" type="submit">Simpan Profil Toko</button>
      </form>
    </section>
  );
}

export default StoreProfilePage;
