import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";

type OrderRow = Record<string, any>;

const preferredColumns = [
  "order_number",
  "customer_name",
  "buyer_name",
  "email",
  "phone",
  "status",
  "payment_status",
  "shipping_status",
  "total_amount",
  "grand_total",
  "created_at",
];

function formatValue(key: string, value: any) {
  if (value === null || value === undefined || value === "") return "-";
  if (["total_amount", "grand_total", "subtotal", "shipping_cost"].includes(key)) return formatCurrency(Number(value || 0));
  if (key.includes("created_at") || key.includes("updated_at") || key.includes("paid_at")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("id-ID");
  }
  return String(value);
}

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    let { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error && error.message.includes("created_at")) {
      const retry = await supabase.from("orders").select("*").limit(100);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      setError(error.message);
      setOrders([]);
    } else {
      setOrders(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const columns = useMemo(() => {
    const sample = orders[0] || {};
    const available = Object.keys(sample);
    const preferred = preferredColumns.filter(column => available.includes(column));
    const fallback = available.filter(column => !preferred.includes(column) && !["id", "buyer_id", "profile_id"].includes(column));
    return [...preferred, ...fallback].slice(0, 10);
  }, [orders]);

  const filtered = orders.filter(order => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return Object.values(order).some(value => String(value ?? "").toLowerCase().includes(keyword));
  });

  return (
    <section className="panel orders-panel">
      <div className="section-title">
        <div>
          <h1>Pesanan</h1>
          <p>Starter monitoring pesanan dari tabel orders. Detail proses order akan disempurnakan pada fase berikutnya.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="master-filter-row">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cari nomor pesanan, nama pembeli, status, email..."
        />
      </div>

      {loading && <p>Memuat pesanan...</p>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state">Belum ada pesanan atau hasil pencarian kosong.</div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="table-wrap orders-table-wrap">
          <table className="master-table orders-table">
            <thead>
              <tr>
                <th>No</th>
                {columns.map(column => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, index) => (
                <tr key={order.id || index}>
                  <td>{index + 1}</td>
                  {columns.map(column => (
                    <td key={column}>{formatValue(column, order[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default OrdersPage;
