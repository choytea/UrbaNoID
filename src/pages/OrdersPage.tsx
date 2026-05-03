import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";
import { OrderMessage, OrderRow } from "../types";

type OrderItem = Record<string, any>;
type PaymentRow = Record<string, any>;
type ShipmentRow = Record<string, any>;

function formatDate(value: any) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
}

export function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("SEMUA");
  const [error, setError] = useState("");
  const [bookingShipmentId, setBookingShipmentId] = useState("");
  const [trackingShipmentId, setTrackingShipmentId] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(200);

    if (error) {
      setError(error.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    const rows = (data || []) as OrderRow[];
    setOrders(rows);
    if (rows.length && !selectedOrder) setSelectedOrder(rows[0]);
    setLoading(false);
  }

  async function loadDetails(orderId: string) {
    const [{ data: itemRows }, { data: paymentRows }, { data: shipmentRows }, { data: messageRows }] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("payments").select("*").eq("order_id", orderId),
      supabase.from("shipments").select("*").eq("order_id", orderId),
      supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
    ]);

    setItems(itemRows || []);
    setPayments(paymentRows || []);
    setShipments(shipmentRows || []);
    setMessages((messageRows || []) as OrderMessage[]);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedOrder?.id) loadDetails(selectedOrder.id); }, [selectedOrder]);

  async function updateOrderStatus(field: "order_status" | "payment_status" | "shipping_status", value: string) {
    if (!selectedOrder) return;

    const { error } = await supabase.from("orders").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", selectedOrder.id);
    if (error) {
      setError(error.message);
      return;
    }

    await load();
    setSelectedOrder(prev => prev ? { ...prev, [field]: value } : prev);
  }


  function printShipmentLabel(row: ShipmentRow) {
    if (!selectedOrder) return;

    const itemList = items.map(item => `
      <tr>
        <td>${String(item.product_name || "-")}</td>
        <td>${[item.color_name, item.size_name, item.pattern_type].filter(Boolean).join(" / ") || "-"}</td>
        <td style="text-align:center">${Number(item.qty || 0)}</td>
      </tr>
    `).join("");

    const html = `
      <html>
        <head>
          <title>Label ${selectedOrder.order_number || ""}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 18px; color: #111827; }
            .label { width: 100%; max-width: 520px; border: 2px solid #111827; padding: 16px; }
            h1 { margin: 0 0 8px; font-size: 22px; }
            h2 { margin: 12px 0 6px; font-size: 15px; }
            p { margin: 3px 0; font-size: 13px; line-height: 1.35; }
            .barcode { border: 1px dashed #111827; padding: 12px; text-align: center; font-size: 20px; margin: 12px 0; letter-spacing: 2px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #d1d5db; padding: 6px; font-size: 12px; text-align: left; }
            @media print { button { display: none; } body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="label">
            <h1>UrbaNoiD Shipping Label</h1>
            <p><strong>No Order:</strong> ${selectedOrder.order_number || "-"}</p>
            <p><strong>Ekspedisi:</strong> ${row.courier_name || row.expedition_name || "-"} ${row.service_name ? "/ " + row.service_name : ""}</p>
            <p><strong>Resi:</strong> ${row.tracking_number || "BELUM ADA"}</p>
            <div class="barcode">${row.tracking_number || selectedOrder.order_number || "NO-RESI"}</div>
            <h2>Penerima</h2>
            <p><strong>${row.recipient_name || selectedOrder.customer_name || "-"}</strong></p>
            <p>${row.phone || selectedOrder.customer_phone || "-"}</p>
            <p>${row.address || selectedOrder.shipping_address || "-"}</p>
            <p>${[row.district || selectedOrder.shipping_district, row.city || selectedOrder.shipping_city, row.province || selectedOrder.shipping_province, row.postal_code || selectedOrder.shipping_postal_code].filter(Boolean).join(", ")}</p>
            <h2>Item</h2>
            <table>
              <thead><tr><th>Produk</th><th>Varian</th><th>Qty</th></tr></thead>
              <tbody>${itemList}</tbody>
            </table>
            <p style="margin-top:12px"><strong>Catatan:</strong> ${selectedOrder.notes || "-"}</p>
          </div>
          <br />
          <button onclick="window.print()">Cetak Label</button>
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=620,height=780");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  async function updateTrackingNumber(row: ShipmentRow) {
    const value = window.prompt("Masukkan nomor resi pengiriman:", row.tracking_number || "");
    if (value === null) return;

    const trackingNumber = value.trim();
    const { error } = await supabase
      .from("shipments")
      .update({
        tracking_number: trackingNumber || null,
        booking_status: trackingNumber ? "MANUAL_RESI" : "BELUM_BOOKING",
        shipped_at: trackingNumber ? new Date().toISOString() : null,
      })
      .eq("id", row.id);

    if (error) {
      setError(error.message);
      return;
    }

    if (trackingNumber && selectedOrder) {
      await supabase.from("orders").update({
        shipping_status: "DIKIRIM",
        updated_at: new Date().toISOString(),
      }).eq("id", selectedOrder.id);
    }

    if (selectedOrder) await loadDetails(selectedOrder.id);
    await load();
  }



  function isBiteshipShipment(row: ShipmentRow) {
    const provider = String(row.provider_name || row.expedition_name || row.courier_name || "").toLowerCase();
    return provider.includes("biteship") || row.supports_api_booking || row.provider_order_id || row.booking_status === "BITESHIP_BOOKED";
  }

  async function bookBiteship(row: ShipmentRow) {
    if (!selectedOrder) return;

    const ok = confirm(`Booking resi Biteship untuk pesanan ${selectedOrder.order_number}? Pastikan data alamat toko, alamat buyer, berat, dan ekspedisi sudah benar.`);
    if (!ok) return;

    setError("");
    setBookingShipmentId(row.id);

    const { data, error } = await supabase.functions.invoke("shipping-booking", {
      body: {
        shipment_id: row.id,
        force: false,
      },
    });

    setBookingShipmentId("");

    if (error) {
      setError(error.message);
      return;
    }

    if ((data as any)?.error) {
      setError((data as any).error);
      return;
    }

    if (selectedOrder.id) await loadDetails(selectedOrder.id);
    await load();
  }

  async function trackBiteship(row: ShipmentRow) {
    if (!row.tracking_number && !row.provider_tracking_id) {
      setError("Nomor resi/tracking belum tersedia.");
      return;
    }

    setError("");
    setTrackingShipmentId(row.id);

    const { data, error } = await supabase.functions.invoke("shipping-track", {
      body: {
        shipment_id: row.id,
      },
    });

    setTrackingShipmentId("");

    if (error) {
      setError(error.message);
      return;
    }

    if ((data as any)?.error) {
      setError((data as any).error);
      return;
    }

    if (selectedOrder?.id) await loadDetails(selectedOrder.id);
    await load();
  }


  async function sendMessage() {
    if (!selectedOrder || !newMessage.trim()) return;

    const { error } = await supabase.from("order_messages").insert({
      order_id: selectedOrder.id,
      sender_role: "SELLER",
      message: newMessage.trim(),
    });

    if (error) {
      setError(error.message);
      return;
    }

    setNewMessage("");
    await loadDetails(selectedOrder.id);
  }

  const filtered = useMemo(() => {
    return orders.filter(order => {
      const q = query.trim().toLowerCase();
      const matchQuery = !q || [order.order_number, order.customer_name, order.customer_email, order.customer_phone, order.order_status, order.payment_status, order.shipping_status]
        .some(value => String(value || "").toLowerCase().includes(q));
      const matchStatus = statusFilter === "SEMUA" || order.order_status === statusFilter || order.payment_status === statusFilter || order.shipping_status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [orders, query, statusFilter]);

  const totals = useMemo(() => ({
    all: orders.length,
    unpaid: orders.filter(order => order.payment_status !== "DIBAYAR").length,
    paid: orders.filter(order => order.payment_status === "DIBAYAR").length,
    shipped: orders.filter(order => order.shipping_status === "DIKIRIM").length,
  }), [orders]);

  return (
    <section className="panel orders-panel phase3b-orders">
      <div className="section-title">
        <div>
          <h1>Pesanan</h1>
          <p>Monitoring transaksi buyer, detail item, pembayaran, pengiriman, dan chat dua arah.</p>
        </div>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="metric-grid compact-metrics">
        <div className="metric-card"><span>Total</span><strong>{totals.all}</strong></div>
        <div className="metric-card"><span>Belum Dibayar</span><strong>{totals.unpaid}</strong></div>
        <div className="metric-card"><span>Dibayar</span><strong>{totals.paid}</strong></div>
        <div className="metric-card"><span>Dikirim</span><strong>{totals.shipped}</strong></div>
      </div>

      <div className="orders-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nomor pesanan, nama buyer, status, email..." />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="SEMUA">Semua Status</option>
          <option value="MENUNGGU_PEMBAYARAN">Menunggu Pembayaran</option>
          <option value="DIPROSES">Diproses</option>
          <option value="DIBAYAR">Dibayar</option>
          <option value="DIKIRIM">Dikirim</option>
          <option value="SELESAI">Selesai</option>
          <option value="DIBATALKAN">Dibatalkan</option>
        </select>
      </div>

      {loading && <p>Memuat pesanan...</p>}
      {error && <div className="error-box">{error}</div>}

      <div className="orders-workspace">
        <div className="orders-list">
          {filtered.map(order => (
            <button key={order.id} className={selectedOrder?.id === order.id ? "order-list-card active" : "order-list-card"} onClick={() => setSelectedOrder(order)}>
              <strong>{order.order_number}</strong>
              <span>{order.customer_name || "-"} · {formatDate(order.created_at)}</span>
              <em>{formatCurrency(Number(order.grand_total || order.total_amount || 0))}</em>
              <small>{order.order_status} / {order.payment_status} / {order.shipping_status}</small>
            </button>
          ))}
          {!loading && filtered.length === 0 && <div className="empty-state">Belum ada pesanan atau hasil pencarian kosong.</div>}
        </div>

        <div className="order-detail-pane">
          {!selectedOrder ? (
            <div className="empty-state">Pilih pesanan untuk melihat detail.</div>
          ) : (
            <>
              <div className="order-detail-head">
                <div>
                  <h2>{selectedOrder.order_number}</h2>
                  <p>{selectedOrder.customer_name} · {selectedOrder.customer_email} · {selectedOrder.customer_phone}</p>
                </div>
                <strong>{formatCurrency(Number(selectedOrder.grand_total || selectedOrder.total_amount || 0))}</strong>
              </div>

              <div className="order-status-grid">
                <label>
                  Status Order
                  <select value={selectedOrder.order_status || ""} onChange={e => updateOrderStatus("order_status", e.target.value)}>
                    <option value="MENUNGGU_PEMBAYARAN">Menunggu Pembayaran</option>
                    <option value="DIPROSES">Diproses</option>
                    <option value="SELESAI">Selesai</option>
                    <option value="DIBATALKAN">Dibatalkan</option>
                  </select>
                </label>
                <label>
                  Pembayaran
                  <select value={selectedOrder.payment_status || ""} onChange={e => updateOrderStatus("payment_status", e.target.value)}>
                    <option value="BELUM_DIBAYAR">Belum Dibayar</option>
                    <option value="MENUNGGU_KONFIRMASI">Menunggu Konfirmasi</option>
                    <option value="DIBAYAR">Dibayar</option>
                    <option value="DITOLAK">Ditolak</option>
                  </select>
                </label>
                <label>
                  Pengiriman
                  <select value={selectedOrder.shipping_status || ""} onChange={e => updateOrderStatus("shipping_status", e.target.value)}>
                    <option value="BELUM_DIKIRIM">Belum Dikirim</option>
                    <option value="DIKEMAS">Dikemas</option>
                    <option value="DIKIRIM">Dikirim</option>
                    <option value="DITERIMA">Diterima</option>
                  </select>
                </label>
              </div>

              <div className="order-info-grid">
                <div>
                  <h3>Alamat Buyer</h3>
                  <p>{selectedOrder.shipping_address || "-"}</p>
                  <p>{[selectedOrder.shipping_district, selectedOrder.shipping_city, selectedOrder.shipping_province, selectedOrder.shipping_postal_code].filter(Boolean).join(", ")}</p>
                </div>
                <div>
                  <h3>Pengiriman</h3>
                  {shipments.map(row => (
                    <div className="shipment-card" key={row.id}>
                      <p>{row.courier_name || row.expedition_name || "-"} {row.service_name ? `/ ${row.service_name}` : ""} · {formatCurrency(Number(row.shipping_cost || 0))}</p>
                      <p>Resi: <strong>{row.tracking_number || "Belum ada"}</strong></p>
                      <p>Status booking: {row.booking_status || "BELUM_BOOKING"}</p>
                      {row.provider_order_id && <p>Biteship Order ID: <strong>{row.provider_order_id}</strong></p>}
                      {row.tracking_url && <p><a href={row.tracking_url} target="_blank" rel="noreferrer">Buka Tracking</a></p>}
                      {row.label_url && <p><a href={row.label_url} target="_blank" rel="noreferrer">Buka Label Biteship</a></p>}
                      {row.biteship_error && <p className="shipment-error-note">{row.biteship_error}</p>}
                      <div className="button-row mini-button-row">
                        <button onClick={() => updateTrackingNumber(row)}>Input Resi</button>
                        <button onClick={() => printShipmentLabel(row)}>Cetak Label</button>
                        <button className="btn-primary" disabled={bookingShipmentId === row.id || !!row.provider_order_id} onClick={() => bookBiteship(row)}>
                          {bookingShipmentId === row.id ? "Booking..." : row.provider_order_id ? "Sudah Booking" : "Booking Biteship"}
                        </button>
                        <button disabled={trackingShipmentId === row.id || (!row.tracking_number && !row.provider_tracking_id)} onClick={() => trackBiteship(row)}>
                          {trackingShipmentId === row.id ? "Tracking..." : "Cek Tracking"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {shipments.length === 0 && <p>-</p>}
                </div>
                <div>
                  <h3>Pembayaran</h3>
                  {payments.map(row => (
                    <p key={row.id}>{row.payment_method || row.payment_method_code || "-"} · {row.payment_status || "-"} · {formatCurrency(Number(row.amount || 0))}</p>
                  ))}
                  {payments.length === 0 && <p>Belum ada metode pembayaran tercatat.</p>}
                </div>
              </div>

              <h3>Item Pesanan</h3>
              <div className="table-wrap">
                <table className="master-table compact-table">
                  <thead><tr><th>Produk</th><th>Varian</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {items.map(row => (
                      <tr key={row.id}>
                        <td>{row.product_name}</td>
                        <td>{[row.color_name, row.size_name, row.pattern_type].filter(Boolean).join(" / ")}</td>
                        <td>{row.qty}</td>
                        <td>{formatCurrency(Number(row.unit_price || 0))}</td>
                        <td>{formatCurrency(Number(row.subtotal || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>Chat Buyer/Seller</h3>
              <div className="chat-box seller-chat-box">
                {messages.map(msg => (
                  <div key={msg.id} className={`chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
                    <small>{msg.sender_role || "USER"} · {formatDate(msg.created_at)}</small>
                    <span>{msg.message}</span>
                  </div>
                ))}
                {messages.length === 0 && <div className="empty-state">Belum ada chat.</div>}
              </div>
              <div className="chat-input-row">
                <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Tulis pesan ke buyer..." />
                <button className="btn-primary" onClick={sendMessage}>Kirim</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default OrdersPage;
