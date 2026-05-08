import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type ProductRow = {
  id: string;
  product_name?: string | null;
  sku_product?: string | null;
  status?: string | null;
  showcase_id?: string | null;
  showcases?: any;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku_variant?: string | null;
  variant_name?: string | null;
  stock_qty?: number | null;
  stock_min?: number | null;
  base_price?: number | null;
  hpp_cost?: number | null;
  status?: string | null;
  colors?: { name?: string | null } | null;
  sizes?: { size_name?: string | null; pattern_type?: string | null } | null;
};

type StockRow = VariantRow & {
  product?: ProductRow | null;
};

type ColorGroup = {
  key: string;
  colorName: string;
  rows: StockRow[];
  totalStock: number;
  totalVariants: number;
  totalHppUnit: number;
  stockAssetValue: number;
  lowStockCount: number;
  emptyStockCount: number;
};

type ProductGroup = {
  key: string;
  product: ProductRow | null;
  productName: string;
  skuProduct: string;
  etalaseName: string;
  rows: StockRow[];
  colorGroups: ColorGroup[];
  totalStock: number;
  totalVariants: number;
  totalHppUnit: number;
  stockAssetValue: number;
  lowStockCount: number;
  emptyStockCount: number;
};

type EtalaseGroup = {
  key: string;
  etalaseName: string;
  productGroups: ProductGroup[];
  totalProducts: number;
  totalStock: number;
  totalVariants: number;
  totalHppUnit: number;
  stockAssetValue: number;
  lowStockCount: number;
  emptyStockCount: number;
};

function numberOrZero(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numberOrZero(value));
}

