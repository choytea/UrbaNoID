import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type PaymentAccount = {
  id: string;
  payment_type: string;
  bank_name: string;
  account_number: string | null;
  account_holder: string;
  note: string | null;
  qris_image_url: string | null;
  is_active: boolean;
  sort_order: number;
};

type FormState = {
  payment_type: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  note: string;
  qris_image_url: string;
  is_active: boolean;
  sort_order: number;
};

const DEFAULT_FORM: FormState = {
  payment_type: "BANK_TRANSFER",
  bank_name: "",
  account_number: "",
  account_holder: "URBANOID OFFICIAL STORE",
  note: "",
  qris_image_url: "",
  is_active: true,
  sort_order: 100,
};

function isStoreProfileRoute3B10D(): boolean {
  const hash = window.location.hash.toLowerCase();
  const path = window.location.pathname.toLowerCase();

  return (
    hash.includes("store-profile") ||
    hash.includes("profil-toko") ||
    path.includes("store-profile") ||
    path.includes("profil-toko")
  );
}

function normalizeForCache3B10D(rows: PaymentAccount[]) {
  return rows
    .filter((row) => row.is_active)
    .filter((row) => row.payment_type === "BANK_TRANSFER" || row.payment_type === "EWALLET")
    .map((row) => ({
      id: row.id,
      bank: row.bank_name,
      accountNo: row.account_number || "",
      holder: row.account_holder,
      note: row.note || "",
      active: row.is_active,
    }));
}

function syncLocalPaymentCache3B10D(rows: PaymentAccount[]) {
  try {
    localStorage.setItem(
      "urbanoid_3b10d_dynamic_bank_accounts",
      JSON.stringify(normalizeForCache3B10D(rows))
    );

    const qris = rows.find((row) => row.is_active && row.payment_type === "QRIS");
    if (qris) {
      localStorage.setItem(
        "urbanoid_3b10d_qris_account",
        JSON.stringify({
          merchantName: qris.account_holder,
          imageUrl: qris.qris_image_url || "/payments/urbanoid-qris.jpeg",
          note: qris.note || "",
        })
      );
    }
  } catch {
    // localStorage optional
  }
}

