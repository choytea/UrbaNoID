import { BuyerCatalogProduct, CatalogVariant, ShippingExpedition } from "../types";

export const CART_STORAGE_KEY = "urbanoid_cart_v1";
export const CART_UPDATED_EVENT = "urbanoid-cart-updated";
export const CART_OPEN_EVENT = "urbanoid-cart-open";
export const PENDING_BUYER_ACTION_KEY = "urbanoid_pending_buyer_action_v1";

export type PendingBuyerAction = {
  type: "ADD_TO_CART" | "CHECKOUT_NOW";
  product_id: string;
  variant_id: string;
  quantity: number;
  shipping_expedition_id?: string | null;
  created_at: string;
};

export type CartItem = {
  id: string;
  product_id: string;
  product_name: string;
  sku_product: string;
  variant_id: string;
  sku_variant: string;
  color_name: string | null;
  size_name: string | null;
  pattern_type: string | null;
  quantity: number;
  unit_price: number;
  weight_gram: number;
  image_url: string | null;
  stock_qty: number;
  shipping_expedition_id?: string | null;
  shipping_name?: string | null;
  shipping_service?: string | null;
  shipping_cost?: number;
};

export function makeCartItem(
  product: BuyerCatalogProduct,
  variant: CatalogVariant,
  quantity: number,
  shipping?: ShippingExpedition | null
): CartItem {
  return {
    id: `${product.product_id}:${variant.variant_id}`,
    product_id: product.product_id,
    product_name: product.product_name,
    sku_product: product.sku_product,
    variant_id: variant.variant_id,
    sku_variant: variant.sku_variant,
    color_name: variant.color_name,
    size_name: variant.size_name,
    pattern_type: variant.pattern_type,
    quantity: Math.max(1, Math.min(Number(quantity || 1), Number(variant.stock_qty || 1))),
    unit_price: Number(variant.final_price || variant.base_price || product.min_price || 0),
    weight_gram: Number(variant.weight_gram || 0),
    image_url: product.primary_image_url,
    stock_qty: Number(variant.stock_qty || 0),
    shipping_expedition_id: shipping?.id || null,
    shipping_name: shipping?.name || null,
    shipping_service: shipping?.service_name || null,
    shipping_cost: Number(shipping?.base_cost || 0),
  };
}

export function readCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && item.variant_id && Number(item.quantity || 0) > 0)
      .map(item => ({
        ...item,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        weight_gram: Number(item.weight_gram || 0),
        stock_qty: Number(item.stock_qty || 0),
        shipping_cost: Number(item.shipping_cost || 0),
      }));
  } catch {
    return [];
  }
}

export function saveCart(items: CartItem[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: items }));
}

export function clearCart() {
  saveCart([]);
}

export function cartCount(items = readCart()) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function cartSubtotal(items = readCart()) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
}

export function cartWeight(items = readCart()) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.weight_gram || 0), 0);
}

export function cartShippingCost(items = readCart()) {
  return Number(items.find(item => item.shipping_expedition_id)?.shipping_cost || 0);
}

export function addOrMergeCartItem(newItem: CartItem, current = readCart()) {
  const next = [...current];
  const index = next.findIndex(item => item.id === newItem.id);

  if (index >= 0) {
    const existing = next[index];
    const maxStock = Math.max(1, Number(newItem.stock_qty || existing.stock_qty || 1));
    next[index] = {
      ...existing,
      ...newItem,
      quantity: Math.min(Number(existing.quantity || 0) + Number(newItem.quantity || 1), maxStock),
    };
  } else {
    next.push(newItem);
  }

  saveCart(next);
  return next;
}

export function requestOpenCart() {
  window.dispatchEvent(new CustomEvent(CART_OPEN_EVENT));
}

export function savePendingBuyerAction(action: PendingBuyerAction) {
  localStorage.setItem(PENDING_BUYER_ACTION_KEY, JSON.stringify(action));
}

export function readPendingBuyerAction(): PendingBuyerAction | null {
  try {
    const raw = localStorage.getItem(PENDING_BUYER_ACTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.type || !parsed?.product_id || !parsed?.variant_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBuyerAction() {
  localStorage.removeItem(PENDING_BUYER_ACTION_KEY);
}
