import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Truck } from "lucide-react";
import { supabase } from "../lib/supabase";

export type Phase3B7WRateOption = {
 id: string;
 provider?: string | null;
 courier_code?: string | null;
 courier_name?: string | null;
 courier_company?: string | null;
 service_code?: string | null;
 service_name?: string | null;
 courier_type?: string | null;
 price: number;
 duration?: string | null;
 description?: string | null;
 raw?: any;
};

type Destination = {
 address?: string | null;
 address_line?: string | null;
 shipping_address?: string | null;
 district?: string | null;
 city?: string | null;
 province?: string | null;
 postal_code?: string | null;
 shipping_postal_code?: string | null;
 phone?: string | null;
 area_id?: string | null;
 location_id?: string | null;
};

type Props = {
 destination: Destination;
 items: any[];
 subtotal: number;
 couriers?: string;
 selectedRate?: Phase3B7WRateOption | null;
 onSelect: (rate: Phase3B7WRateOption) => void;
 disabled?: boolean;
};

function formatCurrency(value: number) {
 return new Intl.NumberFormat("id-ID", {
 style: "currency",
 currency: "IDR",
 maximumFractionDigits: 0,
 }).format(Number(value || 0));
}

function rateLabel(rate: Phase3B7WRateOption) {
 const courier = rate.courier_name || rate.courier_code || rate.courier_company || "Kurir";
 const service = rate.service_name || rate.service_code || rate.courier_type || "Layanan";
 return `${courier} / ${service}`.toUpperCase();
}

export function phase3b7wRateToOrderPatch(rate: Phase3B7WRateOption, subtotal: number) {
 const shipping = Number(rate.price || 0);
 const total = Number(subtotal || 0) + shipping;
 return {
 shipping_cost: shipping,
 shipping_actual_cost: shipping,
 shipping_rate_id: rate.id,
 shipping_rate_provider: "biteship",
 shipping_rate_response_json: rate.raw || rate,
 shipping_rate_checked_at: new Date().toISOString(),
 shipping_courier_company: rate.courier_company || rate.courier_code || rate.courier_name || null,
 shipping_courier_type: rate.courier_type || rate.service_code || rate.service_name || null,
 shipping_courier_service_name: rate.service_name || rate.service_code || null,
 shipping_courier_etd: rate.duration || null,
 total_amount: total,
 grand_total: total,
 };
}

export function phase3b7wRateToShipmentPatch(rate: Phase3B7WRateOption) {
 return {
 shipping_cost: Number(rate.price || 0),
 actual_shipping_cost: Number(rate.price || 0),
 provider_rate_id: rate.id,
 shipping_rate_provider: "biteship",
 shipping_rate_response_json: rate.raw || rate,
 shipping_rate_checked_at: new Date().toISOString(),
 provider_name: "biteship",
 provider_courier_company: rate.courier_company || rate.courier_code || rate.courier_name || null,
 provider_courier_type: rate.courier_type || rate.service_code || rate.service_name || null,
 provider_service_code: rate.service_code || rate.courier_type || rate.service_name || null,
 courier_code: rate.courier_code || rate.courier_company || null,
 courier_name: rate.courier_name || rate.courier_code || null,
 service_name: rate.service_name || rate.service_code || rate.courier_type || null,
 shipping_courier_etd: rate.duration || null,
 };
}

export function Phase3B7WRatesCheckout({ destination, items, subtotal, couriers = "jne,sicepat,anteraja,jnt,pos,tiki", selectedRate, onSelect, disabled }: Props) {
 const [rates, setRates] = useState<Phase3B7WRateOption[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState("");
 const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

 const total = useMemo(() => Number(subtotal || 0) + Number(selectedRate?.price || 0), [subtotal, selectedRate?.price]);

 async function loadRates() {
 setLoading(true);
 setError("");
 try {
 const { data, error: fnError } = await supabase.functions.invoke("shipping-rates", {
 body: { destination, items, subtotal, couriers },
 });
 if (fnError) throw fnError;
 if (!data?.success) throw new Error(data?.error || "Gagal menghitung ongkir Biteship.");
 const nextRates = Array.isArray(data.rates) ? data.rates : [];
 setRates(nextRates);
 setLastCheckedAt(new Date().toISOString());
 if (nextRates.length && !selectedRate) onSelect(nextRates[0]);
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 setError(message || "Gagal menghitung ongkir Biteship.");
 } finally {
 setLoading(false);
 }
 }

 return (
 <section className="phase3b7w-rates-checkout" data-phase="3b7w-biteship-rates-checkout">
 <div className="phase3b7w-rates-head">
 <div>
 <strong><Truck size={16} /> Ongkir Aktual Biteship</strong>
 <span>Pilih layanan ekspedisi dari Rates API agar total checkout memakai ongkir aktual.</span>
 </div>
 <button type="button" className="secondary" onClick={loadRates} disabled={loading || disabled}>
 {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Hitung Ongkir
 </button>
 </div>

 {error && <div className="phase3b7w-rates-error">{error}</div>}
 {lastCheckedAt && <small className="phase3b7w-rates-time">Terakhir dihitung: {new Date(lastCheckedAt).toLocaleString("id-ID")}</small>}

 {rates.length > 0 && (
 <div className="phase3b7w-rate-list">
 {rates.map(rate => (
 <button
 type="button"
 key={rate.id}
 className={selectedRate?.id === rate.id ? "active" : ""}
 onClick={() => onSelect(rate)}
 >
 <span>
 <strong>{rateLabel(rate)}</strong>
 <small>{rate.duration || rate.description || "Estimasi mengikuti Biteship"}</small>
 </span>
 <b>{formatCurrency(rate.price)}</b>
 </button>
 ))}
 </div>
 )}

 <div className="phase3b7w-rates-summary">
 <span>Subtotal produk <strong>{formatCurrency(subtotal)}</strong></span>
 <span>Ongkir Biteship <strong>{selectedRate ? formatCurrency(selectedRate.price) : "Belum dipilih"}</strong></span>
 <span className="grand-total">Total bayar <strong>{formatCurrency(total)}</strong></span>
 </div>
 </section>
 );
}
