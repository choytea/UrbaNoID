import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type AnyRow = Record<string, any>;

type PeriodKey = "30" | "90" | "365" | "ALL";

function asNumber(value: unknown): number {
 const n = Number(value);
 return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown): string {
 return String(value ?? "").trim();
}

function upper(value: unknown): string {
 return asText(value).toUpperCase();
}

function normalizeKey(value: unknown): string {
 return asText(value).toUpperCase().replace(/\s+/g, "");
}

function formatCurrency(value: unknown): string {
 return new Intl.NumberFormat("id-ID", {
 style: "currency",
 currency: "IDR",
 maximumFractionDigits: 0,
 }).format(asNumber(value));
}

function formatPercent(value: unknown): string {
 return `${asNumber(value).toFixed(1)}%`;
}

function formatDate(value: unknown): string {
 const raw = asText(value);
 if (!raw) return "-";

 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return raw;

 return new Intl.DateTimeFormat("id-ID", {
 day: "2-digit",
 month: "short",
 year: "numeric",
 }).format(date);
}

function formatDateTime(value: unknown): string {
 const raw = asText(value);
 if (!raw) return "-";

 const date = new Date(raw);
 if (Number.isNaN(date.getTime())) return raw;

 return new Intl.DateTimeFormat("id-ID", {
 day: "2-digit",
 month: "short",
 year: "numeric",
 hour: "2-digit",
 minute: "2-digit",
 }).format(date);
}

function firstValue(row: AnyRow | null | undefined, keys: string[]): any {
 if (!row) return null;

 for (const key of keys) {
 const value = row[key];
 if (value !== undefined && value !== null && value !== "") return value;
 }

 return null;
}

function numberFrom(row: AnyRow | null | undefined, keys: string[]): number {
 return asNumber(firstValue(row, keys));
}

function textFrom(row: AnyRow | null | undefined, keys: string[]): string {
 return asText(firstValue(row, keys));
}

function tryJson(value: unknown): AnyRow | null {
 if (!value) return null;
 if (typeof value === "object") return value as AnyRow;

 try {
 return JSON.parse(String(value));
 } catch {
 return null;
 }
}

function deepNumber(value: AnyRow | null | undefined, path: string[]): number {
 let current: any = value;

 for (const key of path) {
 if (!current || typeof current !== "object") return 0;
 current = current[key];
 }

 return asNumber(current);
}

function orderId(row: AnyRow): string {
 return asText(firstValue(row, ["id", "order_id"]));
}

function itemOrderId(row: AnyRow): string {
 return asText(firstValue(row, ["order_id", "orderId", "order"]));
}

function shipmentOrderId(row: AnyRow): string {
 return asText(firstValue(row, ["order_id", "orderId"]));
}

function isPaidOrder(row: AnyRow): boolean {
 const payment = upper(firstValue(row, ["payment_status", "status_payment", "paymentStatus"]));
 const order = upper(firstValue(row, ["order_status", "status"]));

 const paid = ["DIBAYAR", "PAID", "SETTLED", "SUCCESS", "SUCCEEDED", "LUNAS", "CONFIRMED"].some(token => payment.includes(token));
 const cancelled = ["BATAL", "CANCEL", "DIBATALKAN", "CANCELLED"].some(token => payment.includes(token) || order.includes(token));

 return paid && !cancelled;
}

function isPendingPayment(row: AnyRow): boolean {
 const payment = upper(firstValue(row, ["payment_status", "status_payment", "paymentStatus"]));

 return ["MENUNGGU", "PENDING", "BELUM", "UNPAID", "WAITING"].some(token => payment.includes(token));
}

function productSalesOf(order: AnyRow, shipment: AnyRow | null): number {
 const direct = numberFrom(order, [
 "subtotal",
 "product_subtotal",
 "items_total",
 "product_total",
 "order_subtotal",
 ]);

 if (direct > 0) return direct;

 const grand = numberFrom(order, [
 "grand_total",
 "total_amount",
 "total",
 "final_total",
 "amount",
 "amount_paid",
 ]);

 const shipping = numberFrom(order, [
 "shipping_cost",
 "delivery_fee",
 "ongkir",
 ]) || numberFrom(shipment, ["shipping_cost"]);

 if (grand > 0) return Math.max(0, grand - shipping);

 return 0;
}

