import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Metric = {
  label: string;
  value: number;
};

export function SellerDashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  async function countTable(table: string) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) {
      console.error(table, error.message);
      return 0;
    }
    return count || 0;
  }

  async function load() {
    setLoading(true);
    const values = await Promise.all([
      countTable("products"),
      countTable("product_variants"),
      countTable("orders"),
      countTable("payments"),
      countTable("stock_mutations"),
    ]);

    setMetrics([
      { label: "Produk", value: values[0] },
      { label: "Varian", value: values[1] },
      { label: "Order", value: values[2] },
      { label: "Pembayaran", value: values[3] },
      { label: "Mutasi Stok", value: values[4] },
    ]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="panel seller-dashboard-panel">
      <div className="section-title">
        <div>
          <h1>Seller Dashboard</h1>
          <p>Fondasi awal untuk mengelola produk, order, pembayaran, pengiriman, dan stok.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      {loading ? <p>Memuat dashboard...</p> : (
        <div className="metric-grid">
          {metrics.map(m => (
            <div className="metric-card" key={m.label}>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="seller-dashboard-hint">
        Gunakan menu sidebar untuk membuka Product Matrix, Master Data, Pesanan, dan Preview Buyer Catalog.
      </div>
    </section>
  );
}
