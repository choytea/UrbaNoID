import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { CartItem, cartShippingCost, cartSubtotal, cartWeight } from "../lib/cart";
import { formatCurrency } from "../lib/utils";
import { Profile, ShippingExpedition } from "../types";


type BuyerCheckoutAddress = {
  id: string;
  buyer_id: string;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  address_line: string;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  notes: string | null;
  is_main: boolean;
  is_active: boolean;
};
// PHASE_3B_8_R3_EXPEDITION_SOURCE_NORMALIZATION_HELPER
function phase3B8R3HasBiteshipSelectedRate(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;

  const readNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return 0;
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const rateKeys = [
    "phase3b7w_selected_rate",
    "phase3b7wSelectedRate",
    "phase3b7w_checkout_selected_rate",
    "phase3b8r3_selected_rate",
    "urbanoid_selected_biteship_rate",
    "selectedBiteshipRate"
  ];

  for (const key of rateKeys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const price = readNumber(parsed?.price ?? parsed?.cost ?? parsed?.shipping_cost ?? parsed?.shippingCost ?? parsed?.rate ?? parsed?.value);
      const company = String(parsed?.courier_company ?? parsed?.company ?? parsed?.courier ?? "").trim();
      const type = String(parsed?.courier_type ?? parsed?.type ?? parsed?.service ?? parsed?.service_name ?? "").trim();
      if (price > 0 && (company || type)) return true;
    } catch {
      // ignore invalid localStorage value
    }
  }

  const selectedOption = Array.from(document.querySelectorAll("select option:checked"))
    .map((option) => (option.textContent || "").trim())
    .find((text) => /Rp\s*[0-9.]+/i.test(text) && /\//.test(text));
  if (selectedOption) return true;

  const selectedSelect = Array.from(document.querySelectorAll("select"))
    .find((select) => {
      const element = select as HTMLSelectElement;
      const value = String(element.value || "").trim();
      const text = String(element.selectedOptions?.[0]?.textContent || "").trim();
      return /Rp\s*[0-9.]+/i.test(text) && (value.length > 0 || /\//.test(text));
    });
  return Boolean(selectedSelect);
}


type Props = {
  open: boolean;
  items: CartItem[];
  session: Session | null;
  profile: Profile | null;
  shippingOptions: ShippingExpedition[];
  selectedShippingId: string;
  onShippingChange: (shippingId: string) => void;
  onClose: () => void;
  onSuccess: () => void;
};

type CheckoutResult = {
  order_id?: string;
  order_number?: string;
  grand_total?: number;
};

export function CheckoutModal({
  open,
  items,
  session,
  profile,
  shippingOptions,
  selectedShippingId,
  onShippingChange,
  onClose,
  onSuccess
}: Props) {
  const [customerName, setCustomerName] = useState(profile?.full_name || profile?.username || "");
  const [customerEmail, setCustomerEmail] = useState(profile?.email || session?.user.email || "");
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address_line || "");
  const [district, setDistrict] = useState(profile?.district || "");
  const [city, setCity] = useState(profile?.city || "");
  const [province, setProvince] = useState(profile?.province || "");
  const [postalCode, setPostalCode] = useState(profile?.postal_code || "");
  const [buyerAddresses, setBuyerAddresses] = useState<BuyerCheckoutAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLoading, setAddressLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const selectedShipping = shippingOptions.find(item => item.id === selectedShippingId) || null;
  const subtotal = useMemo(() => cartSubtotal(items), [items]);
  const weight = useMemo(() => cartWeight(items), [items]);
  const shippingCost = selectedShipping ? Number(selectedShipping.base_cost || 0) : cartShippingCost(items);
  const grandTotal = subtotal + Number(shippingCost || 0);

  useEffect(() => {
    if (!selectedShippingId && items[0]?.shipping_expedition_id) {
      onShippingChange(items[0].shipping_expedition_id);
    }
  }, [items, selectedShippingId, onShippingChange]);

  useEffect(() => {
    setCustomerName(profile?.full_name || profile?.username || "");
    setCustomerEmail(profile?.email || session?.user.email || "");
    setCustomerPhone(profile?.phone || "");
    setAddress(profile?.address_line || "");
    setDistrict(profile?.district || "");
    setCity(profile?.city || "");
    setProvince(profile?.province || "");
    setPostalCode(profile?.postal_code || "");
  }, [profile, session]);

  function applyBuyerCheckoutAddress(row: BuyerCheckoutAddress) {
    setCustomerName(row.recipient_name || profile?.full_name || profile?.username || "");
    setCustomerPhone(row.phone || profile?.phone || "");
    setAddress(row.address_line || "");
    setDistrict(row.district || "");
    setCity(row.city || "");
    setProvince(row.province || "");
    setPostalCode(row.postal_code || "");

    // Phase 3B.9A4-R2:
    // Setelah alamat buyer berubah, minta bridge ongkir menghitung ulang Rates API
    // berdasarkan kota/kode pos/alamat tujuan terbaru.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("urbanoid-checkout-address-changed", {
        detail: {
          address_id: row.id,
          city: row.city || "",
          province: row.province || "",
          postal_code: row.postal_code || "",
        },
      }));
    }, 120);
  }

  useEffect(() => {
    if (!open || !session?.user?.id) return;

    let cancelled = false;

    async function loadBuyerCheckoutAddresses() {
      setAddressLoading(true);

      const { data, error } = await supabase
        .from("buyer_addresses")
        .select("*")
        .eq("buyer_id", session!.user.id)
        .eq("is_active", true)
        .order("is_main", { ascending: false })
        .order("created_at", { ascending: true });

      if (cancelled) return;

      setAddressLoading(false);

      if (error) {
        console.warn("Gagal memuat alamat buyer untuk checkout:", error.message);
        setBuyerAddresses([]);
        setSelectedAddressId("");
        return;
      }

      const list = (data || []) as BuyerCheckoutAddress[];
      setBuyerAddresses(list);

      const defaultAddress = list.find(item => item.is_main) || list[0] || null;

      if (defaultAddress) {
        setSelectedAddressId(defaultAddress.id);
        applyBuyerCheckoutAddress(defaultAddress);
      } else {
        setSelectedAddressId("");
      }
    }

    loadBuyerCheckoutAddresses();

    return () => {
      cancelled = true;
    };
  }, [open, session?.user?.id]);

  if (!open) return null;

  function openRegister() {
    onClose();
    window.location.hash = "/buyer-register";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!session) {
      setMessage("Silakan registrasi/login buyer terlebih dahulu sebelum checkout.");
      return;
    }

    if (!items.length) {
      setMessage("Keranjang masih kosong.");
      return;
    }

    if ((!phase3B8R3HasBiteshipSelectedRate()) && (shippingOptions.length > 0 && !selectedShipping)) {
      setMessage("Pilih ekspedisi pengiriman terlebih dahulu.");
      return;
    }

    if (!customerName.trim() || !customerEmail.trim() || !customerPhone.trim() || !address.trim() || !city.trim() || !province.trim()) {
      setMessage("Lengkapi nama, email, nomor kontak, alamat, kota, dan provinsi.");
      return;
    }

    setSaving(true);
    setMessage("");
    setResult(null);

    const payloadItems = items.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      sku_product: item.sku_product,
      variant_id: item.variant_id,
      sku_variant: item.sku_variant,
      color_name: item.color_name,
      size_name: item.size_name,
      pattern_type: item.pattern_type,
      quantity: item.quantity,
      unit_price: item.unit_price,
      weight_gram: item.weight_gram,
      package_length_cm: item.package_length_cm || null,
      package_width_cm: item.package_width_cm || null,
      package_height_cm: item.package_height_cm || null,
      image_url: item.image_url,
    }));

    const { data, error } = await supabase.rpc("buyer_checkout", {
      p_customer: { name: customerName, email: customerEmail, phone: customerPhone },
      p_items: payloadItems,
      p_notes: notes,
      p_payment_method: paymentMethod,
      p_shipping: {
        expedition_id: selectedShipping?.id || items[0]?.shipping_expedition_id || null,
        expedition_name: selectedShipping?.name || items[0]?.shipping_name || null,
        service_name: selectedShipping?.service_name || items[0]?.shipping_service || null,
        courier_code: selectedShipping?.courier_code || null,
        address,
        district,
        city,
        province,
        postal_code: postalCode,
        shipping_cost: Number(shippingCost || 0),
      },
    });

    if (error) {
      setMessage(
        error.message.includes("function buyer_checkout")
          ? "Fungsi checkout belum sinkron. Jalankan SQL 18_phase3b_3_checkout_rpc_store_chat_context.sql di Supabase SQL Editor, lalu refresh aplikasi."
          : error.message
      );
      setSaving(false);
      return;
    }

    const checkoutResult = (data || {}) as CheckoutResult;
    setResult(checkoutResult);
    setMessage("Checkout berhasil. Pesanan sudah masuk ke dashboard seller.");
    setSaving(false);
    onSuccess();
  }

  return (
    <div className="checkout-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="checkout-modal" onMouseDown={event => event.stopPropagation()}>
        <div className="checkout-head">
          <div>
            <h2>Checkout Pesanan</h2>
            <p>{items.length} item  -  {weight} gram  -  Total {formatCurrency(grandTotal)}</p>
          </div>
          <button onClick={onClose}> x </button>
        </div>

        {!session ? (
          <div className="checkout-login-required">
            <h3>Registrasi Buyer Diperlukan</h3>
            <p>Untuk menjaga data pesanan, checkout hanya bisa dilakukan setelah buyer register dan login.</p>
            <button className="btn-primary" onClick={openRegister}>Registrasi / Login Buyer</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="checkout-grid">

          {buyerAddresses.length > 0 && (
            <label className="checkout-full phase3b9a4-address-select">
              Pilih Alamat Pengiriman
              <select
                data-phase3b9a4-address-select="true"
                value={selectedAddressId}
                onChange={event => {
                  const nextId = event.target.value;
                  setSelectedAddressId(nextId);

                  const selected = buyerAddresses.find(item => item.id === nextId);
                  if (selected) applyBuyerCheckoutAddress(selected);
                }}
                disabled={addressLoading}
              >
                {buyerAddresses.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.is_main ? "Utama - " : ""}{item.label}  -  {item.city || "-"} {item.postal_code ? ` -  ${item.postal_code}` : ""}
                  </option>
                ))}
              </select>
              <small>
                Alamat utama otomatis dipilih. Field di bawah tetap dapat diedit sebelum checkout.
              </small>
            </label>
          )}
              <label>Nama Penerima<input value={customerName} onChange={e => setCustomerName(e.target.value)} required /></label>
              <label>Email<input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} type="email" required /></label>
              <label>Nomor Kontak<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required /></label>
              <label>
                Metode Pembayaran
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="QRIS">QRIS</option>
                  <option value="COD">COD / Bayar di Tempat</option>
                </select>
              </label>
              <label className="checkout-full">
                Ekspedisi Pengiriman
                <select value={selectedShippingId} onChange={e => onShippingChange(e.target.value)} required={shippingOptions.length > 0}>
                  <option value="">{shippingOptions.length ? "- Pilih Ekspedisi -" : "Ekspedisi belum tersedia"}</option>
                  {shippingOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.name}{option.service_name ? ` / ${option.service_name}` : ""} - {formatCurrency(option.base_cost || 0)} {option.etd_text ? `(${option.etd_text})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkout-full">Alamat Lengkap<textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} required /></label>
              <label>Kecamatan<input value={district} onChange={e => setDistrict(e.target.value)} /></label>
              <label>Kota/Kabupaten<input value={city} onChange={e => setCity(e.target.value)} required /></label>
              <label>Provinsi<input value={province} onChange={e => setProvince(e.target.value)} required /></label>
              <label>Kode Pos<input value={postalCode} onChange={e => setPostalCode(e.target.value)} /></label>
              <label className="checkout-full">Catatan<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan ukuran, warna, atau pengiriman..." /></label>
            </div>

            <div className="checkout-order-preview">
              <h3>Ringkasan Pesanan</h3>
              {items.map(item => (
                <div key={item.id}>
                  <span>{item.product_name}  -  {item.color_name} / {item.size_name} / {item.pattern_type}  x  {item.quantity}</span>
                  <strong>{formatCurrency(item.quantity * item.unit_price)}</strong>
                </div>
              ))}
              <hr />
              <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
              <div><span>Ekspedisi</span><strong>{selectedShipping?.name || items[0]?.shipping_name || "-"}</strong></div>
              <div><span>Ongkir</span><strong>{formatCurrency(Number(shippingCost || 0))}</strong></div>
              <div className="grand-total"><span>Total</span><strong>{formatCurrency(grandTotal)}</strong></div>
            </div>

            {message && <div className={result ? "success-box" : "error-box"}>{message}</div>}
            {result?.order_number && (
              <div className="order-success-card">
                <span>Nomor Pesanan</span>
                <strong>{result.order_number}</strong>
              </div>
            )}

            <div className="checkout-actions">
              <button type="button" onClick={onClose}>Tutup</button>
              <button className="btn-primary" type="submit" disabled={saving || !!result}>
                {saving ? "Memproses..." : result ? "Pesanan Tersimpan" : "Buat Pesanan"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}


// PHASE_3B_8_R3_CHECKOUT_VALIDATION_NORMALIZED



