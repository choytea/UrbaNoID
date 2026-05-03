import { MessageCircle, Trash2, X } from "lucide-react";
import { CartItem, cartShippingCost, cartSubtotal, cartWeight } from "../lib/cart";
import { formatCurrency } from "../lib/utils";

type Props = {
  open: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  onOpenStoreChat?: (item?: CartItem | null) => void;
};

export function CartDrawer({ open, items, onClose, onUpdateQuantity, onRemove, onClear, onCheckout, onOpenStoreChat }: Props) {
  if (!open) return null;

  const subtotal = cartSubtotal(items);
  const weight = cartWeight(items);
  const shippingCost = cartShippingCost(items);
  const grandTotal = subtotal + shippingCost;
  const shippingLabel = items.find(item => item.shipping_name)?.shipping_name;
  const firstItem = items[0] || null;

  return (
    <div className="cart-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="cart-drawer phase-3b-4-cart-drawer" onMouseDown={event => event.stopPropagation()}>
        <div className="cart-head">
          <div>
            <h2>Keranjang Belanja</h2>
            <p>{items.length} item · estimasi berat {weight} gram</p>
          </div>
          <button className="cart-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <strong>Keranjang masih kosong.</strong>
            <span>Pilih produk dari katalog, pilih ekspedisi, lalu klik Tambah ke Keranjang.</span>
            <button className="btn-secondary cart-chat-btn" onClick={() => onOpenStoreChat?.(null)}>
              <MessageCircle size={16} /> Chat Toko
            </button>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {items.map(item => (
                <div className="cart-item" key={item.id}>
                  <img src={item.image_url || "https://placehold.co/200x260/111827/ffffff?text=UO"} alt={item.product_name} />
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>{item.color_name || "-"} / {item.size_name || "-"} / {item.pattern_type || "-"}</span>
                    <span>Ekspedisi: {item.shipping_name || "-"} {item.shipping_service ? `/ ${item.shipping_service}` : ""}</span>
                    <em>{formatCurrency(item.unit_price)}</em>
                    <div className="cart-qty-row">
                      <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1}>−</button>
                      <input value={item.quantity} onChange={event => onUpdateQuantity(item.id, Number(event.target.value))} type="number" min={1} max={item.stock_qty || 999} />
                      <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} disabled={item.stock_qty ? item.quantity >= item.stock_qty : false}>+</button>
                      <button className="cart-remove" onClick={() => onRemove(item.id)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-secondary cart-chat-btn" onClick={() => onOpenStoreChat?.(firstItem)}>
              <MessageCircle size={16} /> Chat Toko tentang Keranjang
            </button>

            <div className="cart-summary">
              <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
              <div><span>Ekspedisi</span><strong>{shippingLabel || "-"}</strong></div>
              <div><span>Ongkir</span><strong>{formatCurrency(shippingCost)}</strong></div>
              <div><span>Berat</span><strong>{weight} gram</strong></div>
              <div><span>Total</span><strong>{formatCurrency(grandTotal)}</strong></div>
              <small>Ongkir fase ini memakai tarif dasar ekspedisi yang dikelola seller.</small>
            </div>

            <div className="cart-actions">
              <button onClick={onClear}>Kosongkan</button>
              <button className="btn-primary" onClick={onCheckout}>Checkout</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
