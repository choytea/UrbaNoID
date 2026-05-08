import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";
import { OrderItemRow, OrderMessage, OrderRow, PaymentRow, Profile, ShipmentRow, StoreProfile } from "../types";

type Props = {
 session: Session | null;
 profile: Profile | null;
 onProfileUpdated?: () => void;
};

type BuyerProfileTab = "profile" | "orders" | "chat" | "store";
type BuyerOrderTab = "ALL" | "BELUM_BAYAR" | "KONFIRMASI" | "DIKEMAS" | "DIKIRIM" | "SELESAI" | "DIBATALKAN";
type ProductReviewRow = {
 id?: string;
 order_id?: string | null;
 order_item_id?: string | null;
 buyer_id?: string | null;
 product_id?: string | null;
 variant_id?: string | null;
 rating?: number | null;
 comment?: string | null;
 review_text?: string | null;
 status?: string | null;
 is_published?: boolean | null;
 created_at?: string | null;
};

type ProductReviewDraft = {
 rating: number;
 comment: string;
};

const BUYER_PROFILE_TAB_EVENT = "urbanoid-buyer-profile-tab";

function normalizeBuyerProfileTab(value: any): BuyerProfileTab {
 return ["profile", "orders", "chat", "store"].includes(String(value)) ? value as BuyerProfileTab : "profile";
}

function displayOrderNo(order: OrderRow | null) {
 if (!order) return "-";
 return order.order_number || order.order_no || order.display_order_no || "-";
}