function normalizeKey(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function relName(value: any): string {
  if (!value) return "";

  if (Array.isArray(value)) {
    return relName(value[0]);
  }

  if (typeof value === "object") {
    return asText(value.name || value.etalase_name || value.title || value.label);
  }

  return asText(value);
}

function colorNameOf(row: StockRow) {
  return row.colors?.name || "Tanpa Warna";
}

function productEtalaseName(product: ProductRow | null) {
  return relName(product?.showcases) || "Tanpa Etalase";
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

function rowSearchText(row: StockRow) {
  return [
    productEtalaseName(row.product || null),
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
}

function buildColorGroups(rows: StockRow[]) {
  const map = new Map<string, ColorGroup>();

  rows.forEach(row => {
    const colorName = colorNameOf(row);
    const key = normalizeKey(colorName) || "tanpa-warna";

    const current = map.get(key) || {
      key,
      colorName,
      rows: [],
      totalStock: 0,
      totalVariants: 0,
      totalHppUnit: 0,
      stockAssetValue: 0,
      lowStockCount: 0,
      emptyStockCount: 0,
    };

    const qty = numberOrZero(row.stock_qty);
    const hpp = numberOrZero(row.hpp_cost);
    const status = stockStatus(row);

    current.rows.push(row);
    current.totalVariants += 1;
    current.totalStock += qty;
    current.totalHppUnit += hpp;
    current.stockAssetValue += qty * hpp;

    if (status === "MENIPIS") current.lowStockCount += 1;
    if (status === "HABIS") current.emptyStockCount += 1;

    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => a.colorName.localeCompare(b.colorName));
}

export default function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "AMAN" | "MENIPIS" | "HABIS" | "NONAKTIF">("ALL");
  const [collapsedEtalase, setCollapsedEtalase] = useState<Record<string, boolean>>({});
  const [collapsedProducts, setCollapsedProducts] = useState<Record<string, boolean>>({});
  const [collapsedColors, setCollapsedColors] = useState<Record<string, boolean>>({});

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
        hpp_cost,
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
        .select("id, product_name, sku_product, status, showcase_id, showcases(name)")
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
      hpp_cost: numberOrZero(row.hpp_cost),
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
        const stock = numberOrZero(row.stock_qty);
        const hpp = numberOrZero(row.hpp_cost);

        acc.total += 1;
        acc.stock += stock;
        acc.hppUnit += hpp;
        acc.stockAsset += stock * hpp;

        if (status === "AMAN") acc.aman += 1;
        if (status === "MENIPIS") acc.menipis += 1;
        if (status === "HABIS") acc.habis += 1;
        if (status === "NONAKTIF") acc.nonaktif += 1;

        return acc;
      },
      { total: 0, stock: 0, hppUnit: 0, stockAsset: 0, aman: 0, menipis: 0, habis: 0, nonaktif: 0 }
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter(row => {
      const status = stockStatus(row);
      if (filter !== "ALL" && status !== filter) return false;
      if (!q) return true;
      return rowSearchText(row).includes(q);
    });
  }, [rows, query, filter]);

  const etalaseGroups = useMemo<EtalaseGroup[]>(() => {
    const productMap = new Map<string, ProductGroup>();

    filteredRows.forEach(row => {
      const key = row.product_id || "tanpa-produk";
      const productName = row.product?.product_name || "Produk tanpa nama";
      const skuProduct = row.product?.sku_product || "-";
      const etalaseName = productEtalaseName(row.product || null);

      const current = productMap.get(key) || {
        key,
        product: row.product || null,
        productName,
        skuProduct,
        etalaseName,
        rows: [],
        colorGroups: [],
        totalStock: 0,
        totalVariants: 0,
        totalHppUnit: 0,
        stockAssetValue: 0,
        lowStockCount: 0,
        emptyStockCount: 0,
      };

      const qty = numberOrZero(row.stock_qty);
      const hpp = numberOrZero(row.hpp_cost);
      const status = stockStatus(row);

      current.rows.push(row);
      current.totalVariants += 1;
      current.totalStock += qty;
      current.totalHppUnit += hpp;
      current.stockAssetValue += qty * hpp;

      if (status === "MENIPIS") current.lowStockCount += 1;
      if (status === "HABIS") current.emptyStockCount += 1;

      productMap.set(key, current);
    });

    const productGroups = Array.from(productMap.values())
      .map(group => ({
        ...group,
        colorGroups: buildColorGroups(group.rows),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName));

    const etalaseMap = new Map<string, EtalaseGroup>();

    productGroups.forEach(product => {
      const key = `${normalizeKey(product.etalaseName) || "tanpa-etalase"}::${product.etalaseName}`;

      const current = etalaseMap.get(key) || {
        key,
        etalaseName: product.etalaseName,
        productGroups: [],
        totalProducts: 0,
        totalStock: 0,
        totalVariants: 0,
        totalHppUnit: 0,
        stockAssetValue: 0,
        lowStockCount: 0,
        emptyStockCount: 0,
      };

      current.productGroups.push(product);
      current.totalProducts += 1;
      current.totalStock += product.totalStock;
      current.totalVariants += product.totalVariants;
      current.totalHppUnit += product.totalHppUnit;
      current.stockAssetValue += product.stockAssetValue;
      current.lowStockCount += product.lowStockCount;
      current.emptyStockCount += product.emptyStockCount;

      etalaseMap.set(key, current);
    });

    return Array.from(etalaseMap.values()).sort((a, b) => a.etalaseName.localeCompare(b.etalaseName));
  }, [filteredRows]);

  function toggleEtalase(key: string) {
    setCollapsedEtalase(prev => ({ ...prev, [key]: !(prev[key] ?? false) }));
  }

  function toggleProduct(key: string) {
    setCollapsedProducts(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function toggleColor(key: string) {
    setCollapsedColors(prev => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function openAllGroups() {
    const nextEtalase: Record<string, boolean> = {};
    const nextProducts: Record<string, boolean> = {};
    const nextColors: Record<string, boolean> = {};

    etalaseGroups.forEach(etalase => {
      nextEtalase[etalase.key] = false;

      etalase.productGroups.forEach(product => {
        const productKey = etalase.key + "::" + product.key;
        nextProducts[productKey] = false;

        product.colorGroups.forEach(color => {
          nextColors[productKey + "::" + color.key] = false;
        });
      });
    });

    setCollapsedEtalase(nextEtalase);
    setCollapsedProducts(nextProducts);
    setCollapsedColors(nextColors);
  }

  function closeAllGroups() {
    const nextEtalase: Record<string, boolean> = {};
    const nextProducts: Record<string, boolean> = {};
    const nextColors: Record<string, boolean> = {};

    etalaseGroups.forEach(etalase => {
      nextEtalase[etalase.key] = true;

      etalase.productGroups.forEach(product => {
        const productKey = etalase.key + "::" + product.key;
        nextProducts[productKey] = true;

        product.colorGroups.forEach(color => {
          nextColors[productKey + "::" + color.key] = true;
        });
      });
    });

    setCollapsedEtalase(nextEtalase);
    setCollapsedProducts(nextProducts);
    setCollapsedColors(nextColors);
  }

  function updateDraft(id: string, field: "stock_qty" | "stock_min" | "hpp_cost", value: string) {
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
      hpp_cost: Math.max(0, numberOrZero(row.hpp_cost)),
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

    setNotice("Stok dan HPP berhasil diperbarui untuk " + (row.variant_name || row.sku_variant || "varian produk") + ".");
    setSavingId("");
    await loadRows();
  }

  return (
    <section className="stock-page phase3b9a1-stock-page phase3b9b2a-r5-stock-accordion-page phase3b9b2a-r7-color-accordion-page phase3b9b3g-stock-etalase-page">
      <div className="page-header stock-page-header">
        <div>
          <p className="eyebrow">Seller</p>
          <h1>Stok Produk</h1>
          <p>Kelola stok, stok minimum, dan HPP/biaya produksi per varian produk.</p>
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
        <div><small>Total HPP Unit</small><strong>{formatCurrency(summary.hppUnit)}</strong></div>
        <div><small>Nilai Stok HPP</small><strong>{formatCurrency(summary.stockAsset)}</strong></div>
        <div><small>Aman</small><strong>{summary.aman}</strong></div>
        <div><small>Menipis</small><strong>{summary.menipis}</strong></div>
        <div><small>Habis</small><strong>{summary.habis}</strong></div>
      </div>

      <div className="stock-toolbar stock-accordion-toolbar">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cari etalase, produk, SKU, warna, ukuran..."
        />

        <select value={filter} onChange={event => setFilter(event.target.value as any)}>
          <option value="ALL">Semua Status</option>
          <option value="AMAN">Aman</option>
          <option value="MENIPIS">Menipis</option>
          <option value="HABIS">Habis</option>
          <option value="NONAKTIF">Nonaktif</option>
        </select>

        <button type="button" onClick={openAllGroups}>Buka Semua</button>
        <button type="button" onClick={closeAllGroups}>Tutup Semua</button>
      </div>

      {loading && <div className="stock-product-card">Memuat data stok...</div>}
      {!loading && etalaseGroups.length === 0 && <div className="stock-product-card">Tidak ada data stok sesuai filter.</div>}

      {!loading && etalaseGroups.length > 0 && (
        <div className="stock-etalase-list">
          {etalaseGroups.map(etalase => {
            const etalaseCollapsed = collapsedEtalase[etalase.key] ?? true;

            return (
              <section key={etalase.key} className="stock-etalase-card">
                <button
                  type="button"
                  className="stock-etalase-summary-btn"
                  onClick={() => toggleEtalase(etalase.key)}
                  aria-expanded={!etalaseCollapsed}
                >
                  <span className="stock-etalase-toggle">{etalaseCollapsed ? "+" : "-"}</span>
                  <span className="stock-etalase-main">
                    <strong>Etalase: {etalase.etalaseName}</strong>
                    <small>{etalase.totalProducts} produk - {etalase.totalVariants} varian - stok {etalase.totalStock}</small>
                  </span>
                  <span className="stock-etalase-meta">
                    <span>{etalase.totalProducts} produk</span>
                    <span>{etalase.totalVariants} varian</span>
                    <span>stok {etalase.totalStock}</span>
                    <span>HPP unit {formatCurrency(etalase.totalHppUnit)}</span>
                    <span>nilai stok {formatCurrency(etalase.stockAssetValue)}</span>
                  </span>
                </button>

                {!etalaseCollapsed && (
                  <div className="stock-etalase-panel">
                    {etalase.productGroups.map(product => {
                      const productKey = etalase.key + "::" + product.key;
                      const productCollapsed = collapsedProducts[productKey] ?? true;

                      return (
                        <article key={productKey} className="stock-product-card">
                          <button
                            type="button"
                            className="stock-product-summary-btn"
                            onClick={() => toggleProduct(productKey)}
                            aria-expanded={!productCollapsed}
                          >
                            <span className="stock-product-toggle">{productCollapsed ? "+" : "-"}</span>
                            <span className="stock-product-summary-main">
                              <strong>{product.productName}</strong>
                              <small>{product.skuProduct}</small>
                            </span>
                            <span className="stock-product-summary-meta">
                              <span>{product.totalVariants} varian</span>
                              <span>{product.colorGroups.length} warna</span>
                              <span>stok {product.totalStock}</span>
                              <span>HPP unit {formatCurrency(product.totalHppUnit)}</span>
                              <span>nilai stok {formatCurrency(product.stockAssetValue)}</span>
                            </span>
                          </button>

                          {!productCollapsed && (
                            <div className="stock-product-panel">
                              {product.colorGroups.map(color => {
                                const colorKey = productKey + "::" + color.key;
                                const colorCollapsed = collapsedColors[colorKey] ?? true;

                                return (
                                  <section key={colorKey} className="stock-color-card">
                                    <button
                                      type="button"
                                      className="stock-color-summary-btn"
                                      onClick={() => toggleColor(colorKey)}
                                      aria-expanded={!colorCollapsed}
                                    >
                                      <span className="stock-color-toggle">{colorCollapsed ? "+" : "-"}</span>
                                      <span className="stock-color-title">
                                        <strong>{color.colorName}</strong>
                                        <small>{color.totalVariants} ukuran / pola</small>
                                      </span>
                                      <span className="stock-color-meta">
                                        <span>stok {color.totalStock}</span>
                                        <span>HPP unit {formatCurrency(color.totalHppUnit)}</span>
                                        <span>nilai stok {formatCurrency(color.stockAssetValue)}</span>
                                      </span>
                                    </button>

                                    {!colorCollapsed && (
                                      <div className="stock-color-panel">
                                        <div className="table-wrap stock-table-wrap">
                                          <table className="stock-table stock-accordion-table">
                                            <thead>
                                              <tr>
                                                <th>Varian</th>
                                                <th>Ukuran / Pola</th>
                                                <th>Harga Jual</th>
                                                <th>HPP / Unit</th>
                                                <th>Stok</th>
                                                <th>Stok Minimum</th>
                                                <th>Status</th>
                                                <th>Aksi</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {color.rows.map(row => {
                                                const status = stockStatus(row);
                                                return (
                                                  <tr key={row.id}>
                                                    <td><strong>{row.variant_name || "-"}</strong><small>{row.sku_variant || "-"}</small></td>
                                                    <td><span>{[row.sizes?.size_name, row.sizes?.pattern_type].filter(Boolean).join(" / ") || "-"}</span></td>
                                                    <td>{formatCurrency(row.base_price)}</td>
                                                    <td><input type="number" min={0} value={numberOrZero(row.hpp_cost)} onChange={event => updateDraft(row.id, "hpp_cost", event.target.value)} /></td>
                                                    <td><input type="number" min={0} value={numberOrZero(row.stock_qty)} onChange={event => updateDraft(row.id, "stock_qty", event.target.value)} /></td>
                                                    <td><input type="number" min={0} value={numberOrZero(row.stock_min)} onChange={event => updateDraft(row.id, "stock_min", event.target.value)} /></td>
                                                    <td><span className={"stock-status " + status.toLowerCase()}>{statusLabel(status)}</span></td>
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
                                      </div>
                                    )}
                                  </section>
                                );
                              })}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

