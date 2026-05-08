import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type OrderNotification = {
 id: string;
 orderNo: string;
 buyerName: string;
 totalText: string;
 createdAt: string;
 source: "realtime" | "polling";
};

const POLL_INTERVAL_MS_3B10C = 8000;
const INITIAL_GRACE_MS_3B10C = 12000;

function formatRupiah3B10C(value: unknown): string {
 const num = Number(value || 0);

 if (!Number.isFinite(num) || num <= 0) return "Rp 0";

 return new Intl.NumberFormat("id-ID", {
 style: "currency",
 currency: "IDR",
 maximumFractionDigits: 0,
 }).format(num);
}

function pickText3B10C(...values: unknown[]): string {
 for (const value of values) {
 if (value === null || value === undefined) continue;
 const text = String(value).trim();
 if (text) return text;
 }

 return "";
}

function isSellerArea3B10C(): boolean {
 const hash = window.location.hash || "";
 const path = window.location.pathname || "";
 const url = `${path} ${hash}`.toLowerCase();

 if (url.includes("buyer")) return false;

 return [
 "seller",
 "admin",
 "orders",
 "pesanan",
 "finance",
 "shipping",
 "stock",
 "product-matrix",
 "master",
 "store-profile",
 "store-chat",
 "users",
 ].some((keyword) => url.includes(keyword));
}

function buildNotification3B10C(record: Record<string, any>, source: "realtime" | "polling"): OrderNotification {
 const id = pickText3B10C(
 record.id,
 record.order_id,
 record.uuid,
 record.order_no,
 record.order_number
 );

 const orderNo = pickText3B10C(
 record.order_no,
 record.order_number,
 record.invoice_no,
 record.code,
 record.id,
 "Pesanan baru"
 );

 const buyerName = pickText3B10C(
 record.buyer_name,
 record.customer_name,
 record.recipient_name,
 record.receiver_name,
 record.buyer_email,
 record.email,
 "Buyer"
 );

 const totalText = formatRupiah3B10C(
 record.total_amount ??
 record.grand_total ??
 record.total ??
 record.amount ??
 record.payment_amount ??
 record.subtotal
 );

 const createdAt = pickText3B10C(record.created_at, record.inserted_at, new Date().toISOString());

 return {
 id: id || `${orderNo}-${createdAt}`,
 orderNo,
 buyerName,
 totalText,
 createdAt,
 source,
 };
}

function playNewOrderSound3B10C() {
 try {
 const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
 if (!AudioContextClass) return;

 const ctx = new AudioContextClass();
 const oscillator = ctx.createOscillator();
 const gain = ctx.createGain();

 oscillator.type = "sine";
 oscillator.frequency.value = 880;

 gain.gain.setValueAtTime(0.0001, ctx.currentTime);
 gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.03);
 gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);

 oscillator.connect(gain);
 gain.connect(ctx.destination);

 oscillator.start();
 oscillator.stop(ctx.currentTime + 0.45);
 } catch {
 // Optional sound only.
 }
}

function showBrowserNotification3B10C(notification: OrderNotification) {
 try {
 if (!("Notification" in window)) return;

 if (Notification.permission === "granted") {
 const browserNotif = new Notification("Pesanan baru masuk", {
 body: `${notification.orderNo} - ${notification.buyerName} - ${notification.totalText}`,
 tag: `urbanoid-order-${notification.id}`,
 });

 browserNotif.onclick = () => {
 window.focus();
 window.location.hash = "#/orders";
 browserNotif.close();
 };

 return;
 }
 } catch {
 // Browser notification is optional.
 }
}

function shouldNotifyCreatedAt3B10C(createdAt: string, mountedAt: number): boolean {
 const createdAtTime = Date.parse(createdAt);

 if (!Number.isFinite(createdAtTime)) return true;

 // Jangan notifikasi order sangat lama saat halaman pertama kali dibuka/reconnect.
 return createdAtTime + INITIAL_GRACE_MS_3B10C >= mountedAt;
}

