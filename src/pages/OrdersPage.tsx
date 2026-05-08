import { formatTrackingError3B10B, formatTrackingStatus3B10B } from '../utils/phase3b10bTrackingDisplay';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";
import { OrderMessage, OrderRow, PaymentRow, ShipmentRow } from "../types";

type OrderItem = Record<string, any>;

function formatDate(value: any) {
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
}

function displayOrderNo(order: OrderRow | null) {
 if (!order) return "-";
 return order.order_number || order.order_no || order.display_order_no || "-";
}

function statusLabel(value?: string | null) {
 return String(value || "-").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}


// Phase 3B.7V - Shipping Cost Display & Final Order Status Polish
function phase3b7vNumber(value: any) {
 if (value === null || value === undefined || value === "") return 0;
 const n = Number(value);
 return Number.isFinite(n) ? n : 0;
}

function phase3b7vGetNestedNumber(source: any, paths: string[][]) {
 for (const pathParts of paths) {
 let cursor = source;
 for (const part of pathParts) cursor = cursor?.[part];
 const value = phase3b7vNumber(cursor);
 if (value > 0) return value;
 }
 return 0;
}

function phase3b7vActualShippingCost(shipment: ShipmentRow | null) {
 const direct = phase3b7vNumber((shipment as any)?.actual_shipping_cost);
 if (direct > 0) return direct;

 const payloads = [
 (shipment as any)?.tracking_response_json,
 (shipment as any)?.provider_response_json,
 ].filter(Boolean);

 for (const payload of payloads) {
 const value = phase3b7vGetNestedNumber(payload, [
 ["price"],
 ["shipping_price"],
 ["shipment_fee"],
 ["order_price"],
 ["total_price"],
 ["courier", "price"],
 ["courier", "freight_cost"],
 ["courier", "cost"],
 ["courier", "shipping_price"],
 ["pricing", "total_price"],
 ["delivery", "price"],
 ["order", "price"],
 ["order", "shipping_price"],
 ["order", "courier", "price"],
 ["order", "courier", "freight_cost"],
 ]);
 if (value > 0) return value;
 }

 return 0;
}

function phase3b7vBuyerShippingCost(order: OrderRow | null, shipment: ShipmentRow | null) {
 return phase3b7vNumber((shipment as any)?.shipping_cost || (order as any)?.shipping_cost || 0);
}

function phase3b7vStatusText(value?: string | null) {
 const raw = String(value || "-").trim();
 if (!raw || raw === "-") return "-";
 return raw
 .replace(/^BITESHIP[_-]?/i, "Biteship ")
 .replaceAll("_", " ")
 .replaceAll("-", " ")
 .toLowerCase()
 .replace(/\b\w/g, char => char.toUpperCase());
}

function phase3b7vStatusTone(value?: string | null) {
 const s = String(value || "").toLowerCase();
 if (s.includes("deliver") || s.includes("diterima") || s.includes("selesai")) return "done";
 if (s.includes("confirm") || s.includes("book") || s.includes("dikirim") || s.includes("transit") || s.includes("picked")) return "ok";
 if (s.includes("failed") || s.includes("gagal") || s.includes("cancel") || s.includes("tolak")) return "danger";
 if (s.includes("belum") || s.includes("pending")) return "muted";
 return "info";
}

function Phase3B7VShippingCostCompare({ order, shipment }: { order: OrderRow | null; shipment: ShipmentRow | null }) {
 if (!shipment) return null;
 const buyerCost = phase3b7vBuyerShippingCost(order, shipment);
 const actualCost = phase3b7vActualShippingCost(shipment);
 const hasActual = actualCost > 0;
 const isDifferent = hasActual && Math.abs(actualCost - buyerCost) >= 1;
 const diff = actualCost - buyerCost;

 return (
 <div className="phase3b7v-cost-compare" data-phase="3b7v-shipping-cost-display">
 <span>
 <small>Ongkir dibayar buyer</small>
 <strong>{formatCurrency(buyerCost)}</strong>
 </span>
 <span className={hasActual ? (isDifferent ? "is-different" : "is-same") : "is-muted"}>
 <small>Ongkir aktual Biteship</small>
 <strong>{hasActual ? formatCurrency(actualCost) : "Belum tersedia"}</strong>
 </span>
 {isDifferent && (
 <em className={diff < 0 ? "is-saving" : "is-extra"}>
 Selisih {diff < 0 ? "lebih hemat" : "tambahan"}: {formatCurrency(Math.abs(diff))}
 </em>
 )}
 </div>
 );
}

