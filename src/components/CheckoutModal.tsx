import { useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { CartItem, cartSubtotal, cartWeight } from "../lib/cart";
import { formatCurrency } from "../lib/utils";
import { Profile } from "../types";

type Props = {
  open: boolean;
  items: CartItem[];
  session: Session | null;
  profile: Profile | null;
  onClose: () => void;
  onSuccess: () => void;
};

type CheckoutResult = {
  order_id?: string;
  order_number?: string;
  grand_total?: number;
};

export function CheckoutModal({ open, items, session, profile, onClose, onSuccess }: Props) {
  const [customerName, setCustomerName] = useState(profile?.full_name || profile?.username || "");
  const [customerEmail, setCustomerEmail] = useState(profile?.email || session?.user.email || "");
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address_line || "");
  const [district, setDistrict] = useState(profile?.district || "");
  const [city, setCity] = useState(profile?.city || "");
  const [province, setProvince] = useState(profile?.province || "");
  const [postalCode, setPostalCode] = useState(profile?.postal_code || "");
  const [paymentMethod, setPaymentMethod] = useState("BANK_TRANSFER");
  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const subtotal = useMemo(() => cartSubtotal(items), [items]);
  const weight = useMemo(() => cartWeight(items), [items]);
  const grandTotal = subtotal + Number(shippingCost || 0);

  if (!open) return null;

  function openLogin() {
    onClose();
    window.location.hash = "/login";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!session) {
      setMessage("Silakan login/register sebagai buyer terlebih dahulu sebelum checkout.");
      return;
    }

    if (!items.length) {
      setMessage("Keranjang masih kosong.");
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
      image_url: item.image_url,
    }));

    const { data, error } = await supabase.rpc("buyer_checkout", {
      p_customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
      },
      p_shipping: {
        address,
        district,
        city,
        province,
        postal_code: postalCode,
        shipping_cost: Number(shippingCost || 0),
      },
      p_items: payloadItems,
      p_payment_method: paymentMethod,
      p_notes: notes,
    });

    if (error) {
      setMessage(
        error.message.includes("function buyer_checkout")
          ? "Fungsi checkout belum aktif. Jalankan SQL Phase 3A di Supabase SQL Editor."
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
            <p>{items.length} item · {weight} gram · Total {formatCurrency(grandTotal)}</p>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        {!session ? (
          <div className="checkout-login-required">
            <h3>Login diperlukan</h3>
            <p>Checkout hanya bisa dilakukan setelah pembeli login/register. Keranjang tetap tersimpan di browser ini.</p>
            <button className="btn-primary" onClick={openLogin}>Login / Register</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="checkout-grid">
              <label>
                Nama Penerima
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
              </label>
              <label>
                Email
                <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} type="email" required />
              </label>
              <label>
                Nomor Kontak
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required />
              </label>
              <label>
                Metode Pembayaran
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="QRIS">QRIS</option>
                  <option value="COD">COD / Bayar di Tempat</option>
                </select>
              </label>
              <label className="checkout-full">
                Alamat Lengkap
                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3} required />
              </label>
              <label>
                Kecamatan
                <input value={district} onChange={e => setDistrict(e.target.value)} />
              </label>
              <label>
                Kota/Kabupaten
                <input value={city} onChange={e => setCity(e.target.value)} required />
              </label>
              <label>
                Provinsi
                <input value={province} onChange={e => setProvince(e.target.value)} required />
              </label>
              <label>
                Kode Pos
                <input value={postalCode} onChange={e => setPostalCode(e.target.value)} />
              </label>
              <label>
                Ongkir / Estimasi
                <input value={shippingCost} onChange={e => setShippingCost(Number(e.target.value || 0))} type="number" min={0} />
              </label>
              <label className="checkout-full">
                Catatan
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan ukuran, warna, atau pengiriman..." />
              </label>
            </div>

            <div className="checkout-order-preview">
              <h3>Ringkasan Pesanan</h3>
              {items.map(item => (
                <div key={item.id}>
                  <span>{item.product_name} · {item.color_name} / {item.size_name} / {item.pattern_type} × {item.quantity}</span>
                  <strong>{formatCurrency(item.quantity * item.unit_price)}</strong>
                </div>
              ))}
              <hr />
              <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
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
