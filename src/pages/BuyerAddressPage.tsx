import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type BuyerAddressRow = {
 id: string;
 buyer_id: string;
 label: string;
 recipient_name: string | null;
 phone: string | null;
 address_line: string;
 district: string | null;
 city: string | null;
 province: string | null;
 postal_code: string | null;
 notes: string | null;
 is_main: boolean;
 is_active: boolean;
 created_at?: string;
 updated_at?: string;
};

type AddressForm = {
 id: string;
 label: string;
 recipient_name: string;
 phone: string;
 address_line: string;
 district: string;
 city: string;
 province: string;
 postal_code: string;
 notes: string;
 is_main: boolean;
};

type Props = {
 session: Session | null;
 profile: Profile | null;
};

const emptyForm: AddressForm = {
 id: "",
 label: "Alamat",
 recipient_name: "",
 phone: "",
 address_line: "",
 district: "",
 city: "",
 province: "",
 postal_code: "",
 notes: "",
 is_main: false,
};

function normalizeText(value: unknown) {
 return String(value || "").trim();
}

export default function BuyerAddressPage({ session, profile }: Props) {
 const [rows, setRows] = useState<BuyerAddressRow[]>([]);
 const [form, setForm] = useState<AddressForm>(emptyForm);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [message, setMessage] = useState("");
 const [error, setError] = useState("");

 const mainAddress = useMemo(() => rows.find(row => row.is_main) || null, [rows]);

 function resetForm() {
 setForm({
 ...emptyForm,
 label: rows.length ? "Alamat Tambahan" : "Alamat Utama",
 recipient_name: profile?.full_name || profile?.username || "",
 phone: profile?.phone || "",
 is_main: rows.length === 0,
 });
 }

 async function loadAddresses() {
 if (!session?.user?.id) return;

 setLoading(true);
 setError("");
 setMessage("");

 const { data, error: loadError } = await supabase
 .from("buyer_addresses")
 .select("*")
 .eq("buyer_id", session.user.id)
 .eq("is_active", true)
 .order("is_main", { ascending: false })
 .order("created_at", { ascending: true });

 if (loadError) {
 setError(loadError.message);
 setLoading(false);
 return;
 }

 setRows((data || []) as BuyerAddressRow[]);
 setLoading(false);
 }

 useEffect(() => {
 loadAddresses();
 }, [session?.user?.id]);

 useEffect(() => {
 if (!form.id && !form.address_line && !loading) {
 setForm(prev => ({
 ...prev,
 label: rows.length ? "Alamat Tambahan" : "Alamat Utama",
 recipient_name: profile?.full_name || profile?.username || "",
 phone: profile?.phone || "",
 is_main: rows.length === 0,
 }));
 }
 }, [rows.length, loading, profile?.full_name, profile?.username, profile?.phone]);

 function setField<K extends keyof AddressForm>(field: K, value: AddressForm[K]) {
 setForm(prev => ({ ...prev, [field]: value }));
 }

 function editAddress(row: BuyerAddressRow) {
 setForm({
 id: row.id,
 label: row.label || "Alamat",
 recipient_name: row.recipient_name || "",
 phone: row.phone || "",
 address_line: row.address_line || "",
 district: row.district || "",
 city: row.city || "",
 province: row.province || "",
 postal_code: row.postal_code || "",
 notes: row.notes || "",
 is_main: Boolean(row.is_main),
 });

 window.scrollTo({ top: 0, behavior: "smooth" });
 }

 async function saveAddress(event: React.FormEvent) {
 event.preventDefault();

 if (!session?.user?.id) {
 setError("Sesi buyer tidak ditemukan. Silakan login ulang.");
 return;
 }

 if (!normalizeText(form.label) || !normalizeText(form.address_line) || !normalizeText(form.city) || !normalizeText(form.province)) {
 setError("Lengkapi label alamat, alamat lengkap, kota/kabupaten, dan provinsi.");
 return;
 }

 setSaving(true);
 setError("");
 setMessage("");

 const shouldBeMain = form.is_main || rows.length === 0;

 if (shouldBeMain) {
 const { error: resetError } = await supabase
 .from("buyer_addresses")
 .update({ is_main: false })
 .eq("buyer_id", session.user.id)
 .eq("is_active", true);

 if (resetError) {
 setError(resetError.message);
 setSaving(false);
 return;
 }
 }

 const payload = {
 buyer_id: session.user.id,
 label: normalizeText(form.label),
 recipient_name: normalizeText(form.recipient_name) || null,
 phone: normalizeText(form.phone) || null,
 address_line: normalizeText(form.address_line),
 district: normalizeText(form.district) || null,
 city: normalizeText(form.city),
 province: normalizeText(form.province),
 postal_code: normalizeText(form.postal_code) || null,
 notes: normalizeText(form.notes) || null,
 is_main: shouldBeMain,
 is_active: true,
 };

 const result = form.id
 ? await supabase.from("buyer_addresses").update(payload).eq("id", form.id).eq("buyer_id", session.user.id)
 : await supabase.from("buyer_addresses").insert(payload);

 if (result.error) {
 setError(result.error.message);
 setSaving(false);
 return;
 }

 setMessage(shouldBeMain ? "Alamat utama berhasil disimpan." : "Alamat tambahan berhasil disimpan.");
 setSaving(false);
 setForm(emptyForm);
 await loadAddresses();
 }

 async function setAsMain(row: BuyerAddressRow) {
 if (!session?.user?.id) return;

 setSaving(true);
 setError("");
 setMessage("");

 const reset = await supabase
 .from("buyer_addresses")
 .update({ is_main: false })
 .eq("buyer_id", session.user.id)
 .eq("is_active", true);

 if (reset.error) {
 setError(reset.error.message);
 setSaving(false);
 return;
 }

 const update = await supabase
 .from("buyer_addresses")
 .update({ is_main: true })
 .eq("id", row.id)
 .eq("buyer_id", session.user.id);

 if (update.error) {
 setError(update.error.message);
 setSaving(false);
 return;
 }

 setMessage("Alamat utama berhasil diperbarui.");
 setSaving(false);
 await loadAddresses();
 }

 async function deleteAddress(row: BuyerAddressRow) {
 if (!session?.user?.id) return;

 const ok = confirm(`Hapus alamat "${row.label}"?`);
 if (!ok) return;

 setSaving(true);
 setError("");
 setMessage("");

 const remove = await supabase
 .from("buyer_addresses")
 .update({ is_active: false, is_main: false })
 .eq("id", row.id)
 .eq("buyer_id", session.user.id);

 if (remove.error) {
 setError(remove.error.message);
 setSaving(false);
 return;
 }

 setMessage("Alamat berhasil dihapus.");
 setSaving(false);
 await loadAddresses();
 }

 return (
 <section className="buyer-profile-page phase3b9a3-profile-shell phase3b9a3-address-page">
 <div className="phase3b9a3-profile-card">
 <div className="phase3b9a3-profile-head">
 <div>
 <h1>Profil Buyer</h1>
 <p>Edit data profil, alamat pengiriman, nomor HP, email, dan foto buyer.</p>
 </div>

 <button type="button" onClick={() => { window.location.hash = "/buyer"; }}>
 Kembali ke Katalog
 </button>
 </div>

 <div className="phase3b9a3-profile-tabs">
 <button type="button" onClick={() => { window.location.hash = "/buyer-profile"; }}>
 Profil
 </button>

 <button
 type="button"
 onClick={() => {
 window.dispatchEvent(new CustomEvent("urbanoid-buyer-profile-tab", { detail: "orders" }));
 window.location.hash = "/buyer-profile";
 }}
 >
 Pesanan Saya
 </button>

 <button
 type="button"
 onClick={() => {
 window.dispatchEvent(new CustomEvent("urbanoid-buyer-profile-tab", { detail: "chat" }));
 window.location.hash = "/buyer-profile";
 }}
 >
 Chat Pesanan
 </button>

 <button type="button" className="active">
 Atur Alamat
 </button>

 <button
 type="button"
 onClick={() => {
 window.dispatchEvent(new CustomEvent("urbanoid-buyer-profile-tab", { detail: "store" }));
 window.location.hash = "/buyer-profile";
 }}
 >
 Toko
 </button>
 </div>
 <div className="page-header buyer-address-header">
 <div>
 <p className="eyebrow">Buyer</p>
 <h1>Atur Alamat</h1>
 <p>Kelola alamat utama dan alamat tambahan untuk proses checkout berikutnya.</p>
 </div>

 <button type="button" className="btn-primary" onClick={resetForm}>
 + Tambah Alamat
 </button>
 </div>

 {error && <div className="alert error">{error}</div>}
 {message && <div className="alert success">{message}</div>}

 <div className="buyer-address-layout">
 <form className="buyer-address-form" onSubmit={saveAddress}>
 <h2>{form.id ? "Edit Alamat" : "Tambah Alamat"}</h2>

 <div className="form-grid">
 <label>
 Label Alamat
 <input value={form.label} onChange={event => setField("label", event.target.value)} placeholder="Alamat Utama / Rumah / Kantor" required />
 </label>

 <label>
 Nama Penerima
 <input value={form.recipient_name} onChange={event => setField("recipient_name", event.target.value)} placeholder="Nama penerima paket" />
 </label>

 <label>
 Nomor HP
 <input value={form.phone} onChange={event => setField("phone", event.target.value)} placeholder="08..." />
 </label>

 <label>
 Kode Pos
 <input value={form.postal_code} onChange={event => setField("postal_code", event.target.value)} placeholder="Kode pos" />
 </label>

 <label className="full">
 Alamat Lengkap
 <textarea value={form.address_line} onChange={event => setField("address_line", event.target.value)} rows={3} required />
 </label>

 <label>
 Kecamatan
 <input value={form.district} onChange={event => setField("district", event.target.value)} />
 </label>

 <label>
 Kota/Kabupaten
 <input value={form.city} onChange={event => setField("city", event.target.value)} required />
 </label>

 <label>
 Provinsi
 <input value={form.province} onChange={event => setField("province", event.target.value)} required />
 </label>

 <label className="full">
 Catatan Alamat
 <textarea value={form.notes} onChange={event => setField("notes", event.target.value)} rows={2} placeholder="Patokan, instruksi kurir, jam penerimaan, dll." />
 </label>
 </div>

 <label className="checkbox-line">
 <input type="checkbox" checked={form.is_main} onChange={event => setField("is_main", event.target.checked)} />
 Jadikan alamat utama
 </label>

 <div className="form-actions">
 <button type="submit" className="btn-primary" disabled={saving}>
 {saving ? "Menyimpan..." : "Simpan Alamat"}
 </button>

 <button type="button" onClick={() => setForm(emptyForm)} disabled={saving}>
 Batal
 </button>
 </div>
 </form>

 <div className="buyer-address-list">
 <div className="address-list-head">
 <h2>Daftar Alamat</h2>
 <small>{rows.length} alamat aktif</small>
 </div>

 {loading && <div className="address-card">Memuat alamat...</div>}

 {!loading && rows.length === 0 && (
 <div className="address-card empty">
 Belum ada alamat. Tambahkan alamat utama terlebih dahulu.
 </div>
 )}

 {!loading && rows.map(row => (
 <article key={row.id} className={`address-card ${row.is_main ? "main" : ""}`}>
 <div className="address-card-title">
 <div>
 <strong>{row.label}</strong>
 {row.is_main && <span>Alamat Utama</span>}
 </div>
 </div>

 <p><strong>{row.recipient_name || profile?.full_name || "-"}</strong> · {row.phone || profile?.phone || "-"}</p>
 <p>{row.address_line}</p>
 <p>{[row.district, row.city, row.province, row.postal_code].filter(Boolean).join(", ")}</p>
 {row.notes && <small>Catatan: {row.notes}</small>}

 <div className="address-actions">
 {!row.is_main && (
 <button type="button" onClick={() => setAsMain(row)} disabled={saving}>
 Jadikan Utama
 </button>
 )}

 <button type="button" onClick={() => editAddress(row)} disabled={saving}>
 Edit
 </button>

 <button type="button" className="danger" onClick={() => deleteAddress(row)} disabled={saving}>
 Hapus
 </button>
 </div>
 </article>
 ))}

 {mainAddress && (
 <div className="address-note">
 Alamat utama saat ini: <strong>{mainAddress.label}</strong>. Integrasi ke Checkout akan dipasang pada fase berikutnya.
 </div>
 )}
 </div>
 </div>
 </div>
 </section>
 );
}