function Phase3B7VShipmentStatusSummary({ shipment }: { shipment: ShipmentRow | null }) {
 if (!shipment) return null;
 const booking = (shipment as any).booking_status || "BELUM_BOOKING";
 const tracking = (shipment as any).tracking_status || "";
 const checkedAt = (shipment as any).tracking_checked_at || "";

 return (
 <div className="phase3b7v-status-row" data-phase="3b7v-final-status-polish">
 <span className={"phase3b7v-status-pill " + phase3b7vStatusTone(booking)}>Booking: {phase3b7vStatusText(booking)}</span>
 {tracking && <span className={"phase3b7v-status-pill " + phase3b7vStatusTone(tracking)}>Tracking: {phase3b7vStatusText(tracking)}</span>}
 {checkedAt && <small>Update tracking: {formatDate(checkedAt)}</small>}
 </div>
 );
}

function isImageProof(url?: string | null) {
 return !!url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

// Phase 3B.8 - Order Lifecycle Finalization
function phase3b8Upper(value?: string | null) {
 return String(value || "").trim().toUpperCase();
}

function phase3b8IsCancelled(order?: OrderRow | null) {
 if (!order) return false;
 return phase3b8Upper(order.order_status) === "DIBATALKAN" ||
 phase3b8Upper(order.payment_status) === "DIBATALKAN" ||
 phase3b8Upper(order.shipping_status) === "DIBATALKAN";
}

function phase3b8IsCompleted(order?: OrderRow | null) {
 if (!order) return false;
 return phase3b8Upper(order.order_status) === "SELESAI" || phase3b8Upper(order.shipping_status) === "DITERIMA";
}

function phase3b8PaymentConfirmed(order?: OrderRow | null) {
 return phase3b8Upper(order?.payment_status) === "DIBAYAR";
}

function phase3b8CanReviewPayment(order?: OrderRow | null, payment?: PaymentRow | null) {
 if (!order || !payment || phase3b8IsCancelled(order) || phase3b8IsCompleted(order)) return false;
 if (phase3b8Upper(payment.payment_status) === "DIBAYAR") return false;
 return true;
}

function phase3b8CanPrepareShipment(order?: OrderRow | null) {
 if (!order || phase3b8IsCancelled(order) || phase3b8IsCompleted(order)) return false;
 return phase3b8PaymentConfirmed(order);
}

function phase3b8CanBookShipment(order?: OrderRow | null, row?: ShipmentRow | null) {
 if (!row || !phase3b8CanPrepareShipment(order)) return false;
 return !row.provider_order_id;
}

function phase3b8CanTrackShipment(row?: ShipmentRow | null) {
 if (!row) return false;
 return Boolean(row.tracking_number || row.provider_tracking_id || row.provider_order_id);
}

function phase3b8LifecycleHint(order?: OrderRow | null) {
 if (!order) return "";
 if (phase3b8IsCancelled(order)) return "Pesanan dibatalkan. Aksi pembayaran dan pengiriman dikunci.";
 if (phase3b8IsCompleted(order)) return "Pesanan selesai/diterima. Aksi operasional dikunci.";
 if (phase3b8Upper(order.payment_status) !== "DIBAYAR") return "Pembayaran belum terkonfirmasi. Booking, input resi, dan pengiriman dikunci sampai pembayaran dibayar.";
 if (phase3b8Upper(order.shipping_status) === "DIKIRIM") return "Pesanan sudah dikirim. Tunggu konfirmasi diterima dari buyer atau tracking selesai.";
 return "Pembayaran sudah terkonfirmasi. Pesanan siap diproses/dikirim.";
}


// Phase 3B.7X - Seller Cancelled Order Guard
function phase3b7xSellerOrderCancelled(order?: OrderRow | null) {
 if (!order) return false;
 const value = String(order.order_status || "").toUpperCase() + " " + String(order.payment_status || "").toUpperCase() + " " + String(order.shipping_status || "").toUpperCase();
 return value.includes("DIBATALKAN");
}

function escapeHtml(value: string) {
 return String(value || "").replace(/[&<>"']/g, char => ({
 "&": "&amp;",
 "<": "&lt;",
 ">": "&gt;",
 "\"": "&quot;",
 "'": "&#39;",
 }[char] || char));
}

