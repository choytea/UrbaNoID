import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ShippingExpedition } from "../types";
import { formatCurrency } from "../lib/utils";

const emptyForm = {
  id: "",
  name: "",
  courier_code: "",
  service_name: "",
  description: "",
  base_cost: 0,
  etd_text: "",
  display_order: 1,
  is_active: true,
};

export function ShippingPage() {
  const [rows, setRows] = useState<ShippingExpedition[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await supabase.from("shipping_expeditions").select("*").order("display_order", { ascending: true });
    setMessage(error?.message || "");
    if (!error) setRows((data || []) as ShippingExpedition[]);
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(row: ShippingExpedition) {
    setForm({
      id: row.id,
      name: row.name || "",
      courier_code: row.courier_code || "",
      service_name: row.service_name || "",
      description: row.description || "",
      base_cost: Number(row.base_cost || 0),
      etd_text: row.etd_text || "",
      display_order: Number(row.display_order || 1),
      is_active: !!row.is_active,
    });
    setModalOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage("Nama ekspedisi wajib diisi.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      courier_code: form.courier_code.trim() || null,
      service_name: form.service_name.trim() || null,
      description: form.description.trim() || null,
      base_cost: Number(form.base_cost || 0),
      etd_text: form.etd_text.trim() || null,
      display_order: Number(form.display_order || 1),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    const result = form.id
      ? await supabase.from("shipping_expeditions").update(payload).eq("id", form.id)
      : await supabase.from("shipping_expeditions").insert(payload);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setModalOpen(false);
    setMessage("Data ekspedisi berhasil disimpan.");
    await load();
  }

  async function toggle(row: ShippingExpedition) {
    await supabase.from("shipping_expeditions").update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq("id", row.id);
    await load();
  }

  async function remove(row: ShippingExpedition) {
    if (!confirm(`Hapus ekspedisi ${row.name}?`)) return;
    await supabase.from("shipping_expeditions").delete().eq("id", row.id);
    await load();
  }

  const filtered = rows.filter(row => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.name, row.courier_code, row.service_name, row.description, row.etd_text].some(value => String(value || "").toLowerCase().includes(q));
  });

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h1>Ekspedisi</h1>
          <p>Kelola pilihan ekspedisi yang muncul saat buyer memasukkan keranjang atau checkout.</p>
          <div className="info-box shipping-integration-note">
            Integrasi resi otomatis bisa dibuat melalui Supabase Edge Function + API agregator ekspedisi seperti Biteship, RajaOngkir, Shipper, atau Shipdeo. Kunci API tidak boleh diletakkan di frontend.
          </div>
        </div>
        <div className="button-row">
          <button onClick={load}>Refresh</button>
          <button className="btn-primary" onClick={openAdd}>+ Tambah Ekspedisi</button>
        </div>
      </div>

      <div className="master-filter-row"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari ekspedisi, layanan, kode, estimasi..." /></div>
      {message && <div className="success-box">{message}</div>}

      <div className="table-wrap">
        <table className="master-table">
          <thead><tr><th>No</th><th>Ekspedisi</th><th>Layanan</th><th>Kode</th><th>Tarif Dasar</th><th>Estimasi</th><th>Integrasi</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>{row.name}</td>
                <td>{row.service_name || "-"}</td>
                <td>{row.courier_code || "-"}</td>
                <td>{formatCurrency(Number(row.base_cost || 0))}</td>
                <td>{row.etd_text || "-"}</td>
                <td>
                  <span className={(row as any).supports_api_booking ? "status-pill active" : "status-pill inactive"}>
                    {(row as any).supports_api_booking ? "API Ready" : "Manual"}
                  </span>
                  {(row as any).supports_label && <small className="shipping-mini-note">Label</small>}
                </td>
                <td><span className={row.is_active ? "status-pill active" : "status-pill inactive"}>{row.is_active ? "AKTIF" : "NONAKTIF"}</span></td>
                <td className="action-cell">
                  <button onClick={() => openEdit(row)}>Edit</button>
                  <button onClick={() => toggle(row)}>{row.is_active ? "Nonaktifkan" : "Aktifkan"}</button>
                  <button className="danger solid-danger" onClick={() => remove(row)}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <form className="simple-modal-form" onSubmit={save} onMouseDown={event => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            <h2>{form.id ? "Edit Ekspedisi" : "Tambah Ekspedisi"}</h2>
            <div className="checkout-grid">
              <label>Nama Ekspedisi<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
              <label>Kode Kurir<input value={form.courier_code} onChange={e => setForm({ ...form, courier_code: e.target.value })} placeholder="JNE/JNT/SICEPAT" /></label>
              <label>Layanan<input value={form.service_name} onChange={e => setForm({ ...form, service_name: e.target.value })} placeholder="REG/YES/ECO" /></label>
              <label>Tarif Dasar<input value={form.base_cost} onChange={e => setForm({ ...form, base_cost: Number(e.target.value || 0) })} type="number" min={0} /></label>
              <label>Estimasi<input value={form.etd_text} onChange={e => setForm({ ...form, etd_text: e.target.value })} placeholder="2-4 hari" /></label>
              <label>Urutan<input value={form.display_order} onChange={e => setForm({ ...form, display_order: Number(e.target.value || 1) })} type="number" /></label>
              <label className="checkout-full">Deskripsi<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} /></label>
              <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
            </div>
            <div className="modal-form-actions">
              <button type="button" onClick={() => setModalOpen(false)}>Batal</button>
              <button className="btn-primary" type="submit">Simpan</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default ShippingPage;