export default function Phase3B10CSellerOrderNotifier() {
 const [items, setItems] = useState<OrderNotification[]>([]);
 const knownIdsRef = useRef<Set<string>>(new Set());
 const initializedPollingRef = useRef(false);
 const mountedAtRef = useRef<number>(Date.now());

 const enabled = useMemo(() => {
 return typeof window !== "undefined";
 }, []);

 const pushNotification = (notification: OrderNotification) => {
 if (!notification.id) return;
 if (knownIdsRef.current.has(notification.id)) return;

 knownIdsRef.current.add(notification.id);

 setItems((current) => {
 const exists = current.some((item) => item.id === notification.id);
 if (exists) return current;
 return [notification, ...current].slice(0, 5);
 });

 playNewOrderSound3B10C();
 showBrowserNotification3B10C(notification);
 };

 useEffect(() => {
 if (!enabled) return;

 const requestPermissionOnFirstClick = () => {
 try {
 if ("Notification" in window && Notification.permission === "default") {
 Notification.requestPermission().catch(() => undefined);
 }
 } catch {
 // optional
 }
 };

 window.addEventListener("click", requestPermissionOnFirstClick, { once: true });

 return () => {
 window.removeEventListener("click", requestPermissionOnFirstClick);
 };
 }, [enabled]);

 useEffect(() => {
 if (!enabled) return;

 const channel = supabase
 .channel("phase3b10c-seller-new-order-notification")
 .on(
 "postgres_changes",
 {
 event: "INSERT",
 schema: "public",
 table: "orders",
 },
 (payload) => {
 if (!isSellerArea3B10C()) return;

 const record = (payload.new || {}) as Record<string, any>;
 const notification = buildNotification3B10C(record, "realtime");

 if (!shouldNotifyCreatedAt3B10C(notification.createdAt, mountedAtRef.current)) {
 knownIdsRef.current.add(notification.id);
 return;
 }

 pushNotification(notification);
 }
 )
 .subscribe();

 return () => {
 supabase.removeChannel(channel);
 };
 }, [enabled]);

 useEffect(() => {
 if (!enabled) return;

 let cancelled = false;

 async function pollLatestOrders() {
 if (cancelled) return;
 if (!isSellerArea3B10C()) return;

 const { data, error } = await supabase
 .from("orders")
 .select("*")
 .order("created_at", { ascending: false })
 .limit(5);

 if (cancelled) return;

 if (error || !Array.isArray(data)) {
 return;
 }

 const latest = [...data].reverse();

 if (!initializedPollingRef.current) {
 for (const record of latest) {
 const notification = buildNotification3B10C(record as Record<string, any>, "polling");
 if (notification.id) {
 knownIdsRef.current.add(notification.id);
 }
 }

 initializedPollingRef.current = true;
 return;
 }

 for (const record of latest) {
 const notification = buildNotification3B10C(record as Record<string, any>, "polling");

 if (!shouldNotifyCreatedAt3B10C(notification.createdAt, mountedAtRef.current)) {
 knownIdsRef.current.add(notification.id);
 continue;
 }

 pushNotification(notification);
 }
 }

 pollLatestOrders();

 const timer = window.setInterval(pollLatestOrders, POLL_INTERVAL_MS_3B10C);

 const onFocus = () => {
 window.setTimeout(pollLatestOrders, 500);
 };

 const onHashChange = () => {
 window.setTimeout(pollLatestOrders, 500);
 };

 window.addEventListener("focus", onFocus);
 window.addEventListener("hashchange", onHashChange);

 return () => {
 cancelled = true;
 window.clearInterval(timer);
 window.removeEventListener("focus", onFocus);
 window.removeEventListener("hashchange", onHashChange);
 };
 }, [enabled]);

 if (!items.length) return null;

 return (
 <div className="phase3b10c-order-toast-stack" aria-live="polite">
 {items.map((item) => (
 <div className="phase3b10c-order-toast" key={item.id}>
 <button
 className="phase3b10c-order-toast-close"
 type="button"
 aria-label="Tutup notifikasi"
 onClick={() => setItems((current) => current.filter((x) => x.id !== item.id))}
 >
 x
 </button>

 <div className="phase3b10c-order-toast-kicker">
 Pesanan baru masuk
 {item.source === "polling" ? " - Sinkron otomatis" : ""}
 </div>

 <div className="phase3b10c-order-toast-title">{item.orderNo}</div>

 <div className="phase3b10c-order-toast-meta">
 {item.buyerName} - {item.totalText}
 </div>

 <button
 className="phase3b10c-order-toast-action"
 type="button"
 onClick={() => {
 window.location.hash = "#/orders";
 setItems((current) => current.filter((x) => x.id !== item.id));
 }}
 >
 Buka Pesanan
 </button>
 </div>
 ))}
 </div>
 );
}
