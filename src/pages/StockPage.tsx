import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type ProductRow = {
  id: string;
  product_name?: string | null;
  sku_product?: string | null;
  status?: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku_variant?: string | null;
  variant_name?: string | null;
  stock_qty?: number | null;
  stock_min?: number | null;
  base_price?: number | null;
  status?: string | null;
  colors?: { name?: string | null } | null;
  sizes?: { size_name?: string | null; pattern_type?: string | null } | null;
};

type StockRow = VariantRow & {
  product?: ProductRow | null;
};

function numberOrZero(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numberOrZero(value));
}

function stockStatus(row: StockRow) {
  const qty = numberOrZero(row.stock_qty);
  const min = numberOrZero(row.stock_min);

  if (String(row.status || "").toUpperCase() !== "AKTIF") return "NONAKTIF";
  if (qty <= 0) return "HABIS";
  if (min > 0 && qty <= min) return "MENIPIS";
  return "AMAN";
}

function statusLabel(status: string) {
  if (status === "HABIS") return "Habis";
  if (status === "MENIPIS") return "Menipis";
  if (status === "NONAKTIF") return "Nonaktif";
  return "Aman";
}

export default function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "AMAN" | "MENIPIS" | "HABIS" | "NONAKTIF">("ALL");

  async function loadRows() {
    setLoading(true);
    setError("");
    setNotice("");

    const { data: variants, error: variantError } = await supabase
      .from("product_variants")
      .select(`
        id,
        product_id,
        sku_variant,
        variant_name,
        stock_qty,
        stock_min,
        base_price,
        status,
        colors(name),
        sizes(size_name, pattern_type)
      `)
      .order("stock_qty", { ascending: true });

    if (variantError) {
      setError(variantError.message);
      setLoading(false);
      return;
    }

    const variantRows = (variants || []) as unknown as VariantRow[];
    const productIds = Array.from(new Set(variantRows.map(row => row.product_id).filter(Boolean)));

    let productMap = new Map<string, ProductRow>();

    if (productIds.length) {
      const { data: products, error: productError } = await supabase
        .from("products")
        .select("id, product_name, sku_product, status")
        .in("id", productIds);

      if (productError) {
        setError(productError.message);
        setLoading(false);
        return;
      }

      productMap = new Map(((products || []) as ProductRow[]).map(product => [product.id, product]));
    }

    setRows(variantRows.map(row => ({
      ...row,
      product: productMap.get(row.product_id) || null,
    })));

    setLoading(false);
  }

  useEffect(() => {
    loadRows();
  }, []);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const status = stockStatus(row);
        acc.total += 1;
        acc.stock += numberOrZero(row.stock_qty);
        if (status === "AMAN") acc.aman += 1;
        if (status === "MENIPIS") acc.menipis += 1;
        if (status === "HABIS") acc.habis += 1;
        if (status === "NONAKTIF") acc.nonaktif += 1;
        return acc;
      },
      { total: 0, stock: 0, aman: 0, menipis: 0, habis: 0, nonaktif: 0 }
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter(row => {
      const status = stockStatus(row);
      if (filter !== "ALL" && status !== filter) return false;

      if (!q) return true;

      const haystack = [
        row.product?.product_name,
        row.product?.sku_product,
        row.sku_variant,
        row.variant_name,
        row.colors?.name,
        row.sizes?.size_name,
        row.sizes?.pattern_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, query, filter]);

  function updateDraft(id: string, field: "stock_qty" | "stock_min", value: string) {
    const numeric = Math.max(0, numberOrZero(value));

    setRows(prev => prev.map(row => (
      row.id === id ? { ...row, [field]: numeric } : row
    )));
  }

  async function saveStock(row: StockRow) {
    setSavingId(row.id);
    setError("");
    setNotice("");

    const payload = {
      stock_qty: Math.max(0, numberOrZero(row.stock_qty)),
      stock_min: Math.max(0, numberOrZero(row.stock_min)),
    };

    const { error: updateError } = await supabase
      .from("product_variants")
      .update(payload)
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      setSavingId("");
      return;
    }

    setNotice(`Stok berhasil diperbarui untuk ${row.variant_name || row.sku_variant || "varian produk"}.`);
    setSavingId("");
    await loadRows();
  }

  return (
    <section className="stock-page phase3b9a1-stock-page">
      <div className="page-header stock-page-header">
        <div>
          <p className="eyebrow">Seller</p>
          <h1>Stok Produk</h1>
          <p>Kelola stok dan stok minimum per varian produk tanpa membuka Product Matrix.</p>
        </div>

        <button type="button" className="btn-primary" onClick={loadRows} disabled={loading}>
          {loading ? "Memuat..." : "Refresh"}
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="stock-summary-grid">
        <div><small>Total Varian</small><strong>{summary.total}</strong></div>
        <div><small>Total Stok</small><strong>{summary.stock}</strong></div>
        <div><small>Aman</small><strong>{summary.aman}</strong></div>
        <div><small>Menipis</small><strong>{summary.menipis}</strong></div>
        <div><small>Habis</small><strong>{summary.habis}</strong></div>
      </div>

      <div className="stock-toolbar">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cari produk, SKU, warna, ukuran..."
        />

        <select value={filter} onChange={event => setFilter(event.target.value as any)}>
          <option value="ALL">Semua Status</option>
          <option value="AMAN">Aman</option>
          <option value="MENIPIS">Menipis</option>
          <option value="HABIS">Habis</option>
          <option value="NONAKTIF">Nonaktif</option>
        </select>
      </div>

      <div className="table-wrap stock-table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th>Produk</th>
              <th>Varian</th>
              <th>Warna / Ukuran</th>
              <th>Harga</th>
              <th>Stok</th>
              <th>Stok Minimum</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8}>Memuat data stok...</td>
              </tr>
            )}

            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={8}>Tidak ada data stok sesuai filter.</td>
              </tr>
            )}

            {!loading && filteredRows.map(row => {
              const status = stockStatus(row);

              return (
                <tr key={row.id}>
                  <td>
                    <strong>{row.product?.product_name || "-"}</strong>
                    <small>{row.product?.sku_product || "-"}</small>
                  </td>
                  <td>
                    <strong>{row.variant_name || "-"}</strong>
                    <small>{row.sku_variant || "-"}</small>
                  </td>
                  <td>
                    <span>{row.colors?.name || "-"}</span>
                    <small>{[row.sizes?.size_name, row.sizes?.pattern_type].filter(Boolean).join(" / ") || "-"}</small>
                  </td>
                  <td>{formatCurrency(row.base_price)}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={numberOrZero(row.stock_qty)}
                      onChange={event => updateDraft(row.id, "stock_qty", event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={numberOrZero(row.stock_min)}
                      onChange={event => updateDraft(row.id, "stock_min", event.target.value)}
                    />
                  </td>
                  <td>
                    <span className={`stock-status ${status.toLowerCase()}`}>
                      {statusLabel(status)}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => saveStock(row)} disabled={savingId === row.id}>
                      {savingId === row.id ? "Menyimpan..." : "Simpan"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
