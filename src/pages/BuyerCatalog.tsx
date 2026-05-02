import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { BuyerCatalogProduct, CatalogVideo } from "../types";
import { formatCurrency } from "../lib/utils";
import { ProductDetailModal } from "../components/ProductDetailModal";

export function BuyerCatalog() {
  const [products, setProducts] = useState<BuyerCatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedShowcase, setSelectedShowcase] = useState("Semua");
  const [selectedProduct, setSelectedProduct] = useState<BuyerCatalogProduct | null>(null);
  const [error, setError] = useState("");

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

    setProducts(
      baseProducts.map(product => ({
        ...product,
        videos: videoList.filter(video => video.product_id === product.product_id),
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const showcases = useMemo(() => ["Semua", ...Array.from(new Set(products.map(p => p.showcase_name).filter(Boolean))) as string[]], [products]);

  const filtered = products.filter(p => {
    const q = query.trim().toLowerCase();
    const matchQuery = !q || [
      p.product_name,
      p.sku_product,
      p.category_name,
      p.showcase_name,
      p.material_name,
      p.gramasi
    ].filter(Boolean).some(v => String(v).toLowerCase().includes(q));

    const matchShowcase = selectedShowcase === "Semua" || p.showcase_name === selectedShowcase;

    return matchQuery && matchShowcase;
  });

  return (
    <>
      <section className="hero compact">
        <h1>Lebih dari sekadar kaos. Ini adalah cara kamu bergerak dengan identitasmu.</h1>
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

      <section className="filter-panel">
        <div>
          <h2>Filter Produk</h2>
          <p>Saring katalog agar pembeli lebih cepat menemukan produk.</p>
        </div>
        <select value={selectedShowcase} onChange={e => setSelectedShowcase(e.target.value)}>
          {showcases.map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={loadProducts}>Refresh Katalog</button>
      </section>

      <section>
        <div className="section-title">
          <div>
            <h2>Katalog Produk</h2>
            <p>{loading ? "Memuat produk..." : `${filtered.length} dari ${products.length} produk tampil`}</p>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="product-grid">
          {filtered.map(product => (
            <article className="product-card" key={product.product_id}>
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

      {selectedProduct && <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
    </>
  );
}