function grandTotalOf(order: AnyRow): number {
 return numberFrom(order, [
 "grand_total",
 "total_amount",
 "total",
 "final_total",
 "amount",
 "amount_paid",
 ]);
}

function shippingPaidOf(order: AnyRow, shipment: AnyRow | null): number {
 return numberFrom(order, [
 "shipping_cost",
 "delivery_fee",
 "ongkir",
 ]) || numberFrom(shipment, ["shipping_cost"]);
}

function biteshipShipmentFeeOf(shipment: AnyRow | null): number {
 if (!shipment) return 0;

 const direct = numberFrom(shipment, ["biteship_shipment_fee"]);
 if (direct > 0) return direct;

 const json = tryJson(firstValue(shipment, [
 "biteship_order_detail_json",
 "provider_response_json",
 "tracking_response_json",
 ]));

 return deepNumber(json, ["courier", "shipment_fee"]);
}

function biteshipInsuranceFeeOf(shipment: AnyRow | null): number {
 if (!shipment) return 0;

 const direct = numberFrom(shipment, ["biteship_insurance_fee"]);
 if (direct > 0) return direct;

 const json = tryJson(firstValue(shipment, [
 "biteship_order_detail_json",
 "provider_response_json",
 "tracking_response_json",
 ]));

 return deepNumber(json, ["courier", "insurance", "fee"]);
}

function actualShippingOf(shipment: AnyRow | null): number {
 if (!shipment) return 0;

 const syncedShipmentFee = biteshipShipmentFeeOf(shipment);
 const syncedInsuranceFee = biteshipInsuranceFeeOf(shipment);

 if (syncedShipmentFee > 0 || syncedInsuranceFee > 0) {
 return syncedShipmentFee + syncedInsuranceFee;
 }

 const direct = numberFrom(shipment, [
 "actual_shipping_cost",
 "provider_shipping_fee",
 "shipping_actual_cost",
 "shipping_cost",
 ]);

 if (direct > 0) return direct;

 const json = tryJson(firstValue(shipment, [
 "biteship_order_detail_json",
 "provider_response_json",
 "tracking_response_json",
 ]));

 const jsonShipmentFee = deepNumber(json, ["courier", "shipment_fee"]);
 const jsonInsuranceFee = deepNumber(json, ["courier", "insurance", "fee"]);

 if (jsonShipmentFee > 0 || jsonInsuranceFee > 0) {
 return jsonShipmentFee + jsonInsuranceFee;
 }

 return (
 deepNumber(json, ["courier", "price"]) ||
 deepNumber(json, ["price"])
 );
}

function productNameOf(item: AnyRow): string {
 return textFrom(item, [
 "product_name",
 "name",
 "item_name",
 "title",
 "description",
 ]) || "Produk tanpa nama";
}

function variantNameOf(item: AnyRow): string {
 return textFrom(item, [
 "variant_name",
 "sku_variant",
 "sku",
 "variant",
 "size",
 ]);
}

function quantityOf(item: AnyRow): number {
 return Math.max(1, numberFrom(item, ["quantity", "qty", "jumlah"]));
}

function itemRevenueOf(item: AnyRow): number {
 const direct = numberFrom(item, [
 "subtotal",
 "total_price",
 "line_total",
 "total",
 "amount",
 ]);

 if (direct > 0) return direct;

 const qty = quantityOf(item);
 const price = numberFrom(item, [
 "unit_price",
 "price",
 "final_price",
 "base_price",
 "value",
 ]);

 return qty * price;
}

function itemVariantId(row: AnyRow): string {
 return asText(firstValue(row, [
 "variant_id",
 "product_variant_id",
 "catalog_variant_id",
 "variantId",
 ]));
}

function itemSku(row: AnyRow): string {
 return asText(firstValue(row, [
 "sku_variant",
 "variant_sku",
 "sku",
 "sku_item",
 ]));
}

