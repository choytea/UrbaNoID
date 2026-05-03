import { useMemo, useState } from "react";
import { BuyerCatalogProduct, CatalogImage, CatalogVariant, CatalogVideo, ShippingExpedition } from "../types";
import { formatCurrency } from "../lib/utils";

type Props = {
  product: BuyerCatalogProduct;
  onClose: () => void;
  onAddToCart?: (product: BuyerCatalogProduct, variant: CatalogVariant, quantity: number, shipping: ShippingExpedition | null) => void;
  onCheckoutNow?: (product: BuyerCatalogProduct, variant: CatalogVariant, quantity: number, shipping: ShippingExpedition | null) => void;
  shippingOptions?: ShippingExpedition[];
  selectedShippingId?: string;
  onShippingChange?: (shippingId: string) => void;
};

type GalleryImage = CatalogImage & { color_name?: string };
type GalleryMedia = {
  type: "image" | "video";
  key: string;
  url: string;
  color_name: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
};

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function descriptionFrameHtml(description: string) {
  const safe = escapeHtml(description);
  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;min-width:100%;min-height:100%;background:#f8fafc;color:#475569;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12.5px;font-weight:700;line-height:1.5;overflow:auto}.wrap{min-width:520px;padding:10px 12px;white-space:pre-wrap}
</style></head><body><div class="wrap">${safe}</div></body></html>`;
}

function uniqueGalleryImages(images: GalleryImage[], fallbackUrl: string | null, fallbackAlt: string) {
  const seen = new Set<string>();
  const result: GalleryImage[] = [];
  images.forEach((img, index) => {
    const key = img.image_url || img.image_id || String(index);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(img);
  });
  if (!result.length && fallbackUrl) {
    result.push({
      image_id: "fallback",
      variant_id: null,
      color_id: null,
      image_url: fallbackUrl,
      sort_order: 1,
      is_primary: true,
      alt_text: fallbackAlt,
    });
  }
  return result;
}

export function ProductDetailModal({
  product,
  onClose,
  onAddToCart,
  onCheckoutNow,
  shippingOptions = [],
  selectedShippingId = "",
  onShippingChange,
}: Props) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const rawImages = Array.isArray(product.images) ? product.images : [];
  const rawVideos = Array.isArray(product.videos) ? product.videos : [];
  const [quantity, setQuantity] = useState(1);
  const [localMessage, setLocalMessage] = useState("");

  const variantColors = variants.map(v => v.color_name).filter(Boolean) as string[];
  const videoColors = rawVideos.map(v => v.color_name).filter(Boolean) as string[];
  const colors = useMemo(() => Array.from(new Set([...variantColors, ...videoColors])) as string[], [variants, rawVideos]);

  function colorFromImage(img: CatalogImage): string {
    const byVariant = variants.find(v => v.variant_id === img.variant_id);
    if (byVariant?.color_name) return byVariant.color_name;
    const byColorId = variants.find(v => (v as any).color_id && (v as any).color_id === img.color_id);
    if (byColorId?.color_name) return byColorId.color_name;
    const alt = normalizeText(img.alt_text);
    return colors.find(color => alt.includes(normalizeText(color))) || "";
  }

  function colorFromVideo(video: CatalogVideo): string {
    if (video.color_name) return video.color_name;
    const byColorId = variants.find(v => (v as any).color_id && (v as any).color_id === video.color_id);
    if (byColorId?.color_name) return byColorId.color_name;
    const title = normalizeText(video.title);
    return colors.find(color => title.includes(normalizeText(color))) || "";
  }

  const galleryMedia = useMemo<GalleryMedia[]>(() => {
    const enrichedImages = rawImages
      .map(img => ({ ...img, color_name: colorFromImage(img) }))
      .sort((a, b) => {
        if (a.is_primary && !b.is_primary) return -1;
        if (!a.is_primary && b.is_primary) return 1;
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });

    const imageItems: GalleryMedia[] = uniqueGalleryImages(enrichedImages, product.primary_image_url, product.product_name).map((img, index) => ({
      type: "image",
      key: img.image_id || img.image_url || `image-${index}`,
      url: img.image_url,
      color_name: img.color_name || "",
      alt_text: img.alt_text || product.product_name,
      sort_order: Number(img.sort_order || index + 1),
      is_primary: !!img.is_primary,
    }));

    const videoItems: GalleryMedia[] = rawVideos
      .filter(video => !!video.video_url)
      .map((video, index) => ({
        type: "video",
        key: video.id || video.video_url || `video-${index}`,
        url: video.video_url,
        color_name: colorFromVideo(video),
        alt_text: video.title || `${product.product_name} video`,
        sort_order: 900 + index,
        is_primary: false,
      }));

    return [...imageItems, ...videoItems];
  }, [rawImages, rawVideos, product.primary_image_url, product.product_name, variants, colors]);

  const initialColor = galleryMedia[0]?.color_name || variants[0]?.color_name || colors[0] || "";
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(() => {
    const firstByColor = variants.find(v => (v.color_name || "") === initialColor);
    return firstByColor?.variant_id || variants[0]?.variant_id || "";
  });
  const [mediaIndex, setMediaIndex] = useState(0);

  const filteredByColor = variants.filter(v => (v.color_name || "") === selectedColor);
  const variantOptions = filteredByColor.length ? filteredByColor : variants;
  const activeVariant: CatalogVariant | undefined =
    variants.find(v => v.variant_id === selectedVariantId) ||
    variantOptions[0] ||
    variants[0];

  const currentMedia = galleryMedia[Math.min(mediaIndex, Math.max(galleryMedia.length - 1, 0))];
  const maxQuantity = Math.max(1, Number(activeVariant?.stock_qty || 0));
  const canBuy = !!activeVariant && Number(activeVariant.stock_qty || 0) > 0;
  const selectedShipping = shippingOptions.find(item => item.id === selectedShippingId) || null;

  function chooseMedia(index: number) {
    setMediaIndex(index);
    const nextColor = galleryMedia[index]?.color_name;
    if (!nextColor || nextColor === selectedColor) return;
    setSelectedColor(nextColor);
    const first = variants.find(v => v.color_name === nextColor);
    if (first) setSelectedVariantId(first.variant_id);
  }

  function moveMedia(direction: number) {
    if (!galleryMedia.length) return;
    chooseMedia((mediaIndex + direction + galleryMedia.length) % galleryMedia.length);
  }

  function chooseColor(color: string) {
    setSelectedColor(color);
    const first = variants.find(v => v.color_name === color);
    setSelectedVariantId(first?.variant_id || "");
    const firstMediaIndex = galleryMedia.findIndex(media => media.color_name === color);
    if (firstMediaIndex >= 0) setMediaIndex(firstMediaIndex);
    setQuantity(1);
    setLocalMessage("");
  }

  function changeVariant(variantId: string) {
    setSelectedVariantId(variantId);
    const variant = variants.find(v => v.variant_id === variantId);
    if (variant?.color_name && variant.color_name !== selectedColor) chooseColor(variant.color_name);
    setQuantity(1);
    setLocalMessage("");
  }

  function updateQuantity(value: number) {
    setQuantity(Math.max(1, Math.min(Number(value || 1), maxQuantity)));
  }

  function validateShipping() {
    if (shippingOptions.length > 0 && !selectedShipping) {
      setLocalMessage("Pilih ekspedisi pengiriman terlebih dahulu.");
      return false;
    }
    return true;
  }

  function addToCart() {
    if (!activeVariant || !canBuy) {
      setLocalMessage("Varian ini sedang kosong.");
      return;
    }
    if (!validateShipping()) return;
    onAddToCart?.(product, activeVariant, quantity, selectedShipping);
    setLocalMessage("Produk berhasil masuk keranjang.");
  }

  function checkoutNow() {
    if (!activeVariant || !canBuy) {
      setLocalMessage("Varian ini sedang kosong.");
      return;
    }
    if (!validateShipping()) return;
    onCheckoutNow?.(product, activeVariant, quantity, selectedShipping);
  }

  const descriptionSrcDoc = product.description ? descriptionFrameHtml(product.description) : "";

  return (
    <div className="modal-backdrop buyer-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="product-modal buyer-product-modal" onClick={event => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <section className="modal-gallery buyer-modal-gallery">
          {currentMedia?.type === "video" ? (
            <video className="buyer-main-video" src={currentMedia.url} controls playsInline preload="metadata" />
          ) : (
            <img src={currentMedia?.url || product.primary_image_url || ""} alt={currentMedia?.alt_text || product.product_name} />
          )}

          {galleryMedia.length > 1 && (
            <>
              <button className="gallery-arrow left" onClick={() => moveMedia(-1)}>‹</button>
              <button className="gallery-arrow right" onClick={() => moveMedia(1)}>›</button>
            </>
          )}

          <div className="thumb-row">
            {galleryMedia.map((media, idx) => (
              <button key={`${media.key}-${idx}`} className={idx === mediaIndex ? "thumb active" : "thumb"} onClick={() => chooseMedia(idx)}>
                {media.type === "video" ? (
                  <span className="video-thumb">
                    <video src={media.url} muted preload="metadata" />
                    <span>▶</span>
                  </span>
                ) : (
                  <img src={media.url} alt={media.alt_text || product.product_name} />
                )}
              </button>
            ))}
          </div>
        </section>

        <section className="modal-info buyer-modal-info">
          <div className="badges">
            <span>{product.category_name || "Produk"}</span>
            <span>{product.total_stock > 0 ? "Ready Stock" : "Stok Habis"}</span>
            <span>{product.material_name || "Bahan"}</span>
          </div>
          <h2>{product.product_name}</h2>
          <div className="price">{formatCurrency(activeVariant?.final_price || product.min_price || 0)}</div>

          {product.description && <iframe className="product-description-frame" title="Detail Produk" srcDoc={descriptionSrcDoc} sandbox="" />}

          <div className="spec-grid buyer-spec-grid">
            <div><small>Bahan</small><strong>{product.material_name || "-"}</strong></div>
            <div><small>Gramasi</small><strong>{product.gramasi || "-"}</strong></div>
            <div><small>Fit / Pola</small><strong>{activeVariant?.pattern_type || "-"}</strong></div>
          </div>

          <hr />
          <h3>Pilih varian, ekspedisi & jumlah</h3>

          <label>Warna produk</label>
          <div className="color-pills">
            {colors.map(color => (
              <button key={color} className={selectedColor === color ? "active" : ""} onClick={() => chooseColor(color)}>{color}</button>
            ))}
          </div>

          <label>Ukuran / Pola</label>
          <select value={activeVariant?.variant_id || selectedVariantId} onChange={e => changeVariant(e.target.value)}>
            {variantOptions.map(v => (
              <option key={v.variant_id} value={v.variant_id}>{v.size_name} / {v.pattern_type} — {formatCurrency(v.final_price)}</option>
            ))}
          </select>

          <label>Ekspedisi Pengiriman</label>
          <select value={selectedShippingId} onChange={e => onShippingChange?.(e.target.value)}>
            <option value="">{shippingOptions.length ? "- Pilih Ekspedisi -" : "Ekspedisi belum tersedia"}</option>
            {shippingOptions.map(option => (
              <option key={option.id} value={option.id}>
                {option.name}{option.service_name ? ` / ${option.service_name}` : ""} — {formatCurrency(option.base_cost || 0)} {option.etd_text ? `(${option.etd_text})` : ""}
              </option>
            ))}
          </select>

          <div className="quantity-row">
            <label>Jumlah</label>
            <div className="quantity-control">
              <button type="button" onClick={() => updateQuantity(quantity - 1)} disabled={quantity <= 1}>−</button>
              <input value={quantity} onChange={event => updateQuantity(Number(event.target.value))} type="number" min={1} max={maxQuantity} />
              <button type="button" onClick={() => updateQuantity(quantity + 1)} disabled={quantity >= maxQuantity}>+</button>
            </div>
          </div>

          <div className="spec-grid buyer-spec-grid buyer-spec-grid-secondary">
            <div><small>Stok tersedia</small><strong>{activeVariant?.stock_qty ?? 0}</strong></div>
            <div><small>Berat</small><strong>{activeVariant?.weight_gram ?? 0} gram</strong></div>
            <div><small>SKU</small><strong>{activeVariant?.sku_variant || "-"}</strong></div>
          </div>

          {localMessage && <div className="inline-success">{localMessage}</div>}

          <div className="modal-actions buyer-modal-actions">
            <button className="btn-primary" onClick={addToCart} disabled={!canBuy}>Tambah ke Keranjang</button>
            <button className="btn-primary" onClick={checkoutNow} disabled={!canBuy}>Checkout</button>
            <button className="btn-secondary">Tanya via WhatsApp</button>
          </div>
        </section>
      </div>
    </div>
  );
}