export default function Phase3B10DStorePaymentAccountsSettings() {
  const [visible, setVisible] = useState(false);
  const [rows, setRows] = useState<PaymentAccount[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const activeRows = useMemo(() => rows.filter((row) => row.is_active), [rows]);

  async function loadRows() {
    setLoading(true);
    setNotice("");

    const { data, error } = await supabase
      .from("store_payment_accounts")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    setLoading(false);

    if (error) {
      setNotice("Tabel store_payment_accounts belum tersedia atau belum bisa dibaca. Jalankan SQL Phase 3B.10D-R3B-1 terlebih dahulu.");
      return;
    }

    const list = Array.isArray(data) ? (data as PaymentAccount[]) : [];
    setRows(list);
    syncLocalPaymentCache3B10D(list);
  }

  useEffect(() => {
    const check = () => setVisible(isStoreProfileRoute3B10D());

    check();
    window.addEventListener("hashchange", check);
    window.addEventListener("focus", check);

    return () => {
      window.removeEventListener("hashchange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  useEffect(() => {
    if (visible) loadRows();
  }, [visible]);

  if (!visible) return null;

  async function saveAccount(event: React.FormEvent) {
    event.preventDefault();

    if (!form.bank_name.trim()) {
      setNotice("Nama bank/metode wajib diisi.");
      return;
    }

    if (!form.account_holder.trim()) {
      setNotice("Atas nama wajib diisi.");
      return;
    }

    setLoading(true);
    setNotice("");

    const payload = {
      payment_type: form.payment_type,
      bank_name: form.bank_name.trim(),
      account_number: form.account_number.trim() || null,
      account_holder: form.account_holder.trim(),
      note: form.note.trim() || null,
      qris_image_url: form.qris_image_url.trim() || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order || 100),
    };

    const { error } = await supabase.from("store_payment_accounts").insert(payload);

    setLoading(false);

    if (error) {
      setNotice(error.message || "Gagal menyimpan rekening pembayaran.");
      return;
    }

    setForm(DEFAULT_FORM);
    setNotice("Rekening/metode pembayaran berhasil ditambahkan.");
    await loadRows();
  }

  async function toggleActive(row: PaymentAccount) {
    setLoading(true);

    const { error } = await supabase
      .from("store_payment_accounts")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    setLoading(false);

    if (error) {
      setNotice(error.message || "Gagal mengubah status rekening.");
      return;
    }

    await loadRows();
  }

  async function deleteRow(row: PaymentAccount) {
    const ok = window.confirm(`Hapus ${row.bank_name} ${row.account_number || ""}?`);
    if (!ok) return;

    setLoading(true);

    const { error } = await supabase.from("store_payment_accounts").delete().eq("id", row.id);

    setLoading(false);

    if (error) {
      setNotice(error.message || "Gagal menghapus rekening.");
      return;
    }

    await loadRows();
  }

  return (
    <section className="phase3b10d-payment-settings-panel">
      <div className="phase3b10d-payment-settings-header">
        <div>
          <h2>Pengaturan Pembayaran Toko</h2>
          <p>Kelola QRIS dan rekening transfer yang akan ditampilkan ke buyer.</p>
        </div>

        <button type="button" onClick={loadRows} disabled={loading}>
          Refresh
        </button>
      </div>

      {notice ? <div className="phase3b10d-payment-settings-notice">{notice}</div> : null}

      <div className="phase3b10d-payment-settings-summary">
        <div>
          <b>{rows.length}</b>
          <span>Total metode</span>
        </div>
        <div>
          <b>{activeRows.length}</b>
          <span>Aktif</span>
        </div>
      </div>

      <form className="phase3b10d-payment-settings-form" onSubmit={saveAccount}>
        <label>
          Jenis Pembayaran
          <select
            value={form.payment_type}
            onChange={(e) => setForm((prev) => ({ ...prev, payment_type: e.target.value }))}
          >
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="EWALLET">E-Wallet</option>
            <option value="QRIS">QRIS</option>
          </select>
        </label>

        <label>
          Bank / Metode
          <input
            value={form.bank_name}
            onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
            placeholder="Contoh: BCA, BRI, Mandiri, DANA, QRIS"
          />
        </label>

        <label>
          Nomor Rekening / E-Wallet
          <input
            value={form.account_number}
            onChange={(e) => setForm((prev) => ({ ...prev, account_number: e.target.value }))}
            placeholder="Kosongkan untuk QRIS jika tidak ada"
          />
        </label>

        <label>
          Atas Nama / Merchant
          <input
            value={form.account_holder}
            onChange={(e) => setForm((prev) => ({ ...prev, account_holder: e.target.value }))}
            placeholder="Contoh: URBANOID OFFICIAL STORE"
          />
        </label>

        <label>
          URL QRIS
          <input
            value={form.qris_image_url}
            onChange={(e) => setForm((prev) => ({ ...prev, qris_image_url: e.target.value }))}
            placeholder="/payments/urbanoid-qris.jpeg"
          />
        </label>

        <label>
          Catatan
          <input
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Contoh: Transfer BCA / QRIS resmi toko"
          />
        </label>

        <label>
          Urutan
          <input
            type="number"
            value={form.sort_order}
            onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value || 100) }))}
          />
        </label>

        <label className="phase3b10d-payment-settings-check">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Aktif
        </label>

        <button type="submit" disabled={loading}>
          Tambah Metode Pembayaran
        </button>
      </form>

      <div className="phase3b10d-payment-settings-list">
        {rows.map((row) => (
          <div className="phase3b10d-payment-settings-card" key={row.id}>
            <div>
              <div className="phase3b10d-payment-settings-card-title">
                {row.payment_type} - {row.bank_name}
              </div>
              <div className="phase3b10d-payment-settings-card-meta">
                {row.account_number || row.qris_image_url || "-"} - a.n. {row.account_holder}
              </div>
              {row.note ? <div className="phase3b10d-payment-settings-card-note">{row.note}</div> : null}
              <div className={row.is_active ? "phase3b10d-active" : "phase3b10d-inactive"}>
                {row.is_active ? "Aktif" : "Nonaktif"}
              </div>
            </div>

            <div className="phase3b10d-payment-settings-actions">
              <button type="button" onClick={() => toggleActive(row)} disabled={loading}>
                {row.is_active ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button type="button" className="danger" onClick={() => deleteRow(row)} disabled={loading}>
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