function variantHppOf(item: AnyRow, variantMap: Map<string, AnyRow>, skuMap: Map<string, AnyRow>): number {
 const direct = numberFrom(item, [
 "hpp_cost",
 "cost_price",
 "cogs",
 "unit_cost",
 "production_cost",
 ]);

 if (direct > 0) return direct;

 const variantId = itemVariantId(item);
 if (variantId && variantMap.has(variantId)) {
 return numberFrom(variantMap.get(variantId), ["hpp_cost"]);
 }

 const sku = normalizeKey(itemSku(item));
 if (sku && skuMap.has(sku)) {
 return numberFrom(skuMap.get(sku), ["hpp_cost"]);
 }

 return 0;
}

function biteshipStatusClass(status: unknown): string {
 const text = upper(status);

 if (!text) return "unknown";
 if (text.includes("CANCEL") || text.includes("BATAL")) return "danger";
 if (text.includes("FAILED") || text.includes("ERROR")) return "danger";
 if (text.includes("DELIVERED") || text.includes("DONE") || text.includes("COMPLETED")) return "success";
 if (text.includes("CONFIRMED") || text.includes("ALLOCATED") || text.includes("PICKED") || text.includes("SHIP")) return "active";

 return "neutral";
}

export default function FinancePage() {
 const [orders, setOrders] = useState<AnyRow[]>([]);
 const [shipments, setShipments] = useState<AnyRow[]>([]);
 const [orderItems, setOrderItems] = useState<AnyRow[]>([]);
 const [variants, setVariants] = useState<AnyRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [period, setPeriod] = useState<PeriodKey>("30");
 const [syncingBiteshipId, setSyncingBiteshipId] = useState("");
 const [message, setMessage] = useState("");
 const [error, setError] = useState("");

 async function loadFinanceData() {
 setLoading(true);
 setError("");
 setMessage("");

 const { data: orderRows, error: orderError } = await supabase
 .from("orders")
 .select("*")
 .order("created_at", { ascending: false })
 .limit(1200);

 if (orderError) {
 setError(orderError.message);
 setLoading(false);
 return;
 }

 const { data: shipmentRows, error: shipmentError } = await supabase
 .from("shipments")
 .select("*")
 .limit(1200);

 const { data: itemRows, error: itemError } = await supabase
 .from("order_items")
 .select("*")
 .limit(2500);

 const { data: variantRows, error: variantError } = await supabase
 .from("product_variants")
 .select("id, product_id, sku_variant, variant_name, base_price, hpp_cost")
 .limit(3000);

 const warnings: string[] = [];
 if (shipmentError) warnings.push(`Data shipment belum bisa dimuat: ${shipmentError.message}`);
 if (itemError) warnings.push(`Data item order belum bisa dimuat: ${itemError.message}`);
 if (variantError) warnings.push(`Data HPP varian belum bisa dimuat: ${variantError.message}`);

 setOrders((orderRows || []) as AnyRow[]);
 setShipments(shipmentError ? [] : ((shipmentRows || []) as AnyRow[]));
 setOrderItems(itemError ? [] : ((itemRows || []) as AnyRow[]));
 setVariants(variantError ? [] : ((variantRows || []) as AnyRow[]));

 if (warnings.length) setMessage(warnings.join(" | "));

 setLoading(false);
 }

 useEffect(() => {
 loadFinanceData();
 }, []);

 async function syncBiteshipOrderDetail(row: {
 shipment_id?: string;
 provider_order_id?: string;
 order_id?: string;
 }) {
 const shipmentId = String(row.shipment_id || "").trim();
 const providerOrderId = String(row.provider_order_id || "").trim();

 if (!shipmentId && !providerOrderId) {
 setError("Shipment ini belum memiliki provider_order_id Biteship.");
 return;
 }

 setSyncingBiteshipId(shipmentId || providerOrderId);
 setError("");
 setMessage("");

 const { data, error: invokeError } = await supabase.functions.invoke("shipping-order-detail", {
 body: {
 shipment_id: shipmentId || undefined,
 provider_order_id: providerOrderId || undefined,
 },
 });

 if (invokeError) {
 setError(invokeError.message);
 setSyncingBiteshipId("");
 return;
 }

 if (!data?.success) {
 setError(data?.message || "Sync detail Biteship gagal.");
 setSyncingBiteshipId("");
 await loadFinanceData();
 return;
 }

 setMessage(data?.message || "Detail Biteship berhasil disinkronkan.");
 setSyncingBiteshipId("");
 await loadFinanceData();
 }

 const shipmentMap = useMemo(() => {
 const map = new Map<string, AnyRow>();

 shipments.forEach(row => {
 const key = shipmentOrderId(row);
 if (key && !map.has(key)) map.set(key, row);
 });

 return map;
 }, [shipments]);

 const variantMap = useMemo(() => {
 return new Map(variants.map(row => [asText(row.id), row]).filter(([key]) => Boolean(key)));
 }, [variants]);

 const skuMap = useMemo(() => {
 const map = new Map<string, AnyRow>();

 variants.forEach(row => {
 const sku = normalizeKey(row.sku_variant);
 if (sku && !map.has(sku)) map.set(sku, row);
 });

 return map;
 }, [variants]);

 const filteredOrders = useMemo(() => {
 if (period === "ALL") return orders;

 const days = Number(period);
 const min = Date.now() - days * 24 * 60 * 60 * 1000;

 return orders.filter(row => {
 const raw = firstValue(row, ["created_at", "order_date", "paid_at", "updated_at"]);
 const date = new Date(asText(raw));

 if (Number.isNaN(date.getTime())) return true;

 return date.getTime() >= min;
 });
 }, [orders, period]);

 const paidOrders = useMemo(() => filteredOrders.filter(isPaidOrder), [filteredOrders]);

 const paidIds = useMemo(() => new Set(paidOrders.map(orderId).filter(Boolean)), [paidOrders]);

 const hppTotal = useMemo(() => {
 return orderItems.reduce((sum, item) => {
 const oid = itemOrderId(item);
 if (paidIds.size && oid && !paidIds.has(oid)) return sum;

 return sum + quantityOf(item) * variantHppOf(item, variantMap, skuMap);
 }, 0);
 }, [orderItems, paidIds, variantMap, skuMap]);

 const metrics = useMemo(() => {
 let gross = 0;
 let productSales = 0;
 let shippingPaid = 0;
 let actualShipping = 0;
 let pending = 0;
 let cancelled = 0;

 filteredOrders.forEach(order => {
 const shipment = shipmentMap.get(orderId(order)) || null;
 const status = upper(firstValue(order, ["order_status", "status"]));
 const payment = upper(firstValue(order, ["payment_status", "status_payment"]));

 if (["BATAL", "CANCEL", "DIBATALKAN", "CANCELLED"].some(token => status.includes(token) || payment.includes(token))) {
 cancelled += 1;
 }

 if (isPendingPayment(order)) pending += 1;

 if (isPaidOrder(order)) {
 gross += grandTotalOf(order);
 productSales += productSalesOf(order, shipment);
 shippingPaid += shippingPaidOf(order, shipment);
 actualShipping += actualShippingOf(shipment);
 }
 });

 const grossProfit = productSales - hppTotal;
 const grossMargin = productSales > 0 ? (grossProfit / productSales) * 100 : 0;

 return {
 totalOrders: filteredOrders.length,
 paidOrders: paidOrders.length,
 pending,
 cancelled,
 gross,
 productSales,
 hppTotal,
 grossProfit,
 grossMargin,
 shippingPaid,
 actualShipping,
 shippingDiff: shippingPaid - actualShipping,
 netEstimate: grossProfit + shippingPaid - actualShipping,
 averageOrder: paidOrders.length ? gross / paidOrders.length : 0,
 };
 }, [filteredOrders, paidOrders.length, shipmentMap, hppTotal]);

 const bestSellers = useMemo(() => {
 const map = new Map<string, { name: string; variant: string; qty: number; revenue: number; hpp: number; profit: number; margin: number }>();

 orderItems.forEach(item => {
 const oid = itemOrderId(item);
 if (paidIds.size && oid && !paidIds.has(oid)) return;

 const name = productNameOf(item);
 const variant = variantNameOf(item);
 const key = `${name}::${variant}`;

 const current = map.get(key) || { name, variant, qty: 0, revenue: 0, hpp: 0, profit: 0, margin: 0 };
 const qty = quantityOf(item);
 const revenue = itemRevenueOf(item);
 const hpp = qty * variantHppOf(item, variantMap, skuMap);

 current.qty += qty;
 current.revenue += revenue;
 current.hpp += hpp;
 current.profit = current.revenue - current.hpp;
 current.margin = current.revenue > 0 ? (current.profit / current.revenue) * 100 : 0;
 map.set(key, current);
 });

 return Array.from(map.values())
 .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue || b.qty - a.qty)
 .slice(0, 10);
 }, [orderItems, paidIds, variantMap, skuMap]);

 const recentPaidOrders = useMemo(() => {
 return paidOrders.slice(0, 12).map(order => {
 const shipment = shipmentMap.get(orderId(order)) || null;

 return {
 id: orderId(order),
 code: textFrom(order, ["order_number", "invoice_number", "short_id", "id"]),
 date: firstValue(order, ["created_at", "paid_at", "updated_at"]),
 customer: textFrom(order, ["customer_name", "buyer_name", "recipient_name", "shipping_recipient_name"]),
 productSales: productSalesOf(order, shipment),
 grand: grandTotalOf(order),
 shippingPaid: shippingPaidOf(order, shipment),
 actualShipping: actualShippingOf(shipment),
 status: textFrom(order, ["order_status", "status"]),
 payment: textFrom(order, ["payment_status"]),
 };
 });
 }, [paidOrders, shipmentMap]);

 const biteshipRows = useMemo(() => {
 return shipments
 .map(shipment => ({
 shipment_id: textFrom(shipment, ["id"]),
 order_id: shipmentOrderId(shipment),
 provider_order_id: textFrom(shipment, ["provider_order_id", "biteship_order_id"]),
 tracking_number: textFrom(shipment, ["biteship_waybill_id", "tracking_number", "provider_tracking_id", "waybill_id"]),
 tracking_link: textFrom(shipment, ["biteship_tracking_link", "tracking_url"]),
 courier: textFrom(shipment, ["biteship_courier_company", "courier_name", "courier_code", "expedition_name", "provider_name"]),
 status: textFrom(shipment, ["biteship_status", "booking_status", "tracking_status", "shipping_status"]),
 shipping_cost: numberFrom(shipment, ["shipping_cost"]),
 shipment_fee: biteshipShipmentFeeOf(shipment),
 insurance_fee: biteshipInsuranceFeeOf(shipment),
 actual_shipping_cost: actualShippingOf(shipment),
 synced_at: firstValue(shipment, ["biteship_order_detail_synced_at", "tracking_checked_at", "updated_at"]),
 last_error: textFrom(shipment, ["biteship_last_error"]),
 }))
 .filter(row => row.provider_order_id || row.tracking_number || row.actual_shipping_cost > 0 || row.last_error || row.synced_at)
 .slice(0, 12);
 }, [shipments]);

 function exportCsv() {
 const header = [
 "Tanggal",
 "Order",
 "Buyer",
 "Penjualan Produk",
 "Ongkir Dibayar Buyer",
 "Ongkir Aktual",
 "Total Dibayar",
 "Status Order",
 "Status Pembayaran",
 ];

 const body = recentPaidOrders.map(row => [
 formatDate(row.date),
 row.code,
 row.customer,
 row.productSales,
 row.shippingPaid,
 row.actualShipping,
 row.grand,
 row.status,
 row.payment,
 ]);

 const csv = [header, ...body]
 .map(cols => cols.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
 .join("\n");

 const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
 const url = URL.createObjectURL(blob);
 const a = document.createElement("a");

 a.href = url;
 a.download = `urbanoid-keuangan-${new Date().toISOString().slice(0, 10)}.csv`;
 a.click();

 URL.revokeObjectURL(url);
 }

 return (
 <section className="finance-page phase3b9b1-finance-page phase3b9b3d-finance-page">
 <div className="page-header finance-page-header">
 <div>
 <p className="eyebrow">Seller</p>
 <h1>Keuangan</h1>
 <p>Ringkasan penjualan, produk terlaris, ongkir, dan estimasi penerimaan untuk strategi toko.</p>
 </div>

 <div className="finance-actions">
 <select value={period} onChange={event => setPeriod(event.target.value as PeriodKey)}>
 <option value="30">30 hari terakhir</option>
 <option value="90">90 hari terakhir</option>
 <option value="365">1 tahun terakhir</option>
 <option value="ALL">Semua data</option>
 </select>

 <button type="button" onClick={loadFinanceData} disabled={loading}>
 {loading ? "Memuat..." : "Refresh"}
 </button>

 <button type="button" onClick={exportCsv} disabled={recentPaidOrders.length === 0}>
 Export CSV
 </button>
 </div>
 </div>

 {error && <div className="alert error">{error}</div>}
 {message && <div className="alert success">{message}</div>}

 <div className="finance-kpi-grid">
 <div><small>Omzet Dibayar</small><strong>{formatCurrency(metrics.gross)}</strong></div>
 <div><small>Penjualan Produk</small><strong>{formatCurrency(metrics.productSales)}</strong></div>
 <div><small>Total HPP</small><strong>{formatCurrency(metrics.hppTotal)}</strong></div>
 <div><small>Laba Kotor</small><strong>{formatCurrency(metrics.grossProfit)}</strong></div>
 <div><small>Margin Kotor</small><strong>{formatPercent(metrics.grossMargin)}</strong></div>
 <div><small>Ongkir Dibayar Buyer</small><strong>{formatCurrency(metrics.shippingPaid)}</strong></div>
 <div><small>Ongkir Aktual</small><strong>{formatCurrency(metrics.actualShipping)}</strong></div>
 <div><small>Selisih Ongkir</small><strong>{formatCurrency(metrics.shippingDiff)}</strong></div>
 <div><small>Estimasi Diterima</small><strong>{formatCurrency(metrics.netEstimate)}</strong></div>
 <div><small>Order Dibayar</small><strong>{metrics.paidOrders}</strong></div>
 <div><small>Rata-rata Order</small><strong>{formatCurrency(metrics.averageOrder)}</strong></div>
 </div>

 <div className="finance-panel-grid">
 <section className="finance-card">
 <div className="finance-card-head">
 <h2>Produk Paling Menguntungkan</h2>
 <small>Diurutkan dari laba kotor tertinggi</small>
 </div>

 <div className="finance-table-wrap">
 <table className="finance-table">
 <thead>
 <tr>
 <th>Produk</th>
 <th>Varian/SKU</th>
 <th>Qty</th>
 <th>Omzet</th>
 <th>HPP</th>
 <th>Laba</th>
 <th>Margin</th>
 </tr>
 </thead>
 <tbody>
 {bestSellers.length === 0 && (
 <tr><td colSpan={7}>Data item order belum tersedia atau belum terbaca.</td></tr>
 )}

 {bestSellers.map((row, index) => (
 <tr key={`${row.name}-${row.variant}-${index}`}>
 <td><strong>{row.name}</strong></td>
 <td>{row.variant || "-"}</td>
 <td>{row.qty}</td>
 <td>{formatCurrency(row.revenue)}</td>
 <td>{formatCurrency(row.hpp)}</td>
 <td><strong>{formatCurrency(row.profit)}</strong></td>
 <td><span className={row.margin < 25 ? "finance-margin low" : "finance-margin"}>{formatPercent(row.margin)}</span></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </section>

 <section className="finance-card">
 <div className="finance-card-head">
 <h2>Kontrol Order</h2>
 <small>Status finansial periode terpilih</small>
 </div>

 <div className="finance-status-grid">
 <div><small>Total Order</small><strong>{metrics.totalOrders}</strong></div>
 <div><small>Sudah Dibayar</small><strong>{metrics.paidOrders}</strong></div>
 <div><small>Menunggu Bayar</small><strong>{metrics.pending}</strong></div>
 <div><small>Dibatalkan</small><strong>{metrics.cancelled}</strong></div>
 </div>

 <div className="finance-note">
 <strong>Catatan POS:</strong> isi HPP per varian di menu Stok Produk agar laba kotor dan margin produk akurat.
 </div>
 </section>
 </div>

 <section className="finance-card">
 <div className="finance-card-head">
 <h2>Laporan Penjualan Terbaru</h2>
 <small>Order berstatus dibayar</small>
 </div>

 <div className="finance-table-wrap">
 <table className="finance-table">
 <thead>
 <tr>
 <th>Tanggal</th>
 <th>Order</th>
 <th>Buyer</th>
 <th>Produk</th>
 <th>Ongkir Buyer</th>
 <th>Ongkir Aktual</th>
 <th>Total</th>
 </tr>
 </thead>
 <tbody>
 {recentPaidOrders.length === 0 && (
 <tr><td colSpan={7}>Belum ada order dibayar pada periode ini.</td></tr>
 )}

 {recentPaidOrders.map(row => (
 <tr key={row.id}>
 <td>{formatDate(row.date)}</td>
 <td>{row.code || row.id}</td>
 <td>{row.customer || "-"}</td>
 <td>{formatCurrency(row.productSales)}</td>
 <td>{formatCurrency(row.shippingPaid)}</td>
 <td>{formatCurrency(row.actualShipping)}</td>
 <td><strong>{formatCurrency(row.grand)}</strong></td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </section>

 <section className="finance-card">
 <div className="finance-card-head">
 <h2>Ongkir & Biteship</h2>
 <small>Sync aktif via Edge Function shipping-order-detail</small>
 </div>

 <div className="finance-table-wrap">
 <table className="finance-table finance-biteship-table">
 <thead>
 <tr>
 <th>Order</th>
 <th>Biteship Order ID</th>
 <th>Tracking</th>
 <th>Kurir</th>
 <th>Status</th>
 <th>Ongkir Buyer</th>
 <th>Shipment Fee</th>
 <th>Asuransi</th>
 <th>Ongkir Aktual</th>
 <th>Last Sync</th>
 <th>Error</th>
 <th>Sync</th>
 </tr>
 </thead>
 <tbody>
 {biteshipRows.length === 0 && (
 <tr><td colSpan={12}>Belum ada data Biteship/Shipment yang dapat ditampilkan.</td></tr>
 )}

 {biteshipRows.map((row, index) => (
 <tr key={`${row.order_id}-${index}`}>
 <td>{row.order_id || "-"}</td>
 <td>{row.provider_order_id || "-"}</td>
 <td>
 {row.tracking_link ? (
 <a href={row.tracking_link} target="_blank" rel="noreferrer">
 {row.tracking_number || "Tracking"}
 </a>
 ) : (
 row.tracking_number || "-"
 )}
 </td>
 <td>{row.courier || "-"}</td>
 <td>
 <span className={`finance-biteship-status ${biteshipStatusClass(row.status)}`}>
 {row.status || "-"}
 </span>
 </td>
 <td>{formatCurrency(row.shipping_cost)}</td>
 <td>{formatCurrency(row.shipment_fee)}</td>
 <td>{formatCurrency(row.insurance_fee)}</td>
 <td><strong>{formatCurrency(row.actual_shipping_cost)}</strong></td>
 <td>{formatDateTime(row.synced_at)}</td>
 <td>
 {row.last_error ? (
 <span className="finance-biteship-error" title={row.last_error}>
 {row.last_error.length > 42 ? `${row.last_error.slice(0, 42)}...` : row.last_error}
 </span>
 ) : (
 "-"
 )}
 </td>
 <td>
 <button
 type="button"
 className="finance-sync-btn"
 onClick={() => syncBiteshipOrderDetail(row)}
 disabled={!row.provider_order_id || syncingBiteshipId === (row.shipment_id || row.provider_order_id)}
 >
 {syncingBiteshipId === (row.shipment_id || row.provider_order_id) ? "Sync..." : "Sync Detail"}
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <div className="finance-biteship-plan finance-biteship-active-note">
 <strong>Sync Biteship aktif:</strong> tombol Sync Detail memanggil Supabase Edge Function shipping-order-detail, lalu menyimpan status, waybill, shipment fee, insurance fee, dan raw response GET /v1/orders/:id ke tabel shipments.
 </div>
 </section>
 </section>
 );
}
