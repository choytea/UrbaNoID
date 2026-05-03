import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { BuyerCatalogProduct, CatalogVariant, CatalogVideo, Profile, ShippingExpedition, StoreProfile } from "../types";
import { formatCurrency } from "../lib/utils";
import { ProductDetailModal } from "../components/ProductDetailModal";
import { CartDrawer } from "../components/CartDrawer";
import { CheckoutModal } from "../components/CheckoutModal";
import {
  CART_OPEN_EVENT,
  CART_UPDATED_EVENT,
  CartItem,
  addOrMergeCartItem,
  clearCart,
  clearPendingBuyerAction,
  makeCartItem,
  readCart,
  readPendingBuyerAction,
  saveCart,
  savePendingBuyerAction,
} from "../lib/cart";

type Props = {
  session?: Session | null;
  profile?: Profile | null;
};

export function BuyerCatalog({ session = null, profile = null }: Props) {
  const [products, setProducts] = useState<BuyerCatalogProduct[]>([]);
  const [shippingOptions, setShippingOptions] = useState<ShippingExpedition[]>([]);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedShowcase, setSelectedShowcase] = useState("Semua");
  const [selectedProduct, setSelectedProduct] = useState<BuyerCatalogProduct | null>(null);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [error, setError] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>(() => readCart());
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadProducts() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("v_buyer_catalog")
      .select("*")
      .order("product_name", { ascending: true });

    if (error) {
      setError(error.message);
      setProducts([]);
      setLoading(false);
      return;
    }

    const baseProducts = (data || []) as BuyerCatalogProduct[];

    const { data: videos, error: videoError } = await supabase
      .from("product_videos")
      .select("id, product_id, color_id, color_name, video_url, storage_path, title")
      .order("created_at", { ascending: false });

    const videoTableMissing = !!videoError && (
      videoError.code === "42P01" ||
      videoError.message?.includes("product_videos") ||
      videoError.message?.includes("does not exist")
    );

    if (videoError && !videoTableMissing) {
      setError(videoError.message);
      setProducts(baseProducts.map(product => ({ ...product, videos: [] })));
      setLoading(false);
      return;
    }

    const videoList = videoTableMissing ? [] : ((videos || []) as CatalogVideo[]);
    setProducts(baseProducts.map(product => ({ ...product, videos: videoList.filter(video => video.product_id === product.product_id) })));
    setLoading(false);
  }

  async function loadSupportData() {
    const { data: expeditions } = await supabase
      .from("shipping_expeditions")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    const activeExpeditions = (expeditions || []) as ShippingExpedition[];
    setShippingOptions(activeExpeditions);
    if (!selectedShippingId && activeExpeditions[0]) setSelectedShippingId(activeExpeditions[0].id);

    const { data: store } = await supabase
      .from("store_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (store) setStoreProfile(store as StoreProfile);
  }

  useEffect(() => {
    loadProducts();
    loadSupportData();
  }, []);

  useEffect(() => {
    function onCartUpdated(event: Event) {
      const detail = (event as CustomEvent<CartItem[]>).detail;
      setCartItems(Array.isArray(detail) ? detail : readCart());
    }

    function onOpenCart() {
      setCartOpen(true);
    }

    window.addEventListener(CART_UPDATED_EVENT, onCartUpdated as EventListener);
    window.addEventListener(CART_OPEN_EVENT, onOpenCart);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, onCartUpdated as EventListener);
      window.removeEventListener(CART_OPEN_EVENT, onOpenCart);
    };
  }, []);

  useEffect(() => {
    const pending = readPendingBuyerAction();
    if (!session || !pending || products.length === 0) return;

    const product = products.find(item => item.product_id === pending.product_id);
    const variant = product?.variants.find(item => item.variant_id === pending.variant_id);
    const shipping = shippingOptions.find(item => item.id === pending.shipping_expedition_id) || shippingOptions[0] || null;

    if (!product || !variant) return;

    clearPendingBuyerAction();
    if (pending.type === "ADD_TO_CART") {
      addToCart(product, variant, pending.quantity, shipping);
    } else {
      checkoutNow(product, variant, pending.quantity, shipping);
    }
  }, [session, products, shippingOptions]);

  const showcases = useMemo(() => ["Semua", ...Array.from(new Set(products.map(p => p.showcase_name).filter(Boolean))) as string[]], [products]);

  const filtered = products.filter(p => {
    const q = query.trim().toLowerCase();
    const matchQuery = !q || [p.product_name, p.sku_product, p.category_name, p.showcase_name, p.material_name, p.gramasi]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
    const matchShowcase = selectedShowcase === "Semua" || p.showcase_name === selectedShowcase;
    return matchQuery && matchShowcase;
  });

  function requireBuyerRegistration(product: BuyerCatalogProduct, variant: CatalogVariant, quantity: number, actionType: "ADD_TO_CART" | "CHECKOUT_NOW", shipping: ShippingExpedition | null) {
    savePendingBuyerAction({
      type: actionType,
      product_id: product.product_id,
      variant_id: variant.variant_id,
      quantity,
      shipping_expedition_id: shipping?.id || selectedShippingId || null,
      created_at: new Date().toISOString(),
    });

    setSelectedProduct(null);
    setNotice("Silakan registrasi/login buyer terlebih dahulu untuk melanjutkan pesanan.");
    window.location.hash = "/buyer-register";
  }

  function addToCart(product: BuyerCatalogProduct, variant: CatalogVariant, quantity: number, shipping: ShippingExpedition | null) {
    if (!session) {
      requireBuyerRegistration(product, variant, quantity, "ADD_TO_CART", shipping);
      return;
    }
    const item = makeCartItem(product, variant, quantity, shipping);
    const next = addOrMergeCartItem(item, cartItems);
    setCartItems(next);
    setNotice(`${product.product_name} berhasil ditambahkan ke keranjang.`);
    setCartOpen(true);
  }

  function checkoutNow(product: BuyerCatalogProduct, variant: CatalogVariant, quantity: number, shipping: ShippingExpedition | null) {
    if (!session) {
      requireBuyerRegistration(product, variant, quantity, "CHECKOUT_NOW", shipping);
      return;
    }
    const item = makeCartItem(product, variant, quantity, shipping);
    saveCart([item]);
    setCartItems([item]);
    setSelectedProduct(null);
    setCheckoutOpen(true);
  }

  function openProductChat(product: BuyerCatalogProduct, variant: CatalogVariant) {
    setSelectedProduct(null);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("urbanoid-open-store-chat", {
        detail: {
          source: "PRODUCT_DETAIL",
          product_id: product.product_id,
          product_name: product.product_name,
          sku_product: product.sku_product,
          variant_id: variant.variant_id,
          sku_variant: variant.sku_variant,
          color_name: variant.color_name,
          size_name: variant.size_name,
          pattern_type: variant.pattern_type,
          price: Number(variant.final_price || variant.base_price || product.min_price || 0),
          image_url: product.primary_image_url,
        }
      }));
    }, 80);
  }

  function updateCartQuantity(itemId: string, quantity: number) {
    const next = cartItems
      .map(item => {
        if (item.id !== itemId) return item;
        const maxStock = Math.max(1, Number(item.stock_qty || 1));
        return { ...item, quantity: Math.max(1, Math.min(Number(quantity || 1), maxStock)) };
      })
      .filter(item => item.quantity > 0);
    saveCart(next);
    setCartItems(next);
  }

  function removeCartItem(itemId: string) {
    const next = cartItems.filter(item => item.id !== itemId);
    saveCart(next);
    setCartItems(next);
  }

  function emptyCart() {
    clearCart();
    setCartItems([]);
  }

  function checkoutFromCart() {
    if (!session) {
      setCartOpen(false);
      window.location.hash = "/buyer-register";
      return;
    }
    setCartOpen(false);
    setCheckoutOpen(true);
  }

  function openCartChat(item?: CartItem | null) {
    setCartOpen(false);

    if (!session) {
      window.location.hash = "/buyer-register";
      return;
    }

    if (!item) {
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("urbanoid-open-store-chat", {
        detail: { source: "CART_DRAWER" }
      })), 80);
      return;
    }

    window.setTimeout(() => window.dispatchEvent(new CustomEvent("urbanoid-open-store-chat", {
      detail: {
        source: "CART_DRAWER",
        product_id: item.product_id,
        product_name: item.product_name,
        sku_product: item.sku_product,
        variant_id: item.variant_id,
        sku_variant: item.sku_variant,
        color_name: item.color_name,
        size_name: item.size_name,
        pattern_type: item.pattern_type,
        price: item.unit_price,
        image_url: item.image_url,
      }
    })), 80);
  }

  function checkoutSuccess() {
    emptyCart();
    setNotice("Checkout berhasil. Pesanan sudah masuk ke seller.");
    void loadProducts();
  }

  return (
    <>
      <section className="hero compact buyer-hero-polished">
        <h1>{storeProfile?.tagline || "Lebih dari sekadar kaos. Ini adalah cara kamu bergerak dengan identitasmu."}</h1>
        <div className="search-row">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari produk, bahan, gramasi, model, warna, kategori..." />
          <button className="btn-primary">Cari Produk</button>
        </div>
        <div className="chips">
          <span>✓ Ready stock</span>
          <span>✓ Bahan premium</span>
          <span>✓ Bisa custom</span>
          <span>✓ Pengiriman Indonesia</span>
        </div>
      </section>

      <section className="filter-panel buyer-filter-polished">
        <div>
          <h2>Filter Produk</h2>
          <p>Saring katalog agar pembeli lebih cepat menemukan produk.</p>
        </div>
        <select value={selectedShowcase} onChange={e => setSelectedShowcase(e.target.value)}>
          {showcases.map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => { loadProducts(); loadSupportData(); }}>Refresh Katalog</button>
      </section>

      {notice && <div className="success-box buyer-notice">{notice}</div>}

      <section>
        <div className="section-title buyer-catalog-title">
          <div>
            <h2>Katalog Produk</h2>
            <p>{loading ? "Memuat produk..." : `${filtered.length} dari ${products.length} produk tampil`}</p>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="product-grid buyer-product-grid">
          {filtered.map(product => (
            <article className="product-card buyer-product-card" key={product.product_id}>
              <button className="card-image" onClick={() => setSelectedProduct(product)}>
                <img src={product.primary_image_url || "https://placehold.co/900x1200/111827/ffffff?text=UrbaNoiD"} alt={product.product_name} />
                <div className="card-badges">
                  <span>{product.category_name || "Produk"}</span>
                  <span>{product.total_stock > 0 ? "Ready Stock" : "Stok Habis"}</span>
                </div>
              </button>
              <div className="card-content">
                <h3>{product.product_name}</h3>
                <p>{product.material_name} · {product.gramasi}</p>
                <strong>{formatCurrency(product.min_price || 0)}</strong>
                <div className="mini-specs">
                  <span>{product.total_variants} varian</span>
                  <span>Stok {product.total_stock}</span>
                </div>
                <button className="btn-secondary full" onClick={() => setSelectedProduct(product)}>Lihat Detail</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
          onCheckoutNow={checkoutNow}
          onOpenStoreChat={openProductChat}
          shippingOptions={shippingOptions}
          selectedShippingId={selectedShippingId}
          onShippingChange={setSelectedShippingId}
        />
      )}

      <CartDrawer
        open={cartOpen}
        items={cartItems}
        onClose={() => setCartOpen(false)}
        onUpdateQuantity={updateCartQuantity}
        onRemove={removeCartItem}
        onClear={emptyCart}
        onCheckout={checkoutFromCart}
        onOpenStoreChat={openCartChat}
      />

      <CheckoutModal
        open={checkoutOpen}
        items={cartItems}
        session={session}
        profile={profile}
        shippingOptions={shippingOptions}
        selectedShippingId={selectedShippingId}
        onShippingChange={setSelectedShippingId}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={checkoutSuccess}
      />
    </>
  );
}