function formatDate(value: any) {
 if (!value) return "-";
 const date = new Date(value);
 return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
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

function Phase3B7VBuyerShippingSummary({ order, shipment }: { order: OrderRow | null; shipment: ShipmentRow | null }) {
 if (!shipment) return null;
 const buyerCost = phase3b7vBuyerShippingCost(order, shipment);
 const actualCost = phase3b7vActualShippingCost(shipment);
 const hasActual = actualCost > 0;
 const diff = actualCost - buyerCost;

 return (
 <div className="phase3b7v-buyer-shipping-summary" data-phase="3b7v-buyer-shipping-status-polish">
 <div>
 <span>Status Biteship</span>
 <strong>{phase3b7vStatusText((shipment as any).booking_status || (shipment as any).tracking_status || shipment.shipping_status)}</strong>
 </div>
 {(shipment as any).tracking_checked_at && (
 <div>
 <span>Update Tracking</span>
 <strong>{formatDate((shipment as any).tracking_checked_at)}</strong>
 </div>
 )}
 <div>
 <span>Ongkir Dibayar</span>
 <strong>{formatCurrency(buyerCost)}</strong>
 </div>
 {hasActual && (
 <div>
 <span>Ongkir Aktual Biteship</span>
 <strong>{formatCurrency(actualCost)}</strong>
 </div>
 )}
 {hasActual && Math.abs(diff) >= 1 && (
 <small className={diff < 0 ? "is-saving" : "is-extra"}>Selisih {diff < 0 ? "lebih hemat" : "tambahan"}: {formatCurrency(Math.abs(diff))}</small>
 )}
 </div>
 );
}

function paymentStep(order: OrderRow | null) {
 if (!order) return 0;
 if (order.order_status === "SELESAI" || order.shipping_status === "DITERIMA") return 5;
 if (order.shipping_status === "DIKIRIM") return 4;
 if (order.shipping_status === "DIKEMAS" || order.order_status === "DIPROSES") return 3;
 if (order.payment_status === "DIBAYAR") return 2;
 if (order.payment_status === "MENUNGGU_KONFIRMASI") return 1;
 return 0;
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

function phase3b8CanConfirmReceived(order?: OrderRow | null, shipment?: ShipmentRow | null) {
 if (!order || phase3b8IsCancelled(order) || phase3b8IsCompleted(order)) return false;
 if (phase3b8Upper(order.payment_status) !== "DIBAYAR") return false;
 const sent = phase3b8Upper(order.shipping_status) === "DIKIRIM" ||
 phase3b8Upper(shipment?.shipping_status) === "DIKIRIM" ||
 Boolean(shipment?.tracking_number || shipment?.provider_tracking_id);
 return sent;
}

function phase3b8LifecycleNotice(order?: OrderRow | null) {
 if (!order) return "";
 if (phase3b8IsCancelled(order)) return "Pesanan ini dibatalkan dan tidak dapat diproses lagi.";
 if (phase3b8IsCompleted(order)) return "Pesanan sudah diterima dan selesai.";
 if (phase3b8Upper(order.payment_status) === "BELUM_DIBAYAR") return "Menunggu pembayaran buyer.";
 if (phase3b8Upper(order.payment_status) === "MENUNGGU_KONFIRMASI") return "Pembayaran sedang menunggu verifikasi seller/admin.";
 if (phase3b8Upper(order.payment_status) === "DIBAYAR" && phase3b8Upper(order.shipping_status) !== "DIKIRIM") return "Pembayaran sudah terkonfirmasi. Pesanan dapat diproses dan dikirim oleh seller.";
 if (phase3b8Upper(order.shipping_status) === "DIKIRIM") return "Pesanan sedang dikirim. Konfirmasi diterima tersedia setelah paket sampai.";
 return "";
}


// Phase 3B.7X - Buyer Cancel Unpaid Order
function phase3b7xUpper(value?: string | null) {
 return String(value || "").trim().toUpperCase();
}

function phase3b7xIsCancelled(order?: OrderRow | null) {
 if (!order) return false;
 return phase3b7xUpper(order.order_status) === "DIBATALKAN" ||
 phase3b7xUpper(order.payment_status) === "DIBATALKAN" ||
 phase3b7xUpper(order.shipping_status) === "DIBATALKAN";
}

function phase3b7xCanCancelOrder(order?: OrderRow | null, payment?: PaymentRow | null) {
 if (!order || phase3b7xIsCancelled(order)) return false;
 const orderStatus = phase3b7xUpper(order.order_status);
 const paymentStatus = phase3b7xUpper(order.payment_status);
 const shippingStatus = phase3b7xUpper(order.shipping_status);
 const paymentRowStatus = phase3b7xUpper(payment?.payment_status);
 const hasProof = Boolean(payment?.proof_url || payment?.proof_storage_path || payment?.proof_uploaded_at);

 if (["SELESAI"].includes(orderStatus)) return false;
 if (["DITERIMA"].includes(shippingStatus)) return false;
 if (["DIBAYAR", "MENUNGGU_KONFIRMASI"].includes(paymentStatus)) return false;
 if (["DIBAYAR", "MENUNGGU_KONFIRMASI"].includes(paymentRowStatus)) return false;
 if (hasProof) return false;

 return ["", "BELUM_DIBAYAR", "DITOLAK", "MENUNGGU_PEMBAYARAN", "PENDING", "UNPAID"].includes(paymentStatus || "");
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

export function BuyerProfilePage({ session, profile, onProfileUpdated }: Props) {
 const [activeTab, setActiveTab] = useState<BuyerProfileTab>(() => normalizeBuyerProfileTab(localStorage.getItem("urbanoid_buyer_profile_tab")));
 const [orderTab, setOrderTab] = useState<BuyerOrderTab>("ALL");
 const [form, setForm] = useState({
 username: profile?.username || "",
 full_name: profile?.full_name || "",
 email: profile?.email || session?.user.email || "",
 phone: profile?.phone || "",
 address_line: profile?.address_line || "",
 district: profile?.district || "",
 city: profile?.city || "",
 province: profile?.province || "",
 postal_code: profile?.postal_code || "",
 avatar_url: profile?.avatar_url || "",
 });
 const [orders, setOrders] = useState<OrderRow[]>([]);
 const [productReviews, setProductReviews] = useState<Record<string, ProductReviewRow>>({});
 const [reviewDrafts, setReviewDrafts] = useState<Record<string, ProductReviewDraft>>({});
 const [reviewSubmittingId, setReviewSubmittingId] = useState("");
 const [items, setItems] = useState<OrderItemRow[]>([]);
 const [payments, setPayments] = useState<PaymentRow[]>([]);
 const [shipments, setShipments] = useState<ShipmentRow[]>([]);
 const [store, setStore] = useState<StoreProfile | null>(null);
 const [followed, setFollowed] = useState(false);
 const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
 const [messages, setMessages] = useState<OrderMessage[]>([]);
 const [newMessage, setNewMessage] = useState("");
 const [message, setMessage] = useState("");
 const [paymentFile, setPaymentFile] = useState<File | null>(null);
 const [selectedPaymentId, setSelectedPaymentId] = useState("");
 const [selectedProof, setSelectedProof] = useState<{ url: string; title: string; isImage: boolean } | null>(null);
 const [profileEditMode, setProfileEditMode] = useState(false);
 const [submittingPayment, setSubmittingPayment] = useState(false);
 const [cancelingOrderId, setCancelingOrderId] = useState("");
 const [paymentForm, setPaymentForm] = useState({
 payer_name: profile?.full_name || "",
 payer_bank: "",
 transfer_amount: "",
 transfer_date: new Date().toISOString().slice(0, 10),
 buyer_note: "",
 });

 useEffect(() => {
 if (!session) return;
 loadOrders();
 loadStore();
 }, [session]);

 useEffect(() => {
 setForm({
 username: profile?.username || "",
 full_name: profile?.full_name || "",
 email: profile?.email || session?.user.email || "",
 phone: profile?.phone || "",
 address_line: profile?.address_line || "",
 district: profile?.district || "",
 city: profile?.city || "",
 province: profile?.province || "",
 postal_code: profile?.postal_code || "",
 avatar_url: profile?.avatar_url || "",
 });
 setPaymentForm(prev => ({ ...prev, payer_name: profile?.full_name || prev.payer_name || "" }));
 }, [profile, session]);

 useEffect(() => {
 function applyStoredTab() {
 setActiveTab(normalizeBuyerProfileTab(localStorage.getItem("urbanoid_buyer_profile_tab")));
 }

 function onProfileTab(event: Event) {
 const tab = normalizeBuyerProfileTab((event as CustomEvent).detail);
 setTab(tab);
 }

 window.addEventListener(BUYER_PROFILE_TAB_EVENT, onProfileTab as EventListener);
 window.addEventListener("focus", applyStoredTab);

 return () => {
 window.removeEventListener(BUYER_PROFILE_TAB_EVENT, onProfileTab as EventListener);
 window.removeEventListener("focus", applyStoredTab);
 };
 }, []);

 useEffect(() => {
 localStorage.setItem("urbanoid_buyer_profile_tab", activeTab);
 }, [activeTab]);

 useEffect(() => {
 if (selectedOrder?.id) loadOrderDetails(selectedOrder.id);
 }, [selectedOrder?.id]);

 useEffect(() => {
 const firstPayment = payments[0];
 if (firstPayment && !selectedPaymentId) {
 setSelectedPaymentId(firstPayment.id);
 setPaymentForm(prev => ({
 ...prev,
 transfer_amount: String(firstPayment.amount || selectedOrder?.grand_total || selectedOrder?.total_amount || ""),
 }));
 }
 }, [payments, selectedPaymentId, selectedOrder]);

 
 async function loadProductReviewsForOrderItems() {
 const itemIds = (items || []).map(row => String(row.id || "")).filter(Boolean);

 if (!session?.user?.id || !selectedOrder?.id || itemIds.length === 0) {
 setProductReviews({});
 return;
 }

 const { data, error } = await supabase
 .from("product_reviews")
 .select("*")
 .in("order_item_id", itemIds);

 if (error) {
 console.warn("Phase 3B.10A review load warning:", error.message);
 return;
 }

 const map: Record<string, ProductReviewRow> = {};
 (data || []).forEach((row: any) => {
 const key = String(row.order_item_id || "");
 if (key) map[key] = row as ProductReviewRow;
 });

 setProductReviews(map);
 }

 useEffect(() => {
 void loadProductReviewsForOrderItems();
 }, [selectedOrder?.id, items.length, session?.user?.id]);
 function setTab(tab: BuyerProfileTab) {
 const nextTab = normalizeBuyerProfileTab(tab);
 setActiveTab(nextTab);
 localStorage.setItem("urbanoid_buyer_profile_tab", nextTab);
 }

 async function loadOrders() {
 if (!session?.user.id) return;
 const { data, error } = await supabase
 .from("orders")
 .select("*")
 .eq("buyer_id", session.user.id)
 .order("created_at", { ascending: false });

 if (!error) {
 const rows = (data || []) as OrderRow[];
 setOrders(rows);
 if (rows.length && !selectedOrder) setSelectedOrder(rows[0]);
 }
 }

 async function loadOrderDetails(orderId: string) {
 const [{ data: itemRows }, { data: paymentRows }, { data: shipmentRows }, { data: messageRows }] = await Promise.all([
 supabase.from("order_items").select("*").eq("order_id", orderId),
 supabase.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
 supabase.from("shipments").select("*").eq("order_id", orderId),
 supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
 ]);

 const resolvedPaymentRows = await resolvePaymentProofUrls((paymentRows || []) as PaymentRow[]);

 setItems((itemRows || []) as OrderItemRow[]);
 setPayments(resolvedPaymentRows);
 setShipments((shipmentRows || []) as ShipmentRow[]);
 setMessages((messageRows || []) as OrderMessage[]);
 if (resolvedPaymentRows[0]) setSelectedPaymentId(resolvedPaymentRows[0].id);
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

 async function loadStore() {
 const { data: storeData } = await supabase
 .from("store_profiles")
 .select("*")
 .eq("is_active", true)
 .order("created_at", { ascending: true })
 .limit(1)
 .maybeSingle();

 if (storeData) setStore(storeData as StoreProfile);

 const { data: follow } = await supabase
 .from("store_follows")
 .select("id")
 .eq("buyer_id", session?.user.id || "")
 .limit(1)
 .maybeSingle();

 setFollowed(!!follow);
 }

 function startEditProfile(event?: React.MouseEvent<HTMLButtonElement>) {
 event?.preventDefault();
 event?.stopPropagation();
 setMessage("");
 setProfileEditMode(true);
 }

 async function saveProfile(event?: React.FormEvent | React.MouseEvent<HTMLButtonElement>) {
 event?.preventDefault();
 event?.stopPropagation();
 if (!session) return;

 const { error } = await supabase.from("profiles").upsert({
 id: session.user.id,
 role: profile?.role || "BUYER",
 ...form,
 email: form.email || session.user.email,
 is_active: true,
 updated_at: new Date().toISOString(),
 }, { onConflict: "id" });

 setMessage(error ? error.message : "Profil buyer berhasil diperbarui.");
 if (!error) {
 setProfileEditMode(false);
 onProfileUpdated?.();
 }
 }

 async function uploadAvatar(file: File) {
 if (!session) return;
 if (!profileEditMode) {
 setMessage("Klik Edit Profil terlebih dahulu sebelum mengganti foto profil.");
 return;
 }
 setMessage("Mengunggah foto profil...");
 const cleanName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
 const path = `${session.user.id}/${Date.now()}-${cleanName}`;

 const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true });
 if (uploadError) {
 setMessage(uploadError.message);
 return;
 }

 const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
 setForm(prev => ({ ...prev, avatar_url: data.publicUrl }));
 setMessage("Foto berhasil diunggah. Klik Simpan Profil untuk menyimpan URL foto.");
 }

 async function toggleFollow() {
 if (!session || !store) return;

 if (followed) {
 await supabase.from("store_follows").delete().eq("buyer_id", session.user.id).eq("store_id", store.id);
 setFollowed(false);
 return;
 }

 await supabase.from("store_follows").insert({ buyer_id: session.user.id, store_id: store.id });
 setFollowed(true);
 }

 async function sendMessage() {
 if (!session || !selectedOrder || !newMessage.trim()) return;

 const { error } = await supabase.from("order_messages").insert({
 order_id: selectedOrder.id,
 sender_id: session.user.id,
 sender_role: "BUYER",
 message: newMessage.trim(),
 });

 if (error) {
 setMessage(error.message);
 return;
 }

 setNewMessage("");
 await loadOrderDetails(selectedOrder.id);
 }

 async function submitPaymentConfirmation(event: React.FormEvent) {
 event.preventDefault();
 if (!session || !selectedOrder) return;

 const payment = payments.find(row => row.id === selectedPaymentId) || payments[0];
 if (!payment) {
 setMessage("Data pembayaran untuk pesanan ini belum tersedia.");
 return;
 }

 if (!paymentFile && !payment.proof_url && !payment.proof_storage_path) {
 setMessage("Upload bukti pembayaran terlebih dahulu.");
 return;
 }

 setSubmittingPayment(true);
 setMessage("Mengirim konfirmasi pembayaran...");

 let proofUrl = payment.proof_url || "";
 let proofStoragePath = payment.proof_storage_path || "";

 if (paymentFile) {
 const cleanName = paymentFile.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
 proofStoragePath = `${session.user.id}/${selectedOrder.id}/${Date.now()}-${cleanName}`;
 const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(proofStoragePath, paymentFile, { upsert: true });
 if (uploadError) {
 setMessage(uploadError.message);
 setSubmittingPayment(false);
 return;
 }
 const { data: signedData } = await supabase.storage.from("payment-proofs").createSignedUrl(proofStoragePath, 60 * 60);
 proofUrl = signedData?.signedUrl || "";
 }

 const { data, error } = await supabase.rpc("buyer_confirm_payment", {
 p_order_id: selectedOrder.id,
 p_payment_id: payment.id,
 p_payload: {
 proof_url: proofStoragePath ? "" : proofUrl,
 proof_storage_path: proofStoragePath,
 payer_name: paymentForm.payer_name,
 payer_bank: paymentForm.payer_bank,
 transfer_amount: paymentForm.transfer_amount,
 transfer_date: paymentForm.transfer_date,
 buyer_note: paymentForm.buyer_note,
 },
 });

 setSubmittingPayment(false);

 if (error || (data as any)?.error) {
 setMessage(error?.message || (data as any)?.error || "Konfirmasi pembayaran gagal.");
 return;
 }

 setPaymentFile(null);
 setMessage("Konfirmasi pembayaran berhasil dikirim. Mohon tunggu verifikasi seller/admin.");
 await loadOrders();
 await loadOrderDetails(selectedOrder.id);
 setSelectedOrder(prev => prev ? { ...prev, payment_status: "MENUNGGU_KONFIRMASI" } : prev);
 }

 
 function reviewDraftFor(row: OrderItemRow): ProductReviewDraft {
 const key = String(row.id || "");
 return reviewDrafts[key] || { rating: 5, comment: "" };
 }

 function setReviewRating(row: OrderItemRow, rating: number) {
 const key = String(row.id || "");
 if (!key) return;

 setReviewDrafts(prev => ({
 ...prev,
 [key]: {
 ...(prev[key] || { rating: 5, comment: "" }),
 rating,
 },
 }));
 }

 function setReviewComment(row: OrderItemRow, comment: string) {
 const key = String(row.id || "");
 if (!key) return;

 setReviewDrafts(prev => ({
 ...prev,
 [key]: {
 ...(prev[key] || { rating: 5, comment: "" }),
 comment,
 },
 }));
 }

 async function submitProductReview(item: OrderItemRow) {
 /* Phase 3B.10A-3 R4 Review Submit Frontend Fix */
 const itemId = String((item as any).id || "");
 const draft = (reviewDrafts as any)[itemId] || {};
 const rating = Math.max(1, Math.min(5, Number(draft.rating || 5)));
 const reviewText = String(draft.review_text || draft.comment || "").trim();

 if (!session?.user?.id) {
 const text = "Silakan login buyer terlebih dahulu untuk mengirim ulasan.";
 setMessage(text);
 alert(text);
 return;
 }

 if (!selectedOrder?.id) {
 const text = "Pilih pesanan terlebih dahulu sebelum mengirim ulasan.";
 setMessage(text);
 alert(text);
 return;
 }

 if (!phase3b8IsCompleted(selectedOrder)) {
 const text = "Ulasan hanya dapat dikirim setelah pesanan selesai atau diterima.";
 setMessage(text);
 alert(text);
 return;
 }

 if (!itemId) {
 const text = "Data item pesanan tidak lengkap. Ulasan belum dapat dikirim.";
 setMessage(text);
 alert(text);
 return;
 }

 if (!reviewText) {
 const text = "Tulis ulasan singkat sebelum mengirim.";
 setMessage(text);
 alert(text);
 return;
 }

 setMessage("Mengirim ulasan produk...");

 const productId = String((item as any).product_id || "");
 const variantId = (item as any).variant_id || null;

 const payloadR4 = {
 p_order_id: selectedOrder.id,
 p_order_item_id: itemId,
 p_product_id: productId || null,
 p_variant_id: variantId,
 p_rating: rating,
 p_comment: reviewText,
 };

 let result = await supabase.rpc("buyer_submit_product_review", payloadR4 as any);

 if (result.error) {
 const fallbackPayload = {
 p_order_id: selectedOrder.id,
 p_order_item_id: itemId,
 p_product_id: productId || null,
 p_variant_id: variantId,
 p_rating: rating,
 p_review_text: reviewText,
 };

 result = await supabase.rpc("buyer_submit_product_review", fallbackPayload as any);
 }

 if (result.error) {
 const text = "Gagal mengirim ulasan: " + result.error.message;
 setMessage(text);
 alert(text);
 return;
 }

 const rawData = (result as any).data;
 const savedReview = Array.isArray(rawData) ? rawData[0] : rawData;

 const nextReview = {
 id: savedReview?.id || "local-" + itemId,
 order_id: selectedOrder.id,
 order_item_id: itemId,
 product_id: savedReview?.product_id || productId || null,
 variant_id: savedReview?.variant_id || variantId || null,
 buyer_id: savedReview?.buyer_id || session.user.id,
 rating,
 review_text: savedReview?.review_text || savedReview?.comment || reviewText,
 is_published: true,
 created_at: savedReview?.created_at || new Date().toISOString(),
 };

 setProductReviews(prev => ({
 ...prev,
 [itemId]: nextReview as any,
 }));

 setReviewDrafts(prev => ({
 ...prev,
 [itemId]: {
 ...(prev as any)[itemId],
 rating,
 review_text: reviewText,
 comment: reviewText,
 },
 }));

 const successText = "Ulasan berhasil tersimpan. Terima kasih atas ulasan Anda.";
 setMessage(successText);
 alert(successText);
}
 async function confirmReceived() {
 if (!selectedOrder) return;
 if (!phase3b8CanConfirmReceived(selectedOrder, selectedShipment)) {
 setMessage("Pesanan belum dapat dikonfirmasi diterima. Pastikan pembayaran sudah dibayar dan pesanan sudah dikirim/resi tersedia.");
 return;
 }

 const ok = confirm("Konfirmasi pesanan sudah diterima? Setelah dikonfirmasi, status pesanan menjadi selesai.");
 if (!ok) return;

 setMessage("Mengonfirmasi pesanan diterima...");
 const { data, error } = await supabase.rpc("buyer_confirm_order_received", { p_order_id: selectedOrder.id });

 if (error || (data as any)?.error) {
 setMessage(error?.message || (data as any)?.error || "Gagal mengonfirmasi pesanan diterima.");
 return;
 }

 setMessage("Pesanan sudah dikonfirmasi diterima. Terima kasih.");
 await loadOrders();
 await loadOrderDetails(selectedOrder.id);
 setSelectedOrder(prev => prev ? {
 ...prev,
 order_status: "SELESAI",
 shipping_status: "DITERIMA",
 received_at: new Date().toISOString(),
 completed_at: new Date().toISOString(),
 } : prev);
 }



 async function cancelUnpaidOrder() {
 if (!selectedOrder) return;
 const payment = payments.find(row => row.id === selectedPaymentId) || payments[0] || null;

 if (!phase3b7xCanCancelOrder(selectedOrder, payment)) {
 setMessage("Pesanan tidak dapat dibatalkan karena pembayaran sudah dikirim, dibayar, atau status pesanan sudah tidak memenuhi syarat.");
 return;
 }

 const ok = confirm(`Batalkan pesanan ${displayOrderNo(selectedOrder)}? Pesanan akan dipindahkan ke status Dibatalkan dan stok item dikembalikan bila checkout sebelumnya mengurangi stok.`);
 if (!ok) return;

 setCancelingOrderId(selectedOrder.id);
 setMessage("Membatalkan pesanan...");

 const { data, error } = await supabase.rpc("buyer_cancel_unpaid_order", {
 p_order_id: selectedOrder.id,
 p_reason: "Dibatalkan buyer sebelum pembayaran",
 });

 setCancelingOrderId("");

 if (error || (data as any)?.error) {
 setMessage(error?.message || (data as any)?.error || "Gagal membatalkan pesanan.");
 return;
 }

 setMessage("Pesanan berhasil dibatalkan. Anda dapat membuat pesanan baru jika ingin merevisi pilihan produk/ekspedisi.");
 await loadOrders();
 await loadOrderDetails(selectedOrder.id);
 setSelectedOrder(prev => prev ? {
 ...prev,
 order_status: "DIBATALKAN",
 payment_status: "DIBATALKAN",
 shipping_status: "DIBATALKAN",
 updated_at: new Date().toISOString(),
 } : prev);
 }

 const totalOrderValue = useMemo(() => orders.reduce((sum, order) => sum + Number(order.grand_total || order.total_amount || 0), 0), [orders]);

 const filteredOrders = useMemo(() => {
 return orders.filter(order => {
 if (orderTab === "BELUM_BAYAR") return order.payment_status === "BELUM_DIBAYAR" || order.payment_status === "DITOLAK";
 if (orderTab === "KONFIRMASI") return order.payment_status === "MENUNGGU_KONFIRMASI";
 if (orderTab === "DIKEMAS") return order.order_status === "DIPROSES" || order.shipping_status === "DIKEMAS";
 if (orderTab === "DIKIRIM") return order.shipping_status === "DIKIRIM";
 if (orderTab === "SELESAI") return order.order_status === "SELESAI" || order.shipping_status === "DITERIMA";
 if (orderTab === "DIBATALKAN") return order.order_status === "DIBATALKAN";
 return true;
 });
 }, [orders, orderTab]);

 const selectedPayment = payments.find(row => row.id === selectedPaymentId) || payments[0] || null;
 const selectedShipment = shipments[0] || null;
 const currentStep = paymentStep(selectedOrder);
 const pageTitle = activeTab === "orders" ? "Pesanan Saya" : activeTab === "chat" ? "Chat Pesanan" : activeTab === "store" ? "Profil Toko" : "Profil Buyer";
 const pageDescription = activeTab === "orders"
 ? "Pantau transaksi, pembayaran, pengiriman, resi, dan bukti transfer pesanan Anda."
 : activeTab === "chat"
 ? "Kelola percakapan dengan seller berdasarkan pesanan yang dipilih."
 : activeTab === "store"
 ? "Lihat informasi toko, kontak, dan status mengikuti toko."
 : "Edit data profil, alamat pengiriman, nomor HP, email, dan foto buyer.";

 if (!session) {
 return (
 <section className="panel">
 <h1>Profil Buyer</h1>
 <p>Silakan login/register buyer terlebih dahulu.</p>
 <a className="btn-primary inline-link-button" href="#/buyer-register">Registrasi / Login Buyer</a>
 </section>
 );
 }

 return (
 <section className="panel buyer-profile-panel phase-3b-7-buyer-orders">
 <div className="section-title">
 <div>
 <h1>{pageTitle}</h1>
 <p>{pageDescription}</p>
 </div>
 <a className="btn-secondary inline-link-button" href="#/buyer">Kembali ke Katalog</a>
 </div>

 <div className="profile-tab-row">
 <button className={activeTab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profil</button>
 <button className={activeTab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Pesanan Saya</button>
 <button className={activeTab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>Chat Pesanan</button>

 <button
 type="button"
 className="buyer-address-tab-btn"
 onClick={() => {
 window.location.hash = "/buyer-addresses";
 }}
 >
 Atur Alamat
 </button>
 <button className={activeTab === "store" ? "active" : ""} onClick={() => setTab("store")}>Toko</button>
 </div>

 {message && <div className={message.toLowerCase().includes("gagal") || message.toLowerCase().includes("error") ? "error-box" : "success-box"}>{message}</div>}

 {activeTab === "profile" && (
 <form className={`profile-form ${profileEditMode ? "profile-edit-mode" : "profile-view-mode"}`} onSubmit={(event) => { event.preventDefault(); if (profileEditMode) saveProfile(event); }}>
 <div className="avatar-box">
 <img src={form.avatar_url || "https://placehold.co/140x140/111827/ffffff?text=Buyer"} alt="Profil buyer" />
 <label>
 Upload Foto Profil
 <input type="file" accept="image/*" disabled={!profileEditMode} onChange={event => { const file = event.target.files?.[0]; if (file) uploadAvatar(file); }} />
 </label>
 </div>
 <div className="checkout-grid">
 <label>Nama Lengkap<input value={form.full_name} disabled={!profileEditMode} onChange={e => setForm({ ...form, full_name: e.target.value })} /></label>
 <label>Username<input value={form.username} disabled={!profileEditMode} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
 <label>Email<input value={form.email} disabled={!profileEditMode} onChange={e => setForm({ ...form, email: e.target.value })} type="email" /></label>
 <label>Nomor HP<input value={form.phone} disabled={!profileEditMode} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
 <label className="checkout-full">Alamat Lengkap<textarea value={form.address_line} disabled={!profileEditMode} onChange={e => setForm({ ...form, address_line: e.target.value })} rows={3} /></label>
 <label>Kecamatan<input value={form.district} disabled={!profileEditMode} onChange={e => setForm({ ...form, district: e.target.value })} /></label>
 <label>Kota/Kabupaten<input value={form.city} disabled={!profileEditMode} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
 <label>Provinsi<input value={form.province} disabled={!profileEditMode} onChange={e => setForm({ ...form, province: e.target.value })} /></label>
 <label>Kode Pos<input value={form.postal_code} disabled={!profileEditMode} onChange={e => setForm({ ...form, postal_code: e.target.value })} /></label>
 </div>
 {profileEditMode ? (
 <button
 className="btn-primary"
 type="button"
 onClick={saveProfile}
 >
 Simpan Profil
 </button>
 ) : (
 <button
 className="btn-secondary profile-edit-toggle"
 type="button"
 onClick={startEditProfile}
 >
 Edit Profil
 </button>
 )}
 </form>
 )}

 {activeTab === "orders" && (
 <div className="buyer-orders-grid enhanced-buyer-orders">
 <div className="metric-card"><span>Total Pesanan</span><strong>{orders.length}</strong></div>
 <div className="metric-card"><span>Total Belanja</span><strong>{formatCurrency(totalOrderValue)}</strong></div>

 <div className="buyer-order-tabs checkout-full">
 {[
 ["ALL", "Semua"],
 ["BELUM_BAYAR", "Belum Bayar"],
 ["KONFIRMASI", "Menunggu Verifikasi"],
 ["DIKEMAS", "Sedang Dikemas"],
 ["DIKIRIM", "Dikirim"],
 ["SELESAI", "Selesai"],
 ["DIBATALKAN", "Dibatalkan"],
 ].map(([key, label]) => (
 <button key={key} className={orderTab === key ? "active" : ""} onClick={() => setOrderTab(key as BuyerOrderTab)}>{label}</button>
 ))}
 </div>

 <div className="buyer-order-layout checkout-full">
 <aside className="buyer-order-list">
 {filteredOrders.map(order => (
 <button key={order.id} className={selectedOrder?.id === order.id ? "active" : ""} onClick={() => setSelectedOrder(order)}>
 <strong>{displayOrderNo(order)}</strong>
 <span>{formatDate(order.created_at)}</span>
 <em>{formatCurrency(Number(order.grand_total || order.total_amount || 0))}</em>
 <small>{statusLabel(order.order_status)} • {statusLabel(order.payment_status)} • {statusLabel(order.shipping_status)}</small>
 </button>
 ))}
 {filteredOrders.length === 0 && <div className="empty-state">Belum ada pesanan pada filter ini.</div>}
 </aside>

 <section className="buyer-order-detail">
 {!selectedOrder ? (
 <div className="empty-state">Pilih pesanan untuk melihat detail status.</div>
 ) : (
 <>
 <div className="buyer-order-detail-head">
 <div>
 <h2>{displayOrderNo(selectedOrder)}</h2>
 <p>{formatDate(selectedOrder.created_at)}</p>
 </div>
 <strong>{formatCurrency(Number(selectedOrder.grand_total || selectedOrder.total_amount || 0))}</strong>
 </div>

 <div className="order-progress-line">
 {["Belum Bayar", "Verifikasi", "Diproses", "Dikirim", "Diterima"].map((label, index) => (
 <div key={label} className={currentStep >= index ? "active" : ""}>
 <span>{index + 1}</span>
 <small>{label}</small>
 </div>
 ))}
 </div>

 <div className="buyer-order-info-grid">
 <div><span>Status Order</span><strong>{statusLabel(selectedOrder.order_status)}</strong></div>
 <div><span>Pembayaran</span><strong>{statusLabel(selectedOrder.payment_status)}</strong></div>
 <div><span>Pengiriman</span><strong>{statusLabel(selectedOrder.shipping_status)}</strong></div>
 <div><span>Resi</span><strong>{selectedShipment?.tracking_number || "Belum tersedia"}</strong></div>
 {selectedShipment?.booking_status && <div><span>Status Biteship</span><strong>{phase3b7vStatusText(selectedShipment.booking_status)}</strong></div>}
 </div>

 {phase3b7xIsCancelled(selectedOrder) && (
 <div className="phase3b7x-cancelled-notice" data-phase="3b7x-buyer-cancel-order">
 Pesanan ini sudah dibatalkan. Jika ingin merevisi pesanan, silakan kembali ke katalog dan buat pesanan baru.
 </div>
 )}

 {phase3b8LifecycleNotice(selectedOrder) && (
 <div className={phase3b8IsCancelled(selectedOrder) ? "phase3b8-lifecycle-notice danger" : "phase3b8-lifecycle-notice"}>
 {phase3b8LifecycleNotice(selectedOrder)}
 </div>
 )}

 <div className="buyer-order-address-card">
 <h3>Alamat Pengiriman</h3>
 <p>{selectedOrder.shipping_address || "-"}</p>
 <p>{[selectedOrder.shipping_district, selectedOrder.shipping_city, selectedOrder.shipping_province, selectedOrder.shipping_postal_code].filter(Boolean).join(", ")}</p>
 <p>Ekspedisi: <strong>{selectedShipment?.courier_name || selectedShipment?.expedition_name || "-"} {selectedShipment?.service_name ? `/ ${selectedShipment.service_name}` : ""}</strong></p>
 <Phase3B7VBuyerShippingSummary order={selectedOrder} shipment={selectedShipment} />
 </div>

 <div className="table-wrap buyer-order-items-table">
 <table className="master-table compact-table">
 <thead><tr><th>Produk</th><th>Varian</th><th>Qty</th><th>Subtotal</th></tr></thead>
 <tbody>
 {items.map(item => (
 <tr key={item.id}>
 <td>
 <strong>{item.product_name || "-"}</strong>
 {(item as any).sku_variant && <small className="phase3b10a-review-sku">{(item as any).sku_variant}</small>}

 {selectedOrder && phase3b8IsCompleted(selectedOrder) && item.id && (
 <div className="phase3b10a-review-box">
 {productReviews[String(item.id)] ? (
 <div className="phase3b10a-review-done">
 <span>Sudah diulas dan tersimpan</span>
 <strong>{"★".repeat(Number(productReviews[String(item.id)]?.rating || 0))}{"☆".repeat(5 - Number(productReviews[String(item.id)]?.rating || 0))}</strong>
 {(productReviews[String(item.id)]?.review_text || productReviews[String(item.id)]?.comment) && <p>{productReviews[String(item.id)]?.review_text || productReviews[String(item.id)]?.comment}</p>}
 </div>
 ) : (
 <div className="phase3b10a-review-form">
 <small>Beri ulasan produk</small>
 <div className="phase3b10a-stars" aria-label="Rating bintang">
 {[1, 2, 3, 4, 5].map(star => (
 <button
 key={star}
 type="button"
 className={star <= reviewDraftFor(item).rating ? "active" : ""}
 onClick={() => setReviewRating(item, star)}
 aria-label={`${star} bintang`}
 >
 ★
 </button>
 ))}
 </div>
 <textarea
 value={reviewDraftFor(item).comment}
 onChange={event => setReviewComment(item, event.target.value)}
 placeholder="Tulis ulasan singkat untuk produk ini..."
 rows={2}
 />
 <button
 type="button"
 className="phase3b10a-submit-review-btn"
 disabled={reviewSubmittingId === String(item.id)}
 onClick={() => submitProductReview(item)}
 >
 {reviewSubmittingId === String(item.id) ? "Mengirim..." : "Kirim Ulasan"}
 </button>
 </div>
 )}
 </div>
 )}
</td>
 <td>{[item.color_name, item.size_name, item.pattern_type].filter(Boolean).join(" / ")}</td>
 <td>{item.qty || 0}</td>
 <td>{formatCurrency(Number(item.subtotal || 0))}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <form className="payment-confirm-card" onSubmit={submitPaymentConfirmation}>
 <h3>Pembayaran & Konfirmasi</h3>
 <p className="muted-text">Upload bukti transfer agar seller dapat memverifikasi pembayaran dan mulai memproses pesanan.</p>

 {selectedPayment && (
 <div className="payment-current-status">
 <span>Metode: <strong>{selectedPayment.payment_method || selectedPayment.payment_method_code || "BANK_TRANSFER"}</strong></span>
 <span>Status: <strong>{statusLabel(selectedPayment.payment_status)}</strong></span>
 <span>Total: <strong>{formatCurrency(Number(selectedPayment.amount || selectedOrder.grand_total || 0))}</strong></span>
 </div>
 )}

 {selectedPayment?.proof_url && (
 <div className="payment-proof-preview">
 {isImageProof(selectedPayment.proof_url) ? <img src={selectedPayment.proof_url} alt="Bukti pembayaran" /> : null}
 <button
 type="button"
 className="proof-preview-link"
 onClick={() => setSelectedProof({
 url: selectedPayment.proof_url!,
 title: `Bukti Pembayaran ${displayOrderNo(selectedOrder)}`,
 isImage: isImageProof(selectedPayment.proof_url),
 })}
 >
 Lihat Bukti Pembayaran
 </button>
 <small>Dikirim: {formatDate(selectedPayment.proof_uploaded_at)}</small>
 </div>
 )}

 <div className="checkout-grid payment-confirm-grid">
 <label>Nama Pengirim<input value={paymentForm.payer_name} onChange={e => setPaymentForm({ ...paymentForm, payer_name: e.target.value })} placeholder="Nama pada rekening/e-wallet" /></label>
 <label>Bank / E-Wallet<input value={paymentForm.payer_bank} onChange={e => setPaymentForm({ ...paymentForm, payer_bank: e.target.value })} placeholder="BCA, BRI, Mandiri, Dana, dll." /></label>
 <label>Nominal Transfer<input value={paymentForm.transfer_amount} onChange={e => setPaymentForm({ ...paymentForm, transfer_amount: e.target.value })} placeholder="115000" /></label>
 <label>Tanggal Transfer<input type="date" value={paymentForm.transfer_date} onChange={e => setPaymentForm({ ...paymentForm, transfer_date: e.target.value })} /></label>
 <label className="checkout-full">Catatan Pembayaran<textarea value={paymentForm.buyer_note} onChange={e => setPaymentForm({ ...paymentForm, buyer_note: e.target.value })} rows={2} placeholder="Contoh: transfer dari rekening atas nama ..." /></label>
 <label className="checkout-full">Bukti Pembayaran<input type="file" accept="image/*,.pdf" onChange={e => setPaymentFile(e.target.files?.[0] || null)} /></label>
 </div>

 {selectedPayment?.rejection_reason && <div className="error-box">Bukti sebelumnya ditolak: {selectedPayment.rejection_reason}</div>}

 <div className="button-row">
 <button className="btn-primary" type="submit" disabled={submittingPayment || selectedOrder.payment_status === "DIBAYAR" || phase3b7xIsCancelled(selectedOrder)}>
 {submittingPayment ? "Mengirim..." : phase3b7xIsCancelled(selectedOrder) ? "Pesanan Dibatalkan" : selectedOrder.payment_status === "DIBAYAR" ? "Pembayaran Terkonfirmasi" : "Kirim Konfirmasi Pembayaran"}
 </button>
 {phase3b8CanConfirmReceived(selectedOrder, selectedShipment) && <button type="button" className="phase3b8-received-btn" onClick={confirmReceived}>Pesanan Sudah Diterima</button>}
 {phase3b7xCanCancelOrder(selectedOrder, selectedPayment) && (
 <button
 type="button"
 className="phase3b7x-cancel-order-btn"
 disabled={cancelingOrderId === selectedOrder.id}
 onClick={cancelUnpaidOrder}
 >
 {cancelingOrderId === selectedOrder.id ? "Membatalkan..." : "Batal Pesanan"}
 </button>
 )}
 <button type="button" onClick={() => setTab("chat")}>Chat Seller</button>
 </div>
 </form>
 </>
 )}
 </section>
 </div>
 </div>
 )}

 {activeTab === "chat" && (
 <div className="chat-layout">
 <aside>
 <h3>Pilih Pesanan</h3>
 {orders.map(order => (
 <button key={order.id} className={selectedOrder?.id === order.id ? "active" : ""} onClick={() => setSelectedOrder(order)}>{displayOrderNo(order)}</button>
 ))}
 </aside>
 <section>
 <h3>Chat Pesanan {displayOrderNo(selectedOrder)}</h3>
 <div className="chat-box">
 {messages.map(msg => (
 <div key={msg.id} className={`chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
 <small>{msg.sender_role || "USER"} • {formatDate(msg.created_at)}</small>
 <span>{msg.message}</span>
 </div>
 ))}
 {messages.length === 0 && <div className="empty-state">Belum ada chat untuk pesanan ini.</div>}
 </div>
 <div className="chat-input-row">
 <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Tulis pesan ke seller..." />
 <button className="btn-primary" onClick={sendMessage} disabled={!selectedOrder}>Kirim</button>
 </div>
 </section>
 </div>
 )}

 {activeTab === "store" && (
 <div className="store-public-detail">
 <h2>{store?.store_name || "UrbaNoiD Official Store"}</h2>
 <p>{store?.description || "Profil toko belum diisi seller."}</p>
 <div className="store-info-grid">
 <span>WhatsApp: {store?.whatsapp || "-"}</span>
 <span>Email: {store?.email || "-"}</span>
 <span>Alamat: {[store?.address_line, store?.city, store?.province].filter(Boolean).join(", ") || "-"}</span>
 </div>
 <button className={followed ? "btn-secondary" : "btn-primary"} onClick={toggleFollow}>
 {followed ? "Berhenti Ikuti Toko" : "Ikuti Toko"}
 </button>
 </div>
 )}

 {selectedProof && (
 <div className="modal-backdrop proof-viewer-overlay" onMouseDown={() => setSelectedProof(null)}>
 <div className="proof-viewer-modal" onMouseDown={event => event.stopPropagation()}>
 <div className="proof-viewer-head">
 <div>
 <h2>{selectedProof.title}</h2>
 <p>Preview bukti pembayaran Anda.</p>
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
 <a className="btn-secondary-link" href={selectedProof.url} target="_blank" rel="noreferrer">Buka Tab Baru</a>
 <button type="button" onClick={() => setSelectedProof(null)}>Tutup</button>
 </div>
 </div>
 </div>
 )}
 </section>
 );
}

export default BuyerProfilePage;

