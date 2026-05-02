import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type FieldType = "text" | "textarea" | "number" | "status" | "color";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  defaultValue?: string | number | null;
};

type TableDef = {
  key: string;
  label: string;
  title: string;
  description: string;
  orderBy: string;
  titleField: string;
  slugSourceField?: string;
  fields: FieldDef[];
  columns: string[];
};

const STATUS_OPTIONS = ["AKTIF", "NONAKTIF"] as const;

const masterTables: TableDef[] = [
  {
    key: "showcases",
    label: "Etalase",
    title: "Etalase Produk",
    description: "Kelola kelompok etalase/koleksi utama yang tampil di katalog buyer.",
    orderBy: "display_order",
    titleField: "name",
    slugSourceField: "name",
    fields: [
      { key: "name", label: "Nama Etalase", type: "text", required: true, placeholder: "Contoh: Kaos Premium" },
      { key: "slug", label: "Slug", type: "text", required: true, placeholder: "kaos-premium" },
      { key: "description", label: "Deskripsi", type: "textarea", full: true },
      { key: "display_order", label: "Urutan Tampil", type: "number", defaultValue: 1 },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["name", "slug", "description", "display_order", "status"],
  },
  {
    key: "categories",
    label: "Kategori",
    title: "Kategori Produk",
    description: "Kelola kategori produk seperti kaos dewasa, kaos anak, wangi, jersey, dan lainnya.",
    orderBy: "display_order",
    titleField: "name",
    slugSourceField: "name",
    fields: [
      { key: "name", label: "Nama Kategori", type: "text", required: true, placeholder: "Contoh: Kaos Dewasa" },
      { key: "slug", label: "Slug", type: "text", required: true, placeholder: "kaos-dewasa" },
      { key: "description", label: "Deskripsi", type: "textarea", full: true },
      { key: "display_order", label: "Urutan Tampil", type: "number", defaultValue: 1 },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["name", "slug", "description", "display_order", "status"],
  },
  {
    key: "materials",
    label: "Bahan",
    title: "Master Bahan",
    description: "Kelola daftar bahan kain yang dipilih pada produk induk.",
    orderBy: "name",
    titleField: "name",
    fields: [
      { key: "name", label: "Nama Bahan", type: "text", required: true, placeholder: "Contoh: COTTON COMBED BCI BIOWASH" },
      { key: "description", label: "Deskripsi", type: "textarea", full: true },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["name", "description", "status"],
  },
  {
    key: "colors",
    label: "Warna",
    title: "Master Warna",
    description: "Kelola warna produk dan kode hex untuk tampilan pilihan warna di mode buyer.",
    orderBy: "name",
    titleField: "name",
    fields: [
      { key: "name", label: "Nama Warna", type: "text", required: true, placeholder: "Contoh: Navy" },
      { key: "hex_code", label: "Kode Hex", type: "color", placeholder: "#001f3f" },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["name", "hex_code", "status"],
  },
  {
    key: "sizes",
    label: "Ukuran & Pola",
    title: "Master Ukuran & Pola",
    description: "Kelola ukuran, pola/fit, dan size guide produk.",
    orderBy: "display_order",
    titleField: "size_name",
    fields: [
      { key: "size_name", label: "Ukuran", type: "text", required: true, placeholder: "Contoh: L" },
      { key: "pattern_type", label: "Pola / Fit", type: "text", required: true, placeholder: "Contoh: Regular Fit" },
      { key: "length_cm", label: "Panjang (cm)", type: "number" },
      { key: "width_cm", label: "Lebar (cm)", type: "number" },
      { key: "chest_cm", label: "Lingkar Dada (cm)", type: "number" },
      { key: "sleeve_cm", label: "Panjang Lengan (cm)", type: "number" },
      { key: "display_order", label: "Urutan Tampil", type: "number", defaultValue: 1 },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["size_name", "pattern_type", "length_cm", "width_cm", "chest_cm", "sleeve_cm", "display_order", "status"],
  },
  {
    key: "product_models",
    label: "Model Produk",
    title: "Master Model Produk",
    description: "Kelola jenis model, tipe sablon/print, motif, tema desain, dan deskripsi model.",
    orderBy: "model_type",
    titleField: "model_type",
    fields: [
      { key: "model_type", label: "Jenis Model", type: "text", required: true, placeholder: "Contoh: Kaos" },
      { key: "print_type", label: "Tipe Print / Sablon", type: "text", placeholder: "Contoh: Plastisol" },
      { key: "motif", label: "Motif", type: "text", placeholder: "Contoh: Grafis" },
      { key: "theme", label: "Tema", type: "text", placeholder: "Contoh: The Eagle Quote" },
      { key: "description", label: "Deskripsi", type: "textarea", full: true },
      { key: "status", label: "Status", type: "status", defaultValue: "AKTIF" },
    ],
    columns: ["model_type", "print_type", "motif", "theme", "description", "status"],
  },
];


const MASTER_TAB_STORAGE_KEY = "urbanoid_master_active_tab";

function isMasterTableKey(key: string | null) {
  return !!key && masterTables.some(table => table.key === key);
}

function getInitialMasterTab() {
  const saved = localStorage.getItem(MASTER_TAB_STORAGE_KEY);
  return isMasterTableKey(saved) ? saved as string : masterTables[0].key;
}

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function emptyForm(def: TableDef) {
  return def.fields.reduce<Record<string, any>>((acc, field) => {
    if (field.defaultValue !== undefined) acc[field.key] = field.defaultValue;
    else if (field.type === "status") acc[field.key] = "AKTIF";
    else if (field.type === "color") acc[field.key] = "#000000";
    else acc[field.key] = "";
    return acc;
  }, {});
}

function displayLabel(def: TableDef, key: string) {
  return def.fields.find(field => field.key === key)?.label || key;
}

function normalizeHex(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "#000000";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function isLikelyMissingColumn(message: string) {
  return message.includes("column") && message.includes("does not exist");
}

function groupValue(row: any, key: string) {
  const value = String(row[key] ?? "").trim();
  return value || "-";
}

function groupByValue(rows: any[], key: string) {
  const map = new Map<string, any[]>();

  for (const row of rows) {
    const value = groupValue(row, key);
    const list = map.get(value) || [];
    list.push(row);
    map.set(value, list);
  }

  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function MasterDataPage() {
  const [active, setActive] = useState(getInitialMasterTab());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  /*
    ACCORDION v2D.9:
    - null berarti semua tertutup.
    - tampilan awal selalu null.
    - hanya 1 Jenis Model, 1 Tipe Print/Sablon, dan 1 Motif yang bisa terbuka.
  */
  const [openModelKey, setOpenModelKey] = useState<string | null>(null);
  const [openPrintKey, setOpenPrintKey] = useState<string | null>(null);
  const [openMotifKey, setOpenMotifKey] = useState<string | null>(null);

  const activeDef = useMemo(() => masterTables.find(table => table.key === active) || masterTables[0], [active]);

  function closeAllModelGroups() {
    setOpenModelKey(null);
    setOpenPrintKey(null);
    setOpenMotifKey(null);
  }

  async function load(table = active) {
    const def = masterTables.find(item => item.key === table) || masterTables[0];

    setLoading(true);
    setError("");
    setNotice("");

    let query = supabase.from(def.key).select("*").limit(500);

    if (def.orderBy) {
      query = query.order(def.orderBy, { ascending: true });
    }

    let { data, error } = await query;

    if (error && def.orderBy !== "name") {
      const retry = await supabase.from(def.key).select("*").limit(500).order("created_at", { ascending: true });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    closeAllModelGroups();
    void load(active);
  }, [active]);

  useEffect(() => {
    function onMasterTab(event: Event) {
      const tabKey = (event as CustomEvent<string>).detail || localStorage.getItem(MASTER_TAB_STORAGE_KEY);

      if (!isMasterTableKey(tabKey)) return;

      setActive(tabKey as string);
      setSearch("");
      setError("");
      setNotice("");
      closeAllModelGroups();
    }

    window.addEventListener("urbanoid-master-tab", onMasterTab as EventListener);
    return () => window.removeEventListener("urbanoid-master-tab", onMasterTab as EventListener);
  }, []);

  function openAdd() {
    setEditingRow(null);
    setForm(emptyForm(activeDef));
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function openEdit(row: any) {
    const nextForm = activeDef.fields.reduce<Record<string, any>>((acc, field) => {
      acc[field.key] = row[field.key] ?? "";
      return acc;
    }, {});

    if (activeDef.fields.some(field => field.key === "hex_code")) {
      nextForm.hex_code = normalizeHex(nextForm.hex_code);
    }

    setEditingRow(row);
    setForm(nextForm);
    setError("");
    setNotice("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingRow(null);
    setForm({});
  }

  function updateForm(key: string, value: string) {
    setForm(prev => {
      const next = { ...prev, [key]: value };

      if (activeDef.slugSourceField === key && activeDef.fields.some(field => field.key === "slug")) {
        next.slug = slugify(value);
      }

      return next;
    });
  }

  function buildPayload() {
    return activeDef.fields.reduce<Record<string, any>>((payload, field) => {
      const rawValue = form[field.key];

      if (field.type === "number") {
        if (rawValue === "" || rawValue === null || rawValue === undefined) {
          payload[field.key] = null;
        } else {
          const numeric = Number(rawValue);
          payload[field.key] = Number.isFinite(numeric) ? numeric : null;
        }
        return payload;
      }

      if (field.type === "color") {
        payload[field.key] = normalizeHex(rawValue);
        return payload;
      }

      if (field.type === "status") {
        payload[field.key] = rawValue || "AKTIF";
        return payload;
      }

      const value = String(rawValue ?? "").trim();
      payload[field.key] = value || null;
      return payload;
    }, {});
  }

  function validateForm() {
    for (const field of activeDef.fields) {
      const value = form[field.key];

      if (field.required && !String(value ?? "").trim()) {
        return `${field.label} wajib diisi.`;
      }
    }

    return "";
  }

  async function save(event: FormEvent) {
    event.preventDefault();

    const validationMessage = validateForm();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const payload = buildPayload();

    const result = editingRow?.id
      ? await supabase.from(activeDef.key).update(payload).eq("id", editingRow.id)
      : await supabase.from(activeDef.key).insert(payload);

    if (result.error) {
      setError(
        isLikelyMissingColumn(result.error.message)
          ? `${result.error.message}. Struktur tabel belum sesuai schema final. Jalankan ulang SQL schema core atau beritahu saya kolom yang hilang.`
          : result.error.message
      );
      setSaving(false);
      return;
    }

    setNotice(editingRow ? "Data master berhasil diperbarui." : "Data master berhasil ditambahkan.");
    setSaving(false);
    closeModal();
    await load(activeDef.key);
  }

  async function toggleStatus(row: any) {
    const nextStatus = row.status === "AKTIF" ? "NONAKTIF" : "AKTIF";

    setSaving(true);
    setError("");
    setNotice("");

    const { error } = await supabase
      .from(activeDef.key)
      .update({ status: nextStatus })
      .eq("id", row.id);

    if (error) {
      setError(error.message);
    } else {
      setNotice(`Status berhasil diubah menjadi ${nextStatus}.`);
      await load(activeDef.key);
    }

    setSaving(false);
  }

  async function deleteRow(row: any) {
    const label = row[activeDef.titleField] || row.name || row.id;

    if (!confirm(`Hapus data "${label}" secara permanen?`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    const { error } = await supabase
      .from(activeDef.key)
      .delete()
      .eq("id", row.id);

    if (error) {
      setError(
        error.message.includes("violates foreign key")
          ? "Data tidak dapat dihapus karena sudah dipakai pada produk/varian. Gunakan tombol Nonaktifkan."
          : error.message
      );
    } else {
      setNotice("Data master berhasil dihapus.");
      await load(activeDef.key);
    }

    setSaving(false);
  }

  function toggleModelType(key: string) {
    setOpenModelKey(prev => {
      const next = prev === key ? null : key;
      setOpenPrintKey(null);
      setOpenMotifKey(null);
      return next;
    });
  }

  function togglePrintType(key: string) {
    setOpenPrintKey(prev => {
      const next = prev === key ? null : key;
      setOpenMotifKey(null);
      return next;
    });
  }

  function toggleMotif(key: string) {
    setOpenMotifKey(prev => (prev === key ? null : key));
  }

  const filteredRows = rows.filter(row => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;

    return activeDef.columns.some(column => String(row[column] ?? "").toLowerCase().includes(keyword));
  });

  function renderCell(row: any, column: string) {
    const value = row[column];

    if (column === "status") {
      return <span className={`status-pill ${value === "AKTIF" ? "active" : ""}`}>{String(value || "-")}</span>;
    }

    if (column === "hex_code") {
      const hex = String(value || "");
      return (
        <div className="master-color-cell">
          <span className="master-color-swatch" style={{ backgroundColor: hex || "#e2e8f0" }} />
          <strong>{hex || "-"}</strong>
        </div>
      );
    }

    if (column === "description") {
      return <div className="master-description-cell">{value ? String(value) : "-"}</div>;
    }

    if (value === null || value === undefined || value === "") return "-";

    return String(value);
  }

  function renderDataRow(row: any, index: number) {
    return (
      <tr key={row.id || `${activeDef.key}-${index}`}>
        <td>{index + 1}</td>
        {activeDef.columns.map(column => (
          <td key={column}>{renderCell(row, column)}</td>
        ))}
        <td>
          <div className="master-action-stack">
            <button onClick={() => openEdit(row)}>Edit</button>
            <button className="danger" onClick={() => toggleStatus(row)}>
              {row.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"}
            </button>
            <button className="danger solid-danger" onClick={() => deleteRow(row)}>Hapus</button>
          </div>
        </td>
      </tr>
    );
  }

  function renderGroupRow(
    level: "model" | "print" | "motif",
    label: string,
    value: string,
    count: number,
    isOpen: boolean,
    onToggle: () => void
  ) {
    return (
      <tr className={`master-group-row master-group-${level} ${isOpen ? "is-open" : "is-closed"}`}>
        <td colSpan={activeDef.columns.length + 2}>
          <button
            type="button"
            className="master-group-toggle"
            onClick={onToggle}
            title={isOpen ? "Collapse" : "Expand"}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {isOpen ? "−" : "+"}
          </button>
          <span className="master-group-label">{label}</span>
          <strong>{value}</strong>
          <em>{count} data</em>
        </td>
      </tr>
    );
  }

  function renderProductModelRows() {
    if (!loading && filteredRows.length === 0) {
      return (
        <tr>
          <td colSpan={activeDef.columns.length + 2}>
            <div className="empty-state">Belum ada data atau hasil pencarian kosong.</div>
          </td>
        </tr>
      );
    }

    const sortedRows = [...filteredRows].sort((a, b) => {
      const aKey = `${groupValue(a, "model_type")} ${groupValue(a, "print_type")} ${groupValue(a, "motif")} ${groupValue(a, "theme")}`;
      const bKey = `${groupValue(b, "model_type")} ${groupValue(b, "print_type")} ${groupValue(b, "motif")} ${groupValue(b, "theme")}`;
      return aKey.localeCompare(bKey);
    });

    let detailNumber = 0;

    return (
      <>
        {groupByValue(sortedRows, "model_type").map(([modelType, modelRows]) => {
          const modelKey = `model:${modelType}`;
          const modelOpen = openModelKey === modelKey;

          return (
            <Fragment key={modelKey}>
              {renderGroupRow("model", "Jenis Model", modelType, modelRows.length, modelOpen, () => toggleModelType(modelKey))}

              {modelOpen && groupByValue(modelRows, "print_type").map(([printType, printRows]) => {
                const printKey = `${modelKey}:print:${printType}`;
                const printOpen = openPrintKey === printKey;

                return (
                  <Fragment key={printKey}>
                    {renderGroupRow("print", "Tipe Print / Sablon", printType, printRows.length, printOpen, () => togglePrintType(printKey))}

                    {printOpen && groupByValue(printRows, "motif").map(([motif, motifRows]) => {
                      const motifKey = `${printKey}:motif:${motif}`;
                      const motifOpen = openMotifKey === motifKey;

                      return (
                        <Fragment key={motifKey}>
                          {renderGroupRow("motif", "Motif", motif, motifRows.length, motifOpen, () => toggleMotif(motifKey))}

                          {motifOpen && motifRows.map(row => {
                            const currentNumber = detailNumber;
                            detailNumber += 1;
                            return renderDataRow(row, currentNumber);
                          })}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
      </>
    );
  }

  function renderStandardRows() {
    if (!loading && filteredRows.length === 0) {
      return (
        <tr>
          <td colSpan={activeDef.columns.length + 2}>
            <div className="empty-state">Belum ada data atau hasil pencarian kosong.</div>
          </td>
        </tr>
      );
    }

    return (
      <>
        {filteredRows.map((row, index) => renderDataRow(row, index))}
      </>
    );
  }

  return (
    <section className="panel master-crud-panel">
      <div className="section-title master-section-title">
        <div>
          <h1>Master Data</h1>
          <p>CRUD aktif. Kelola etalase, kategori, bahan, warna, ukuran/pola, dan model produk langsung dari Supabase.</p>
        </div>
        <div className="master-toolbar">
          <button className="btn-primary" onClick={openAdd}>+ Tambah {activeDef.label}</button>
          <button onClick={() => load()}>Refresh</button>
        </div>
      </div>

      <div className="master-active-context">
        <span>Menu aktif</span>
        <strong>{activeDef.label}</strong>
        <em>Pilih menu Master Data dari sidebar untuk berpindah data.</em>
      </div>

      <div className="master-info-card">
        <div>
          <h2>{activeDef.title}</h2>
          <p>{activeDef.description}</p>
        </div>
        <div className="master-counter">
          <strong>{filteredRows.length}</strong>
          <span>dari {rows.length} data</span>
        </div>
      </div>

      <div className="master-filter-row">
        <input
          value={search}
          onChange={event => {
            setSearch(event.target.value);
            closeAllModelGroups();
          }}
          placeholder={`Cari ${activeDef.label.toLowerCase()}...`}
        />
        <button onClick={openAdd}>+ Tambah Data</button>
      </div>

      {activeDef.key === "product_models" && (
        <div className="master-hierarchy-note">
          <strong>Mode Accordion v2D.9:</strong> tampilan awal hanya Jenis Model dengan tombol plus (+). Baris anak baru muncul setelah tombol plus parent ditekan.
        </div>
      )}

      {loading && <p className="master-muted">Memuat data master...</p>}
      {error && <div className="error-box master-message">{error}</div>}
      {notice && <div className="success-box master-message">{notice}</div>}

      <div className="table-wrap master-table-wrap">
        <table className={`master-table ${activeDef.key === "product_models" ? "master-model-hierarchy-table" : ""}`}>
          <thead>
            <tr>
              <th style={{ width: 54 }}>No</th>
              {activeDef.columns.map(column => (
                <th key={column}>{displayLabel(activeDef, column)}</th>
              ))}
              <th style={{ minWidth: 250 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {activeDef.key === "product_models" ? renderProductModelRows() : renderStandardRows()}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          className="master-modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="master-modal" onMouseDown={event => event.stopPropagation()}>
            <div className="master-modal-header">
              <div>
                <h2>{editingRow ? `Edit ${activeDef.label}` : `Tambah ${activeDef.label}`}</h2>
                <p>{activeDef.description}</p>
              </div>
              <button className="modal-close master-close" onClick={closeModal}>×</button>
            </div>

            <form onSubmit={save}>
              <div className="master-form-grid">
                {activeDef.fields.map(field => (
                  <label key={field.key} className={field.full ? "master-field-full" : ""}>
                    <span>
                      {field.label}
                      {field.required && <em>*</em>}
                    </span>

                    {field.type === "textarea" ? (
                      <textarea
                        value={form[field.key] ?? ""}
                        onChange={event => updateForm(field.key, event.target.value)}
                        placeholder={field.placeholder || ""}
                        rows={4}
                      />
                    ) : field.type === "status" ? (
                      <select
                        value={form[field.key] || "AKTIF"}
                        onChange={event => updateForm(field.key, event.target.value)}
                      >
                        {STATUS_OPTIONS.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    ) : field.type === "color" ? (
                      <div className="master-color-input">
                        <input
                          type="color"
                          value={normalizeHex(form[field.key])}
                          onChange={event => updateForm(field.key, event.target.value)}
                        />
                        <input
                          value={form[field.key] ?? ""}
                          onChange={event => updateForm(field.key, event.target.value)}
                          placeholder={field.placeholder || "#000000"}
                        />
                      </div>
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : "text"}
                        value={form[field.key] ?? ""}
                        onChange={event => updateForm(field.key, event.target.value)}
                        placeholder={field.placeholder || ""}
                        step={field.type === "number" ? "any" : undefined}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="master-modal-actions">
                <button type="button" onClick={closeModal}>Batal</button>
                <button className="btn-primary" type="submit" disabled={saving}>
                  {saving ? "Menyimpan..." : editingRow ? "Simpan Perubahan" : "Simpan Data"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default MasterDataPage;

