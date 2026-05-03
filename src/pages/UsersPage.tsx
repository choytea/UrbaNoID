import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Profile } from "../types";

export function UsersPage() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setMessage(error?.message || "");
    if (!error) setRows((data || []) as Profile[]);
  }

  useEffect(() => { load(); }, []);

  async function updateRole(row: Profile, role: string) {
    const { error } = await supabase.from("profiles").update({ role, updated_at: new Date().toISOString() }).eq("id", row.id);
    setMessage(error ? error.message : "Role user berhasil diperbarui.");
    await load();
  }

  async function toggleActive(row: Profile) {
    const { error } = await supabase.from("profiles").update({ is_active: !row.is_active, updated_at: new Date().toISOString() }).eq("id", row.id);
    setMessage(error ? error.message : "Status user berhasil diperbarui.");
    await load();
  }

  const filtered = rows.filter(row => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.email, row.username, row.full_name, row.phone, row.role].some(value => String(value || "").toLowerCase().includes(q));
  });

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <h1>Pengguna & Role</h1>
          <p>Kelola profil user, role ADMIN/SELLER/BUYER, dan status aktif.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="info-box">
        Untuk menambah user baru secara aman, buat user terlebih dahulu melalui Supabase Authentication → Users, atau biarkan buyer register sendiri.
        Setelah user masuk ke tabel profiles, role dapat diubah di halaman ini.
      </div>

      <div className="master-filter-row"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama, email, username, role..." /></div>
      {message && <div className="success-box">{message}</div>}

      <div className="table-wrap">
        <table className="master-table">
          <thead><tr><th>No</th><th>Avatar</th><th>Nama</th><th>Email</th><th>HP</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td><img className="mini-avatar" src={row.avatar_url || "https://placehold.co/80x80/111827/ffffff?text=U"} alt={row.full_name || "User"} /></td>
                <td>{row.full_name || row.username || "-"}</td>
                <td>{row.email || "-"}</td>
                <td>{row.phone || "-"}</td>
                <td>
                  <select value={row.role || "BUYER"} onChange={e => updateRole(row, e.target.value)}>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SELLER">SELLER</option>
                    <option value="BUYER">BUYER</option>
                  </select>
                </td>
                <td><span className={row.is_active ? "status-pill active" : "status-pill inactive"}>{row.is_active ? "AKTIF" : "NONAKTIF"}</span></td>
                <td className="action-cell"><button onClick={() => toggleActive(row)}>{row.is_active ? "Nonaktifkan" : "Aktifkan"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default UsersPage;