async function resolvePaymentProofUrls(rows: PaymentRow[]): Promise<PaymentRow[]> {
 return Promise.all(rows.map(async row => {
 if (!row.proof_storage_path) return row;

 const { data, error } = await supabase.storage
 .from("payment-proofs")
 .createSignedUrl(row.proof_storage_path, 60 * 60);

 if (error || !data?.signedUrl) return row;
 return { ...row, proof_url: data.signedUrl };
 }));
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
 const [paymentActionId, setPaymentActionId] = useState("");
 const [selectedProof, setSelectedProof] = useState<{ url: string; title: string; isImage: boolean } | null>(null);
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

 const resolvedPaymentRows = await resolvePaymentProofUrls((paymentRows || []) as PaymentRow[]);

 setItems(itemRows || []);
 setPayments(resolvedPaymentRows);
 setShipments(shipmentRows || []);
 setMessages((messageRows || []) as OrderMessage[]);
 }

 useEffect(() => { load(); }, []);
 useEffect(() => { if (selectedOrder?.id) loadDetails(selectedOrder.id); }, [selectedOrder]);

 async function updateOrderStatus(field: "order_status" | "payment_status" | "shipping_status", value: string) {
 if (!selectedOrder) return;

 if (phase3b8IsCancelled(selectedOrder) || phase3b8IsCompleted(selectedOrder)) {
 setError("Pesanan yang dibatalkan/selesai tidak dapat diubah dari halaman ini.");
 return;
 }

 if ((field === "order_status" && ["DIPROSES", "SELESAI"].includes(value)) ||
 (field === "shipping_status" && ["DIKEMAS", "DIKIRIM", "DITERIMA"].includes(value))) {
 if (!phase3b8PaymentConfirmed(selectedOrder)) {
 setError("Pembayaran harus dikonfirmasi sebagai DIBAYAR sebelum pesanan diproses/dikirim.");
 return;
 }
 }

 const nowIso = new Date().toISOString();
 const orderPatch: Record<string, any> = {
 [field]: value,
 updated_at: nowIso,
 lifecycle_status_updated_at: nowIso,
 lifecycle_last_event: `${field}:${value}`,
 };

 if (field === "payment_status" && value === "DIBAYAR") {
 orderPatch.paid_at = nowIso;
 orderPatch.payment_verified_at = nowIso;
 orderPatch.order_status = "DIPROSES";
 if (!selectedOrder.shipping_status || selectedOrder.shipping_status === "BELUM_DIKIRIM") orderPatch.shipping_status = "DIKEMAS";
 }
 if (field === "shipping_status" && value === "DIKEMAS") {
 orderPatch.order_status = "DIPROSES";
 orderPatch.processing_started_at = nowIso;
 }
 if (field === "shipping_status" && value === "DIKIRIM") {
 orderPatch.shipped_at = nowIso;
 }
 if (field === "shipping_status" && value === "DITERIMA") {
 orderPatch.order_status = "SELESAI";
 orderPatch.received_at = nowIso;
 orderPatch.completed_at = nowIso;
 }

 const { error } = await supabase.from("orders").update(orderPatch).eq("id", selectedOrder.id);
 if (error) {
 setError(error.message);
 return;
 }

 if (field === "payment_status") {
 await supabase.from("payments").update({
 payment_status: value,
 paid_at: value === "DIBAYAR" ? nowIso : undefined,
 verified_at: value === "DIBAYAR" ? nowIso : undefined,
 updated_at: nowIso,
 }).eq("order_id", selectedOrder.id);
 }
 if (field === "shipping_status") {
 await supabase.from("shipments").update({
 shipping_status: value,
 shipped_at: value === "DIKIRIM" ? nowIso : undefined,
 delivered_at: value === "DITERIMA" ? nowIso : undefined,
 updated_at: nowIso,
 }).eq("order_id", selectedOrder.id);
 }

 await load();
 await loadDetails(selectedOrder.id);
 setSelectedOrder(prev => prev ? { ...prev, ...orderPatch } : prev);
 }


 function printPaymentProof(proof = selectedProof) {
 if (!proof) return;

 const title = escapeHtml(proof.title || "Bukti Pembayaran");
 const url = escapeHtml(proof.url);
 const media = proof.isImage
 ? `<img src="${url}" alt="${title}" onload="setTimeout(function(){ window.focus(); window.print(); }, 350)" />`
 : `<iframe src="${url}" title="${title}" onload="setTimeout(function(){ window.focus(); window.print(); }, 650)"></iframe>`;

 const html = `
 <html>
 <head>
 <title>${title}</title>
 <style>
 * { box-sizing: border-box; }
 body { margin: 0; padding: 24px; font-family: Arial, sans-serif; color: #0f172a; background: #f8fafc; }
 .proof-print-sheet { width: 100%; max-width: 920px; margin: 0 auto; padding: 18px; background: white; border: 1px solid #cbd5e1; border-radius: 18px; }
 h1 { margin: 0 0 12px; font-size: 22px; line-height: 1.2; }
 p { margin: 0 0 14px; font-size: 13px; color: #475569; }
 img { display: block; width: 100%; max-height: 78vh; object-fit: contain; border: 1px solid #dbeafe; border-radius: 14px; background: #fff; }
 iframe { width: 100%; height: 78vh; border: 1px solid #dbeafe; border-radius: 14px; background: #fff; }
 .actions { display: flex; gap: 10px; margin-top: 14px; }
 button, a { appearance: none; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px 14px; font-weight: 800; color: #0f172a; background: white; text-decoration: none; cursor: pointer; }
 button.primary { background: #16a34a; color: white; border-color: #16a34a; }
 @media print { body { padding: 0; background: white; } .proof-print-sheet { border: 0; border-radius: 0; padding: 0; max-width: none; } h1, p, .actions { display: none; } img { max-height: none; border: 0; border-radius: 0; } iframe { height: 96vh; border: 0; border-radius: 0; } }
 </style>
 </head>
 <body>
 <div class="proof-print-sheet">
 <h1>${title}</h1>
 <p>Gunakan tombol Cetak bila dialog print belum otomatis muncul.</p>
 ${media}
 <div class="actions">
 <button class="primary" onclick="window.print()">Cetak Bukti</button>
 <a href="${url}" target="_blank" rel="noreferrer">Buka File Asli</a>
 <button onclick="window.close()">Tutup</button>
 </div>
 </div>
 </body>
 </html>
 `;

 const win = window.open("", "_blank", "width=980,height=860");
 if (!win) {
 alert("Popup browser diblokir. Izinkan popup untuk mencetak bukti pembayaran.");
 return;
 }
 win.document.write(html);
 win.document.close();
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
 <title>Label ${displayOrderNo(selectedOrder)}</title>
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
 <p><strong>No Order:</strong> ${displayOrderNo(selectedOrder)}</p>
 <p><strong>Ekspedisi:</strong> ${row.courier_name || row.expedition_name || "-"} ${row.service_name ? "/ " + row.service_name : ""}</p>
 <p><strong>Resi:</strong> ${row.tracking_number || "BELUM ADA"}</p>
 <div class="barcode">${row.tracking_number || displayOrderNo(selectedOrder) || "NO-RESI"}</div>
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
 if (!phase3b8CanPrepareShipment(selectedOrder)) {
 setError("Pembayaran harus dikonfirmasi sebelum booking pengiriman.");
 return;
 }

 const ok = confirm(`Booking resi Biteship untuk pesanan ${displayOrderNo(selectedOrder)}? Pastikan data alamat toko, alamat buyer, berat, dan ekspedisi sudah benar.`);
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



 async function reviewPayment(row: PaymentRow, action: "APPROVE" | "REJECT") {
 if (!selectedOrder) return;
 if (!phase3b8CanReviewPayment(selectedOrder, row)) {
 setError("Pembayaran tidak dapat diproses karena status pesanan sudah dikunci atau sudah dibayar.");
 return;
 }

 const note = action === "REJECT"
 ? window.prompt("Catatan penolakan bukti pembayaran:", row.rejection_reason || "")
 : window.prompt("Catatan konfirmasi pembayaran (opsional):", row.seller_note || "");

 if (note === null) return;

 const ok = action === "APPROVE"
 ? confirm("Konfirmasi pembayaran ini sebagai DIBAYAR dan lanjutkan pesanan ke proses dikemas?")
 : confirm("Tolak bukti pembayaran ini?");

 if (!ok) return;

 setError("");
 setPaymentActionId(row.id);

 const { data, error } = await supabase.rpc("seller_review_payment", {
 p_order_id: selectedOrder.id,
 p_payment_id: row.id,
 p_action: action,
 p_note: note,
 });

 setPaymentActionId("");

 if (error || (data as any)?.error) {
 setError(error?.message || (data as any)?.error || "Gagal memproses pembayaran.");
 return;
 }

 await load();
 await loadDetails(selectedOrder.id);
 setSelectedOrder(prev => prev ? {
 ...prev,
 payment_status: action === "APPROVE" ? "DIBAYAR" : "DITOLAK",
 order_status: action === "APPROVE" ? "DIPROSES" : "MENUNGGU_PEMBAYARAN",
 shipping_status: action === "APPROVE" ? (prev.shipping_status === "BELUM_DIKIRIM" ? "DIKEMAS" : prev.shipping_status) : prev.shipping_status,
 } : prev);
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
 const matchQuery = !q || [order.order_number, order.order_no, order.customer_name, order.customer_email, order.customer_phone, order.order_status, order.payment_status, order.shipping_status]
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
 <strong>{displayOrderNo(order)}</strong>
 <span>{order.customer_name || "-"} • {formatDate(order.created_at)}</span>
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
 <h2>{displayOrderNo(selectedOrder)}</h2>
 <p>{selectedOrder.customer_name} • {selectedOrder.customer_email} • {selectedOrder.customer_phone}</p>
 </div>
 <strong>{formatCurrency(Number(selectedOrder.grand_total || selectedOrder.total_amount || 0))}</strong>
 </div>

 {phase3b8LifecycleHint(selectedOrder) && (
 <div className={phase3b8IsCancelled(selectedOrder) ? "phase3b8-lifecycle-notice seller danger" : "phase3b8-lifecycle-notice seller"}>
 {phase3b8LifecycleHint(selectedOrder)}
 </div>
 )}

 <div className="order-status-grid">
 <label>
 Status Order
 <select disabled={phase3b8IsCancelled(selectedOrder) || phase3b8IsCompleted(selectedOrder)} value={selectedOrder.order_status || ""} onChange={e => updateOrderStatus("order_status", e.target.value)}>
 <option value="MENUNGGU_PEMBAYARAN">Menunggu Pembayaran</option>
 <option value="DIPROSES">Diproses</option>
 <option value="SELESAI">Selesai</option>
 <option value="DIBATALKAN">Dibatalkan</option>
 </select>
 </label>
 <label>
 Pembayaran
 <select disabled={phase3b8IsCancelled(selectedOrder) || phase3b8IsCompleted(selectedOrder)} value={selectedOrder.payment_status || ""} onChange={e => updateOrderStatus("payment_status", e.target.value)}>
 <option value="BELUM_DIBAYAR">Belum Dibayar</option>
 <option value="MENUNGGU_KONFIRMASI">Menunggu Konfirmasi</option>
 <option value="DIBAYAR">Dibayar</option>
 <option value="DITOLAK">Ditolak</option>
 <option value="DIBATALKAN">Dibatalkan</option>
 </select>
 </label>
 <label>
 Pengiriman
 <select disabled={phase3b8IsCancelled(selectedOrder) || phase3b8IsCompleted(selectedOrder)} value={selectedOrder.shipping_status || ""} onChange={e => updateOrderStatus("shipping_status", e.target.value)}>
 <option value="BELUM_DIKIRIM">Belum Dikirim</option>
 <option value="DIKEMAS">Dikemas</option>
 <option value="DIKIRIM">Dikirim</option>
 <option value="DITERIMA">Diterima</option>
 <option value="DIBATALKAN">Dibatalkan</option>
 </select>
 </label>
 </div>

 {phase3b7xSellerOrderCancelled(selectedOrder) && (
 <div className="phase3b7x-seller-cancelled-note" data-phase="3b7x-seller-cancelled-order">
 Pesanan ini dibatalkan oleh buyer sebelum pembayaran. Aksi verifikasi pembayaran dan booking pengiriman sebaiknya tidak dilakukan.
 </div>
 )}

 <div className="order-info-grid">
 <div>
 <h3>Alamat Buyer</h3>
 <p>{selectedOrder.shipping_address || "-"}</p>
 <p>{[selectedOrder.shipping_district, selectedOrder.shipping_city, selectedOrder.shipping_province, selectedOrder.shipping_postal_code].filter(Boolean).join(", ")}</p>
 </div>
 <div>
 <h3>Pembayaran</h3>
 {payments.map(row => (
 <div className="payment-review-card" key={row.id}>
 <p><strong>{row.payment_method || row.payment_method_code || "BANK_TRANSFER"}</strong> • {statusLabel(row.payment_status)} • {formatCurrency(Number(row.amount || 0))}</p>
 {row.payer_name && <p>Pengirim: <strong>{row.payer_name}</strong> {row.payer_bank ? `• ${row.payer_bank}` : ""}</p>}
 {row.transfer_amount && <p>Nominal transfer: <strong>{formatCurrency(Number(row.transfer_amount || 0))}</strong> • {row.transfer_date || "-"}</p>}
 {row.buyer_note && <p>Catatan buyer: {row.buyer_note}</p>}
 {row.proof_url && (
 <div className="seller-payment-proof compact-proof">
 {isImageProof(row.proof_url) ? (
 <button
 type="button"
 className="proof-thumb-button"
 onClick={() => setSelectedProof({
 url: row.proof_url!,
 title: `Bukti Pembayaran ${displayOrderNo(selectedOrder)}`,
 isImage: true,
 })}
 title="Lihat bukti pembayaran"
 >
 <img src={row.proof_url} alt="Thumbnail bukti pembayaran" />
 <span className="proof-eye" aria-hidden="true">ðŸ‘</span>
 </button>
 ) : (
 <div className="proof-file-thumb">
 <span>PDF</span>
 </div>
 )}
 <div className="proof-action-stack">
 <strong>Bukti Pembayaran</strong>
 <button
 type="button"
 className="btn-icon-eye"
 onClick={() => setSelectedProof({
 url: row.proof_url!,
 title: `Bukti Pembayaran ${displayOrderNo(selectedOrder)}`,
 isImage: isImageProof(row.proof_url),
 })}
 >
 View
 </button>
 <a href={row.proof_url} target="_blank" rel="noreferrer">Buka tab baru</a>
 </div>
 </div>
 )}
 {row.rejection_reason && <p className="shipment-error-note">Ditolak: {row.rejection_reason}</p>}
 <div className="button-row mini-button-row">
 <button className="btn-primary" disabled={paymentActionId === row.id || row.payment_status === "DIBAYAR" || phase3b7xSellerOrderCancelled(selectedOrder)} onClick={() => reviewPayment(row, "APPROVE")}>Konfirmasi Dibayar</button>
 <button disabled={paymentActionId === row.id || row.payment_status === "DIBAYAR" || phase3b7xSellerOrderCancelled(selectedOrder)} onClick={() => reviewPayment(row, "REJECT")}>Tolak Bukti</button>
 </div>
 </div>
 ))}
 {payments.length === 0 && <p>Belum ada metode pembayaran tercatat.</p>}
 </div>
 <div>
 <h3>Pengiriman</h3>
 {shipments.map(row => (
 <div className="shipment-card" key={row.id}>
 <p>{row.courier_name || row.expedition_name || "-"} {row.service_name ? `/ ${row.service_name}` : ""} • {formatCurrency(Number(row.shipping_cost || 0))}</p>
 <p>Resi: <strong>{row.tracking_number || "Belum ada"}</strong></p>
 <p>Status booking: <strong>{phase3b7vStatusText(row.booking_status || "BELUM_BOOKING")}</strong></p>
 {(row as any).tracking_status && <p>Status tracking: <strong>{phase3b7vStatusText((row as any).tracking_status)}</strong></p>}
 {row.provider_order_id && <p>Biteship Order ID: <strong>{row.provider_order_id}</strong></p>}
 {row.tracking_url && <p><a href={row.tracking_url} target="_blank" rel="noreferrer">Buka Tracking</a></p>}
 {row.label_url && <p><a href={row.label_url} target="_blank" rel="noreferrer">Buka Label Biteship</a></p>}
 {row.biteship_error && <p className="shipment-error-note">{formatTrackingError3B10B(row.biteship_error)}</p>}
 <div className="button-row mini-button-row">
 <button disabled={!phase3b8CanPrepareShipment(selectedOrder)} onClick={() => updateTrackingNumber(row)}>Input Resi</button>
 <button onClick={() => printShipmentLabel(row)}>Cetak Label</button>
 <button className="btn-primary" disabled={bookingShipmentId === row.id || !!row.provider_order_id || phase3b7xSellerOrderCancelled(selectedOrder)} onClick={() => bookBiteship(row)}>
 {bookingShipmentId === row.id ? "Booking..." : row.provider_order_id ? "Sudah Booking" : "Booking Biteship"}
 </button>
 <button disabled={trackingShipmentId === row.id || !phase3b8CanTrackShipment(row)} onClick={() => trackBiteship(row)}>
 {trackingShipmentId === row.id ? "Tracking..." : "Cek Tracking"}
 </button>
 </div>
 </div>
 ))}
 {shipments.length === 0 && <p>-</p>}
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
 <small>{msg.sender_role || "USER"} • {formatDate(msg.created_at)}</small>
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

 {selectedProof && (
 <div className="modal-backdrop proof-viewer-overlay" onMouseDown={() => setSelectedProof(null)}>
 <div className="proof-viewer-modal" onMouseDown={event => event.stopPropagation()}>
 <div className="proof-viewer-head">
 <div>
 <h2>{selectedProof.title}</h2>
 <p>Preview bukti pembayaran buyer.</p>
 </div>
 <button type="button" className="modal-close-btn" onClick={() => setSelectedProof(null)}>Ã—</button>
 </div>
 <div className="proof-viewer-body">
 {selectedProof.isImage ? (
 <img src={selectedProof.url} alt={selectedProof.title} />
 ) : (
 <iframe src={selectedProof.url} title={selectedProof.title} />
 )}
 </div>
 <div className="proof-viewer-actions">
 <button type="button" className="btn-primary" onClick={() => printPaymentProof(selectedProof)}>Cetak Bukti</button>
 <a className="btn-secondary-link" href={selectedProof.url} target="_blank" rel="noreferrer">Buka di Tab Baru</a>
 <button type="button" onClick={() => setSelectedProof(null)}>Tutup</button>
 </div>
 </div>
 </div>
 )}
 </section>
 );
}

export default OrdersPage;

