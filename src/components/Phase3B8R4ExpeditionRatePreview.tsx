import { supabase } from "../lib/supabase";
// Phase 3B.8-R4-R2 import fix: resolved Supabase client import
import React, { useMemo, useState } from "react";
type PreviewRate = {
 id?: string;
 courier_company?: string;
 courier_name?: string;
 courier_type?: string;
 courier_service_name?: string;
 service_type?: string;
 price?: number;
 shipping_cost?: number;
 duration?: string;
 shipment_duration_range?: string;
 shipment_duration_unit?: string;
 raw?: any;
};

const formatCurrency3B8R4 = (value: any) => {
 const n = Number(value || 0);
 if (!Number.isFinite(n)) return "Rp 0";
 return "Rp " + n.toLocaleString("id-ID");
};

const normalizeRates3B8R4 = (payload: any): PreviewRate[] => {
 const roots = [
 payload?.rates,
 payload?.pricing,
 payload?.data?.rates,
 payload?.data?.pricing,
 payload?.result?.rates,
 payload?.result?.pricing,
 payload?.data,
 ];
 const arr = roots.find((x) => Array.isArray(x)) || [];
 return arr.map((r: any, idx: number) => ({
 id: r.id || r.rate_id || String(idx),
 courier_company: r.courier_company || r.company || r.courier_code || r.courier,
 courier_name: r.courier_name || r.company_name || r.courier_company,
 courier_type: r.courier_type || r.type || r.service_code || r.service_type,
 courier_service_name: r.courier_service_name || r.service_name || r.service || r.courier_type,
 price: Number(r.price ?? r.shipping_cost ?? r.final_price ?? r.amount ?? 0),
 duration: r.duration || r.shipment_duration_range || r.etd || "",
 shipment_duration_range: r.shipment_duration_range,
 shipment_duration_unit: r.shipment_duration_unit,
 raw: r,
 }));
};

export default function Phase3B8R4ExpeditionRatePreview() {
 const [postalCode, setPostalCode] = useState("16164");
 const [weight, setWeight] = useState("250");
 const [couriers, setCouriers] = useState("jne,jnt,sicepat,tiki,anteraja");
 const [loading, setLoading] = useState(false);
 const [rates, setRates] = useState<PreviewRate[]>([]);
 const [message, setMessage] = useState("");

 const courierHint = useMemo(() => {
 return couriers.split(",").map((v) => v.trim()).filter(Boolean).join(", ");
 }, [couriers]);

 const checkRates = async () => {
 setLoading(true);
 setMessage("");
 setRates([]);
 try {
 const weightNum = Math.max(1, Number(weight || 0));
 const body = {
 phase: "3B.8-R4",
 preview: true,
 destination_postal_code: postalCode,
 destinationPostalCode: postalCode,
 postal_code: postalCode,
 destination: { postal_code: postalCode },
 weight: weightNum,
 weight_grams: weightNum,
 couriers,
 courier_companies: couriers,
 items: [
 {
 name: "Preview Ongkir",
 description: "Preview seller expedition rate",
 value: 100000,
 quantity: 1,
 weight: weightNum,
 length: 20,
 width: 20,
 height: 2,
 },
 ],
 };

 const { data, error } = await supabase.functions.invoke("shipping-rates", { body });
 if (error) {
 throw new Error(error.message || "Gagal memanggil shipping-rates.");
 }
 const normalized = normalizeRates3B8R4(data);
 setRates(normalized);
 setMessage(normalized.length ? "Preview ongkir aktual berhasil dimuat." : "Rates API tidak mengembalikan opsi ongkir untuk parameter ini.");
 } catch (err: any) {
 setMessage(err?.message || "Gagal mengambil preview ongkir.");
 } finally {
 setLoading(false);
 }
 };

 return (
 <section className="phase3b8r4-expedition-preview">
 <div className="phase3b8r4-preview-head">
 <div>
 <h3>Preview Ongkir Aktual Biteship</h3>
 <p>
 Gunakan panel ini untuk menguji estimasi ongkir aktual. Tarif utama checkout tetap dihitung dari
 Biteship Rates API berdasarkan alamat buyer, berat, dan layanan terpilih.
 </p>
 </div>
 <button type="button" onClick={checkRates} disabled={loading}>
 {loading ? "Menghitung..." : "Cek Ongkir"}
 </button>
 </div>

 <div className="phase3b8r4-preview-form">
 <label>
 <span>Kode Pos Tujuan</span>
 <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="Contoh: 16164" />
 </label>
 <label>
 <span>Berat Paket (gram)</span>
 <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Contoh: 250" inputMode="numeric" />
 </label>
 <label className="phase3b8r4-preview-wide">
 <span>Kurir yang diuji</span>
 <input value={couriers} onChange={(e) => setCouriers(e.target.value)} placeholder="jne,jnt,sicepat,tiki,anteraja" />
 </label>
 </div>

 <p className="phase3b8r4-preview-note">
 Whitelist/fallback seller membatasi kurir yang ingin didukung. Harga final tetap dari Biteship Rates API.
 Kurir diuji: {courierHint || "-"}.
 </p>

 {message && <div className={rates.length ? "phase3b8r4-preview-ok" : "phase3b8r4-preview-warn"}>{message}</div>}

 {rates.length > 0 && (
 <div className="phase3b8r4-preview-rates">
 {rates.map((r, idx) => {
 const courier = String(r.courier_company || r.courier_name || "-").toUpperCase();
 const service = String(r.courier_service_name || r.courier_type || r.service_type || "-").toUpperCase();
 const duration = r.duration || [r.shipment_duration_range, r.shipment_duration_unit].filter(Boolean).join(" ");
 return (
 <div className="phase3b8r4-rate-card" key={r.id || idx}>
 <strong>{courier} / {service}</strong>
 <span>{formatCurrency3B8R4(r.price ?? r.shipping_cost)}</span>
 {duration ? <small>{duration}</small> : null}
 </div>
 );
 })}
 </div>
 )}
 </section>
 );
}

