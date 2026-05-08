import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";

type MasterRow = Record<string, any>;

type ProductRow = {
  id: string;
  sku_product: string;
  product_name: string;
  slug: string;
  showcase_id: string | null;
  category_id: string | null;
  material_id: string | null;
  model_id: string | null;
  gramasi: string | null;
  description: string | null;
  status: string;
  showcases?: any;
  categories?: any;
  materials?: any;
  product_models?: any;
};

type VariantRow = {
  id: string;
  product_id: string;
  color_id: string | null;
  size_id: string | null;
  sku_variant: string;
  variant_name: string | null;
  stock_qty: number;
  stock_min: number;
  base_price: number;
  hpp_cost: number;
  discount_type: "NONE" | "PERCENT" | "AMOUNT";
  discount_value: number;
  discount_start: string | null;
  discount_end: string | null;
  weight_gram: number;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
  status: string;
  colors?: any;
  sizes?: any;
};

type ProductImage = {
  id: string;
  product_id: string;
  variant_id: string | null;
  color_id: string | null;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
  is_primary: boolean;
  alt_text: string | null;
};

type ProductVideo = {
  id: string;
  product_id: string;
  color_id: string | null;
  color_name: string | null;
  video_url: string;
  storage_path: string | null;
  created_at?: string;
};

type MasterState = {
  showcases: MasterRow[];
  categories: MasterRow[];
  materials: MasterRow[];
  colors: MasterRow[];
  sizes: MasterRow[];
  product_models: MasterRow[];
};

const emptyProduct = {
  id: "",
  sku_product: "",
  product_name: "",
  slug: "",
  showcase_id: "",
  category_id: "",
  material_id: "",
  model_id: "",
  gramasi: "",
  description: "",
  status: "AKTIF",
};

const emptyVariant = {
  id: "",
  product_id: "",
  color_id: "",
  size_id: "",
  sku_variant: "",
  variant_name: "",
  stock_qty: 0,
  stock_min: 0,
  base_price: 0,
  hpp_cost: 0,
  discount_type: "NONE" as "NONE" | "PERCENT" | "AMOUNT",
  discount_value: 0,
  discount_start: "",
  discount_end: "",
  weight_gram: 0,
  package_length_cm: "",
  package_width_cm: "",
  package_height_cm: "",
  status: "AKTIF",
};

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function relName(value: any, fallback = "-") {
  if (!value) return fallback;
  if (Array.isArray(value)) return value[0]?.name || fallback;
  return value.name || fallback;
}

function modelName(value: any) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return "-";
  return [row.model_type, row.print_type, row.motif, row.theme].filter(Boolean).join(" / ") || "-";
}

function sizeLabel(value: any) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return "-";
  return [row.size_name, row.pattern_type].filter(Boolean).join(" / ");
}

function numberOrNull(value: any) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function numberOrZero(value: any) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function finalPrice(v: Pick<VariantRow, "base_price" | "discount_type" | "discount_value">) {
  const base = Number(v.base_price || 0);
  const disc = Number(v.discount_value || 0);
  if (v.discount_type === "PERCENT" && disc > 0) return Math.max(base - (base * disc / 100), 0);
  if (v.discount_type === "AMOUNT" && disc > 0) return Math.max(base - disc, 0);
  return base;
}

function safeFileName(file: File) {
  const clean = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
  return `${Date.now()}-${clean}`;
}


function normalizeKey(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function colorLabel(value: any) {
  const label = relName(value, "");
  return label || "Tanpa Warna";
}

function mediaPathSafe(value: string | null | undefined) {
  return slugify(String(value || "warna")) || "warna";
}


function codePart(value: string, length = 5) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  if (!clean) return "";
  return clean.slice(0, length);
}

function generateSkuProduct(form: any, master: MasterState) {
  const category = master.categories.find(row => row.id === form.category_id);
  const material = master.materials.find(row => row.id === form.material_id);

  const categoryCode = codePart(category?.name || "PRD", 5) || "PRD";
  const nameCode = codePart(form.product_name || "PRODUK", 8) || "PRODUK";
  const materialCode = codePart(material?.name || "", 4);
  const gramasiCode = codePart(form.gramasi || "", 4);
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);

  return [categoryCode, nameCode, materialCode, gramasiCode, suffix].filter(Boolean).join("-");
}

function generateSkuPreview(form: any, master: MasterState) {
  if (form.id && form.sku_product) return String(form.sku_product).toUpperCase();

  const category = master.categories.find(row => row.id === form.category_id);
  const material = master.materials.find(row => row.id === form.material_id);

  const categoryCode = codePart(category?.name || "PRD", 5) || "PRD";
  const nameCode = codePart(form.product_name || "NAMA", 8) || "NAMA";
  const materialCode = codePart(material?.name || "", 4);
  const gramasiCode = codePart(form.gramasi || "", 4);

  return [categoryCode, nameCode, materialCode, gramasiCode, "AUTO"].filter(Boolean).join("-");
}



function patternCode(value: string) {
  const text = String(value || "").toUpperCase();
  if (text.includes("REGULAR")) return "REG";
  if (text.includes("OVERSIZE")) return "OVR";
  if (text.includes("SLIM")) return "SLM";
  if (text.includes("RELAX")) return "RLX";
  return codePart(text, 3) || "POLA";
}

function generateSkuVariant(product: ProductRow | null | undefined, color: any, size: any) {
  const base = codePart(product?.sku_product || "VAR", 22) || "VAR";
  const colorPart = codePart(color?.name || "WARNA", 6) || "WARNA";
  const sizePart = codePart(size?.size_name || "SIZE", 5) || "SIZE";
  const patternPart = patternCode(size?.pattern_type || "");

  return [base, colorPart, sizePart, patternPart].filter(Boolean).join("-");
}

export function ProductMatrixPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [master, setMaster] = useState<MasterState>({
    showcases: [],
    categories: [],
    materials: [],
    colors: [],
    sizes: [],
    product_models: [],
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showcaseExpanded, setShowcaseExpanded] = useState<Record<string, boolean>>({});
  const [collapsedColors, setCollapsedColors] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [productModal, setProductModal] = useState<{ open: boolean; data: any }>({ open: false, data: emptyProduct });
  const [variantModal, setVariantModal] = useState<{ open: boolean; data: any; product?: ProductRow | null }>({
    open: false,
    data: emptyVariant,
    product: null,
  });

  async function loadMaster() {
    const [showcases, categories, materials, colors, sizes, product_models] = await Promise.all([
      supabase.from("showcases").select("*").order("display_order", { ascending: true }),
      supabase.from("categories").select("*").order("display_order", { ascending: true }),
      supabase.from("materials").select("*").order("name", { ascending: true }),
      supabase.from("colors").select("*").order("name", { ascending: true }),
      supabase.from("sizes").select("*").order("display_order", { ascending: true }),
      supabase.from("product_models").select("*").order("model_type", { ascending: true }),
    ]);

    setMaster({
      showcases: showcases.data || [],
      categories: categories.data || [],
      materials: materials.data || [],
      colors: colors.data || [],
      sizes: sizes.data || [],
      product_models: product_models.data || [],
    });
  }

  async function loadProducts() {
    setLoading(true);
    setError("");
    setNotice("");

    const { data: p, error: pe } = await supabase
      .from("products")
      .select(`
        id,
        sku_product,
        product_name,
        slug,
        showcase_id,
        category_id,
        material_id,
        model_id,
        gramasi,
        description,
        status,
        showcases(name),
        categories(name),
        materials(name),
        product_models(model_type, print_type, motif, theme)
      `)
      .order("created_at", { ascending: false });

    const { data: v, error: ve } = await supabase
      .from("product_variants")
      .select(`
        id,
        product_id,
        color_id,
        size_id,
        sku_variant,
        variant_name,
        stock_qty,
        stock_min,
        base_price,
        hpp_cost,
        discount_type,
        discount_value,
        discount_start,
        discount_end,
        weight_gram,
        package_length_cm,
        package_width_cm,
        package_height_cm,
        status,
        colors(name, hex_code),
        sizes(size_name, pattern_type)
      `)
      .order("sku_variant", { ascending: true });

    const { data: img, error: ie } = await supabase
      .from("product_images")
      .select("*")
      .order("sort_order", { ascending: true });

    const { data: vid, error: vide } = await supabase
      .from("product_videos")
      .select("*")
      .order("created_at", { ascending: false });

    const videoTableMissing = !!vide && (
      vide.message?.includes("product_videos") ||
      vide.message?.includes("does not exist") ||
      vide.code === "42P01"
    );

    if (pe || ve || ie || (vide && !videoTableMissing)) {
      setError(pe?.message || ve?.message || ie?.message || vide?.message || "Gagal memuat produk.");
      setLoading(false);
      return;
    }

    setProducts((p || []) as unknown as ProductRow[]);
    setVariants((v || []) as unknown as VariantRow[]);
    setImages((img || []) as ProductImage[]);
    setVideos(videoTableMissing ? [] : ((vid || []) as ProductVideo[]));
    setLoading(false);
  }

  async function refreshAll() {
    await Promise.all([loadMaster(), loadProducts()]);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  function variantsOf(productId: string) {
    return variants.filter(v => v.product_id === productId);
  }

  function variantsForColor(productId: string, colorId: string | null, colorName: string) {
    const target = normalizeKey(colorName);

    return variants.filter(v => {
      if (v.product_id !== productId) return false;
      if (colorId && v.color_id === colorId) return true;
      return normalizeKey(colorLabel(v.colors)) === target;
    });
  }

  function uniqueImages(list: ProductImage[]) {
    const seen = new Set<string>();

    return list.filter(img => {
      const key = img.storage_path || img.image_url || img.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function imageMatchesColor(img: ProductImage, productId: string, colorId: string | null, colorName: string) {
    if (img.product_id !== productId) return false;
    if (colorId && img.color_id === colorId) return true;

    const target = normalizeKey(colorName);
    if (!target) return false;

    const byVariant = variants.find(v => v.id === img.variant_id);
    if (byVariant && normalizeKey(colorLabel(byVariant.colors)) === target) return true;

    if (img.alt_text && normalizeKey(img.alt_text).includes(target)) return true;

    return false;
  }

  function imagesOfVariant(variantId: string) {
    return images.filter(i => i.variant_id === variantId);
  }

  function imagesOfColor(productId: string, colorId: string | null, colorName: string) {
    return uniqueImages(
      images.filter(i => imageMatchesColor(i, productId, colorId, colorName))
    ).sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function videoOfColor(productId: string, colorId: string | null, colorName: string) {
    const target = normalizeKey(colorName);

    return videos.find(video => {
      if (video.product_id !== productId) return false;
      if (colorId && video.color_id === colorId) return true;
      return normalizeKey(video.color_name) === target;
    }) || null;
  }

  function groupVariantsByColor(list: VariantRow[]) {
    const groups: Array<{
      key: string;
      colorId: string | null;
      colorName: string;
      items: VariantRow[];
    }> = [];

    list.forEach(variant => {
      const colorName = colorLabel(variant.colors);
      const key = normalizeKey(colorName) || variant.color_id || "tanpa-warna";
      let group = groups.find(item => item.key === key);

      if (!group) {
        group = {
          key,
          colorId: variant.color_id || null,
          colorName,
          items: [],
        };
        groups.push(group);
      }

      if (!group.colorId && variant.color_id) group.colorId = variant.color_id;
      group.items.push(variant);
    });

    return groups;
  }

  function colorCollapseKey(productId: string, groupKey: string) {
    return `${productId}:${groupKey}`;
  }

  function toggleColorCollapse(productId: string, groupKey: string) {
    const key = colorCollapseKey(productId, groupKey);
    setCollapsedColors(prev => ({ ...prev, [key]: !(prev[key] ?? false) }));
  }

  function openAddProduct() {
    setProductModal({ open: true, data: { ...emptyProduct } });
  }

  function openEditProduct(product: ProductRow) {
    setProductModal({
      open: true,
      data: {
        id: product.id,
        sku_product: product.sku_product || "",
        product_name: product.product_name || "",
        slug: product.slug || "",
        showcase_id: product.showcase_id || "",
        category_id: product.category_id || "",
        material_id: product.material_id || "",
        model_id: product.model_id || "",
        gramasi: product.gramasi || "",
        description: product.description || "",
        status: product.status || "AKTIF",
      },
    });
  }

  function openAddVariant(product: ProductRow) {
    setVariantModal({
      open: true,
      product,
      data: {
        ...emptyVariant,
        product_id: product.id,
        sku_variant: "",
      },
    });
  }

  function openEditVariant(product: ProductRow, variant: VariantRow) {
    setVariantModal({
      open: true,
      product,
      data: {
        id: variant.id,
        product_id: variant.product_id,
        color_id: variant.color_id || "",
        size_id: variant.size_id || "",
        sku_variant: variant.sku_variant || "",
        variant_name: variant.variant_name || "",
        stock_qty: variant.stock_qty || 0,
        stock_min: variant.stock_min || 0,
        base_price: variant.base_price || 0,
      hpp_cost: variant.hpp_cost || 0,
      discount_type: variant.discount_type || "NONE",
        discount_value: variant.discount_value || 0,
        discount_start: variant.discount_start || "",
        discount_end: variant.discount_end || "",
        weight_gram: variant.weight_gram || 0,
        package_length_cm: variant.package_length_cm ?? "",
        package_width_cm: variant.package_width_cm ?? "",
        package_height_cm: variant.package_height_cm ?? "",
        status: variant.status || "AKTIF",
      },
    });
  }

  async function saveProduct(form: any) {
    setSaving(true);
    setError("");
    setNotice("");

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id || null;
    const name = String(form.product_name || "").trim();
    const sku = String(form.sku_product || "").trim().toUpperCase() || generateSkuProduct(form, master);

    if (!name) {
      setError("Nama Produk / Judul Listing wajib diisi. SKU Produk akan dibuat otomatis oleh sistem.");
      setSaving(false);
      return;
    }

    const payload: any = {
      sku_product: sku,
      product_name: name,
      slug: String(form.slug || "").trim() || `${slugify(name)}-${slugify(sku)}`,
      showcase_id: form.showcase_id || null,
      category_id: form.category_id || null,
      material_id: form.material_id || null,
      model_id: form.model_id || null,
      gramasi: form.gramasi || null,
      description: form.description || null,
      status: form.status || "AKTIF",
      updated_by: userId,
    };

    let result;
    if (form.id) {
      result = await supabase.from("products").update(payload).eq("id", form.id);
    } else {
      payload.created_by = userId;
      result = await supabase.from("products").insert(payload);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setProductModal({ open: false, data: emptyProduct });
    setNotice(`Produk berhasil disimpan. SKU Produk: ${sku}`);
    await loadProducts();
    setSaving(false);
  }

  async function saveVariant(form: any) {
    setSaving(true);
    setError("");
    setNotice("");

    if (!form.product_id) {
      setError("Produk induk tidak ditemukan.");
      setSaving(false);
      return;
    }

    if (!form.color_id || !form.size_id) {
      setError("Warna dan Ukuran / Pola wajib dipilih.");
      setSaving(false);
      return;
    }

    const color = master.colors.find(c => c.id === form.color_id);
    const size = master.sizes.find(s => s.id === form.size_id);
    const currentProduct = products.find(p => p.id === form.product_id) || variantModal.product || null;
    const autoSkuVariant = generateSkuVariant(currentProduct, color, size);
    const autoVariantName = [color?.name, size?.size_name, size?.pattern_type].filter(Boolean).join(" / ");

    const sameSku = variants.find(v =>
      String(v.sku_variant || "").toUpperCase() === autoSkuVariant.toUpperCase() &&
      v.id !== form.id
    );

    if (sameSku) {
      setError(`SKU Varian otomatis ${autoSkuVariant} sudah digunakan. Periksa kombinasi warna dan ukuran/pola.`);
      setSaving(false);
      return;
    }

    const payload: any = {
      product_id: form.product_id,
      color_id: form.color_id || null,
      size_id: form.size_id || null,
      sku_variant: autoSkuVariant,
      variant_name: form.variant_name || autoVariantName,
      stock_qty: Math.max(0, numberOrZero(form.stock_qty)),
      stock_min: Math.max(0, numberOrZero(form.stock_min)),
      base_price: Math.max(0, numberOrZero(form.base_price)),
      hpp_cost: Math.max(0, numberOrZero(form.hpp_cost)),
      discount_type: form.discount_type || "NONE",
      discount_value: Math.max(0, numberOrZero(form.discount_value)),
      discount_start: form.discount_start || null,
      discount_end: form.discount_end || null,
      weight_gram: Math.max(0, numberOrZero(form.weight_gram)),
      package_length_cm: numberOrNull(form.package_length_cm),
      package_width_cm: numberOrNull(form.package_width_cm),
      package_height_cm: numberOrNull(form.package_height_cm),
      status: form.status || "AKTIF",
    };

    let result;
    if (form.id) {
      result = await supabase
        .from("product_variants")
        .update(payload)
        .eq("id", form.id)
        .select("id")
        .single();
    } else {
      result = await supabase
        .from("product_variants")
        .insert(payload)
        .select("id")
        .single();
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    const savedVariantId = result.data?.id || form.id;
    await syncExistingColorImagesToVariant(
      savedVariantId,
      form.product_id,
      form.color_id,
      color?.name || autoVariantName.split("/")[0]?.trim() || "Tanpa Warna",
      currentProduct?.product_name || "Produk"
    );

    setVariantModal({ open: false, data: emptyVariant, product: null });
    setNotice(`Varian berhasil disimpan. SKU Varian: ${autoSkuVariant}`);
    await loadProducts();
    setSaving(false);
  }

  async function setProductInactive(product: ProductRow) {
    if (!confirm(`Nonaktifkan produk "${product.product_name}"? Produk tidak tampil di katalog buyer.`)) return;
    const { error } = await supabase.from("products").update({ status: "NONAKTIF" }).eq("id", product.id);
    if (error) setError(error.message);
    else {
      setNotice("Produk berhasil dinonaktifkan.");
      await loadProducts();
    }
  }

  async function setVariantInactive(variant: VariantRow) {
    if (!confirm(`Nonaktifkan varian "${variant.sku_variant}"?`)) return;
    const { error } = await supabase.from("product_variants").update({ status: "NONAKTIF" }).eq("id", variant.id);
    if (error) setError(error.message);
    else {
      setNotice("Varian berhasil dinonaktifkan.");
      await loadProducts();
    }
  }

  async function hardDeleteVariant(variant: VariantRow) {
    const label = variant.variant_name || variant.sku_variant;
    if (!confirm(`Hapus permanen varian "${label}"? Data foto untuk baris varian ini juga akan dihapus dari tabel.`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    const variantImages = images.filter(i => i.variant_id === variant.id);
    const storagePaths = Array.from(new Set(variantImages.map(i => i.storage_path).filter(Boolean))) as string[];

    const removablePaths = storagePaths.filter(path => {
      return !images.some(i => i.storage_path === path && i.variant_id !== variant.id);
    });

    if (removablePaths.length) {
      await supabase.storage.from("product-images").remove(removablePaths);
    }

    const deleteImages = await supabase.from("product_images").delete().eq("variant_id", variant.id);
    if (deleteImages.error) {
      setError(deleteImages.error.message);
      setSaving(false);
      return;
    }

    const deleteVariant = await supabase.from("product_variants").delete().eq("id", variant.id);
    if (deleteVariant.error) {
      setError(deleteVariant.error.message);
      setSaving(false);
      return;
    }

    setNotice("Varian berhasil dihapus.");
    await loadProducts();
    setSaving(false);
  }

  async function hardDeleteProduct(product: ProductRow) {
    if (!confirm(`Hapus permanen produk "${product.product_name}" beserta semua varian dan foto?`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    const productImages = images.filter(i => i.product_id === product.id);
    const storagePaths = Array.from(new Set(productImages.map(i => i.storage_path).filter(Boolean))) as string[];

    if (storagePaths.length) {
      await supabase.storage.from("product-images").remove(storagePaths);
    }

    const deleteImages = await supabase.from("product_images").delete().eq("product_id", product.id);
    if (deleteImages.error) {
      setError(deleteImages.error.message);
      setSaving(false);
      return;
    }

    const deleteVariants = await supabase.from("product_variants").delete().eq("product_id", product.id);
    if (deleteVariants.error) {
      setError(deleteVariants.error.message);
      setSaving(false);
      return;
    }

    const deleteProduct = await supabase.from("products").delete().eq("id", product.id);
    if (deleteProduct.error) {
      setError(deleteProduct.error.message);
      setSaving(false);
      return;
    }

    setExpanded(prev => {
      const next = { ...prev };
      delete next[product.id];
      return next;
    });

    setNotice("Produk berhasil dihapus.");
    await loadProducts();
    setSaving(false);
  }

  async function syncExistingColorImagesToVariant(
    variantId: string,
    productId: string,
    colorId: string | null,
    colorName: string,
    productName: string
  ) {
    if (!variantId) return;

    const existingForVariant = images.filter(i => i.variant_id === variantId);
    if (existingForVariant.length > 0) return;

    const colorImages = imagesOfColor(productId, colorId, colorName).slice(0, 5);
    if (!colorImages.length) return;

    const rows = colorImages.map(img => ({
      product_id: productId,
      variant_id: variantId,
      color_id: colorId || img.color_id,
      image_url: img.image_url,
      storage_path: img.storage_path,
      sort_order: img.sort_order || 1,
      is_primary: false,
      alt_text: img.alt_text || `${productName} - ${colorName}`,
    }));

    await supabase.from("product_images").insert(rows);
  }

async function uploadColorImages(
    product: ProductRow,
    colorId: string | null,
    colorName: string,
    fileList: FileList | null
  ) {
    if (!fileList?.length) return;

    setSaving(true);
    setError("");
    setNotice("");

    const colorVariants = variantsForColor(product.id, colorId, colorName);
    if (!colorVariants.length) {
      setError("Tidak ada varian untuk warna ini.");
      setSaving(false);
      return;
    }

    const existing = imagesOfColor(product.id, colorId, colorName);
    const remainingSlots = 5 - existing.length;

    if (remainingSlots <= 0) {
      setError("Maksimal 5 foto untuk setiap warna produk.");
      setSaving(false);
      return;
    }

    const files = Array.from(fileList).slice(0, remainingSlots);
    if (fileList.length > remainingSlots) {
      setNotice(`Hanya ${remainingSlots} foto yang diupload karena batas maksimal 5 foto per warna.`);
    }

    const primaryExists = images.some(i => i.product_id === product.id && i.is_primary);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${product.id}/colors/${colorId || mediaPathSafe(colorName)}/${safeFileName(file)}`;

      const uploaded = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploaded.error) {
        setError(uploaded.error.message);
        setSaving(false);
        return;
      }

      const { data: publicUrl } = supabase.storage.from("product-images").getPublicUrl(path);
      const sortOrder = existing.length + index + 1;

      const rows = colorVariants.map((variant, variantIndex) => ({
        product_id: product.id,
        variant_id: variant.id,
        color_id: colorId || variant.color_id,
        image_url: publicUrl.publicUrl,
        storage_path: path,
        sort_order: sortOrder,
        is_primary: !primaryExists && index === 0 && variantIndex === 0,
        alt_text: `${product.product_name} - ${colorName}`,
      }));

      const { error: insertError } = await supabase.from("product_images").insert(rows);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
    }

    setNotice(`Foto warna ${colorName} berhasil diupload dan diterapkan ke semua ukuran pada warna yang sama.`);
    await loadProducts();
    setSaving(false);
  }

  async function uploadColorVideo(
    product: ProductRow,
    colorId: string | null,
    colorName: string,
    fileList: FileList | null
  ) {
    const file = fileList?.[0];
    if (!file) return;

    setSaving(true);
    setError("");
    setNotice("");

    if (!file.type.startsWith("video/")) {
      setError("File video tidak valid. Gunakan file MP4/WebM/QuickTime.");
      setSaving(false);
      return;
    }

    const existingVideo = videoOfColor(product.id, colorId, colorName);
    if (existingVideo && !confirm(`Warna ${colorName} sudah memiliki video. Ganti video lama?`)) {
      setSaving(false);
      return;
    }

    const path = `${product.id}/videos/${colorId || mediaPathSafe(colorName)}/${safeFileName(file)}`;

    const uploaded = await supabase.storage.from("product-videos").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploaded.error) {
      setError(uploaded.error.message);
      setSaving(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("product-videos").getPublicUrl(path);

    if (existingVideo) {
      if (existingVideo.storage_path) {
        await supabase.storage.from("product-videos").remove([existingVideo.storage_path]);
      }

      const updated = await supabase
        .from("product_videos")
        .update({
          color_id: colorId,
          color_name: colorName,
          video_url: publicUrl.publicUrl,
          storage_path: path,
        })
        .eq("id", existingVideo.id);

      if (updated.error) {
        setError(updated.error.message);
        setSaving(false);
        return;
      }
    } else {
      const inserted = await supabase.from("product_videos").insert({
        product_id: product.id,
        color_id: colorId,
        color_name: colorName,
        video_url: publicUrl.publicUrl,
        storage_path: path,
      });

      if (inserted.error) {
        setError(inserted.error.message);
        setSaving(false);
        return;
      }
    }

    setNotice(`Video warna ${colorName} berhasil disimpan.`);
    await loadProducts();
    setSaving(false);
  }

  async function deleteColorImage(
    product: ProductRow,
    colorId: string | null,
    colorName: string,
    image: ProductImage
  ) {
    if (!confirm(`Hapus foto warna ${colorName}?`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    const productColorImages = imagesOfColor(product.id, colorId, colorName);
    const sameImageRows = images.filter(row => {
      if (row.product_id !== product.id) return false;

      const sameStorage = image.storage_path && row.storage_path === image.storage_path;
      const sameUrl = !image.storage_path && row.image_url === image.image_url;

      if (!sameStorage && !sameUrl) return false;

      return productColorImages.some(colorImage => colorImage.id === row.id || colorImage.storage_path === row.storage_path || colorImage.image_url === row.image_url);
    });

    const ids = sameImageRows.map(row => row.id);
    const storagePaths = Array.from(new Set(sameImageRows.map(row => row.storage_path).filter(Boolean))) as string[];

    if (storagePaths.length) {
      await supabase.storage.from("product-images").remove(storagePaths);
    }

    let deleteQuery = supabase.from("product_images").delete();

    if (ids.length) {
      const deleted = await deleteQuery.in("id", ids);
      if (deleted.error) {
        setError(deleted.error.message);
        setSaving(false);
        return;
      }
    } else if (image.storage_path) {
      const deleted = await deleteQuery.eq("product_id", product.id).eq("storage_path", image.storage_path);
      if (deleted.error) {
        setError(deleted.error.message);
        setSaving(false);
        return;
      }
    } else {
      const deleted = await deleteQuery.eq("product_id", product.id).eq("image_url", image.image_url);
      if (deleted.error) {
        setError(deleted.error.message);
        setSaving(false);
        return;
      }
    }

    setNotice(`Foto warna ${colorName} berhasil dihapus.`);
    await loadProducts();
    setSaving(false);
  }

  async function deleteAllColorImages(product: ProductRow, colorId: string | null, colorName: string) {
    const colorImages = imagesOfColor(product.id, colorId, colorName);

    if (!colorImages.length) {
      setError(`Belum ada foto untuk warna ${colorName}.`);
      return;
    }

    if (!confirm(`Hapus semua ${colorImages.length} foto warna ${colorName}?`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    const imageKeys = new Set(colorImages.map(img => img.storage_path || img.image_url));
    const rowsToDelete = images.filter(row => {
      if (row.product_id !== product.id) return false;
      const key = row.storage_path || row.image_url;
      return imageKeys.has(key);
    });

    const ids = rowsToDelete.map(row => row.id);
    const storagePaths = Array.from(new Set(rowsToDelete.map(row => row.storage_path).filter(Boolean))) as string[];

    if (storagePaths.length) {
      await supabase.storage.from("product-images").remove(storagePaths);
    }

    const deleted = await supabase.from("product_images").delete().in("id", ids);
    if (deleted.error) {
      setError(deleted.error.message);
      setSaving(false);
      return;
    }

    setNotice(`Semua foto warna ${colorName} berhasil dihapus.`);
    await loadProducts();
    setSaving(false);
  }

  async function deleteColorVideo(product: ProductRow, colorId: string | null, colorName: string) {
    const video = videoOfColor(product.id, colorId, colorName);

    if (!video) {
      setError(`Belum ada video untuk warna ${colorName}.`);
      return;
    }

    if (!confirm(`Hapus video warna ${colorName}?`)) return;

    setSaving(true);
    setError("");
    setNotice("");

    if (video.storage_path) {
      await supabase.storage.from("product-videos").remove([video.storage_path]);
    }

    const deleted = await supabase.from("product_videos").delete().eq("id", video.id);
    if (deleted.error) {
      setError(deleted.error.message);
      setSaving(false);
      return;
    }

    setNotice(`Video warna ${colorName} berhasil dihapus.`);
    await loadProducts();
    setSaving(false);
  }

  const activeProducts = useMemo(() => products, [products]);

  const showcaseGroups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; products: ProductRow[]; totalVariants: number; totalStock: number }>();

    activeProducts.forEach(product => {
      const name = relName(product.showcases) || "Tanpa Etalase";
      const key = `${product.showcase_id || "no-showcase"}::${name}`;
      const list = variantsOf(product.id);
      const current = map.get(key) || { key, name, products: [], totalVariants: 0, totalStock: 0 };
      current.products.push(product);
      current.totalVariants += list.length;
      current.totalStock += list.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [activeProducts, variants]);

  const toolbarProduct = activeProducts[0] || null;
  const toastMessage = error || notice || (saving ? "Menyimpan..." : "");

  return (
    <section className="panel product-crud-panel">
      <div className="section-title">
        <div>
          <h1>Full Seller Product Matrix</h1>
          <p>Tambah/edit produk induk, varian, stok, harga, diskon, berat, dimensi, dan foto langsung dari Supabase.</p>
        </div>
        <div className="toolbar-row compact-toolbar-row">
          <button className="btn-primary" onClick={openAddProduct}>+ Tambah Produk Induk</button>
          {toolbarProduct && (
            <button onClick={() => openEditProduct(toolbarProduct)}>Edit Produk</button>
          )}
          {toolbarProduct && (
            <button className="danger solid-danger" onClick={() => hardDeleteProduct(toolbarProduct)}>Hapus Produk</button>
          )}
          <button onClick={refreshAll}>Refresh</button>
        </div>
      </div>

      {loading && <div className="message">Memuat produk...</div>}
      {saving && <div className="message">Menyimpan...</div>}
      {notice && <div className="message">{notice}</div>}
      {error && <div className="error-box">{error}</div>}

      <div className="matrix">
        {showcaseGroups.map(group => {
          const isShowcaseOpen = showcaseExpanded[group.key] ?? false;
          return (
            <div className="showcase-accordion-group" key={group.key}>
              <button
                type="button"
                className={`showcase-accordion-head ${isShowcaseOpen ? "open" : ""}`}
                onClick={() => setShowcaseExpanded(prev => ({ ...prev, [group.key]: !isShowcaseOpen }))}
              >
                <span className="showcase-accordion-icon">{isShowcaseOpen ? "-" : "+"}</span>
                <span>
                  <strong>Etalase: {group.name}</strong>
                  <small>{group.products.length} produk  -  {group.totalVariants} varian  -  stok {group.totalStock}</small>
                </span>
              </button>

              {isShowcaseOpen && group.products.map(product => {
          const list = variantsOf(product.id);
          const isOpen = expanded[product.id] ?? false;
          const stock = list.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);
          const minPrice = list.length ? Math.min(...list.map(v => finalPrice(v))) : 0;
          const maxPrice = list.length ? Math.max(...list.map(v => finalPrice(v))) : 0;

          return (
            <div className="matrix-item product-matrix-item" key={product.id}>
              <div className={`matrix-parent matrix-parent-crud listing-accordion-parent ${isOpen ? "open" : ""}`}>
                <button className="collapse-button listing-collapse-button" onClick={() => setExpanded(prev => ({ ...prev, [product.id]: !isOpen }))}>
                  {isOpen ? "-" : "+"}
                </button>

                <div className="parent-main listing-title-cell">
                  <small>Nama Produk / Judul Listing</small>
                  <strong>{product.product_name}</strong>
                  <small>{product.sku_product}</small>
                </div>

                <div><small>Etalase</small><span>{relName(product.showcases)}</span></div>
                <div><small>Kategori</small><span>{relName(product.categories)}</span></div>
                <div><small>Model</small><span>{modelName(product.product_models)}</span></div>
                <div><small>Bahan</small><span>{relName(product.materials)}</span></div>
                <div><small>Gramasi</small><span>{product.gramasi || "-"}</span></div>
                <div><small>Ringkasan</small><span>{list.length} varian  -  stok {stock}</span></div>
                <div><small>Harga</small><span>{list.length ? `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}` : "-"}</span></div>
                <div><small>Status</small><span className={`status-pill ${product.status === "AKTIF" ? "active" : ""}`}>{product.status}</span></div>

                <div className="action-stack">
                  <button onClick={() => openEditProduct(product)}>Edit</button>
                  <button onClick={() => openAddVariant(product)}>+ Varian</button>
                  <button className="danger" onClick={() => setProductInactive(product)}>Nonaktifkan</button>
                  <button className="danger solid-danger" onClick={() => hardDeleteProduct(product)}>Hapus</button>
                </div>
              </div>

              {isOpen && (
                <div className="variant-zone">
                  <div className="variant-head">
                    <div>
                      <h3>Transaksi Varian</h3>
                      <p>Foto, warna, ukuran, stok, HPP, harga, diskon, periode diskon, SKU, berat, dimensi, dan status per varian.</p>
                    </div>
                    <button className="btn-primary" onClick={() => openAddVariant(product)}>+ Tambah Varian</button>
                  </div>

                  <div className="table-wrap variant-table-wrap">
                    <table className="variant-table">
                      <thead>
                        <tr>
                          <th>Foto</th>
                          <th>Warna</th>
                          <th>Ukuran / Pola</th>
                          <th>Stok</th>
                          <th>Harga Default</th>
                          <th>Diskon</th>
                          <th>Harga Akhir</th>
                          <th>SKU Varian</th>
                          <th>Berat</th>
                          <th>Dimensi</th>
                          <th>Status</th>
                          <th>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupVariantsByColor(list).map(group => {
                          const colorImages = imagesOfColor(product.id, group.colorId, group.colorName);
                          const colorVideo = videoOfColor(product.id, group.colorId, group.colorName);
                          const groupKey = colorCollapseKey(product.id, group.key);
                          const isColorCollapsed = collapsedColors[groupKey] ?? false;
                          const groupStock = group.items.reduce((sum, item) => sum + Number(item.stock_qty || 0), 0);
                          const groupMinPrice = group.items.length ? Math.min(...group.items.map(v => finalPrice(v))) : 0;
                          const groupMaxPrice = group.items.length ? Math.max(...group.items.map(v => finalPrice(v))) : 0;
                          const groupSizes = group.items.map(v => sizeLabel(v.sizes)).filter(Boolean).join(", ");
                          const groupActive = group.items.some(v => v.status === "AKTIF");

                          const mediaContent = (
                            <>
                              {colorImages[0]?.image_url ? (
                                <img src={colorImages[0].image_url} alt={`${product.product_name} - ${group.colorName}`} />
                              ) : (
                                <div className="photo-placeholder">Foto</div>
                              )}

                              <label className="upload-mini">
                                Upload Foto
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={e => uploadColorImages(product, group.colorId, group.colorName, e.target.files)}
                                />
                              </label>
                              <small>{colorImages.length}/5 foto</small>

                              {colorImages.length > 0 && (
                                <div className="color-photo-manager">
                                  <div className="color-photo-thumbs">
                                    {colorImages.map((img, imgIndex) => (
                                      <div className="color-photo-thumb" key={img.storage_path || img.image_url || img.id}>
                                        <img src={img.image_url} alt={img.alt_text || `${product.product_name} - ${group.colorName}`} />
                                        <button
                                          type="button"
                                          className="photo-delete-button"
                                          onClick={() => deleteColorImage(product, group.colorId, group.colorName, img)}
                                          title={`Hapus foto ${imgIndex + 1}`}
                                        >
                                           x 
                                        </button>
                                      </div>
                                    ))}
                                  </div>

                                  <button
                                    type="button"
                                    className="mini-delete-link"
                                    onClick={() => deleteAllColorImages(product, group.colorId, group.colorName)}
                                  >
                                    Hapus semua foto
                                  </button>
                                </div>
                              )}

                              <label className="upload-mini video-upload-mini">
                                {colorVideo ? "Ganti Video" : "Upload Video"}
                                <input
                                  type="file"
                                  accept="video/mp4,video/webm,video/quicktime,video/*"
                                  onChange={e => uploadColorVideo(product, group.colorId, group.colorName, e.target.files)}
                                />
                              </label>

                              {colorVideo && (
                                <div className="video-actions-mini">
                                  <a className="video-link" href={colorVideo.video_url} target="_blank" rel="noreferrer">
                                    Lihat video
                                  </a>
                                  <button
                                    type="button"
                                    className="mini-delete-link"
                                    onClick={() => deleteColorVideo(product, group.colorId, group.colorName)}
                                  >
                                    Hapus video
                                  </button>
                                </div>
                              )}

                              <button
                                type="button"
                                className="photo-collapse-button"
                                onClick={() => toggleColorCollapse(product.id, group.key)}
                              >
                                Collapse
                              </button>

                              <small className="shared-photo-note">
                                Media 1 warna untuk semua ukuran {group.colorName}
                              </small>
                            </>
                          );

                          const collapsedPhotoControl = (
                            <div className="collapsed-photo-control">
                              <div className="photo-hidden-icon">Foto</div>
                              <strong>Foto disembunyikan</strong>
                              <small>{colorImages.length}/5 foto{colorVideo ? "  -  1 video" : ""}</small>
                              <button
                                type="button"
                                className="photo-collapse-button"
                                onClick={() => toggleColorCollapse(product.id, group.key)}
                              >
                                Expand
                              </button>
                            </div>
                          );

                          if (isColorCollapsed) {
                            return (
                              <tr key={`${group.key}-collapsed`} className="variant-color-summary-row">
                                <td className="photo-cell merged-photo-cell compact-media-cell collapsed-photo-cell">
                                  {collapsedPhotoControl}
                                </td>
                                <td className="merged-color-cell compact-color-cell">
                                  <div className="color-cell-content">
                                    <strong>{group.colorName}</strong>
                                  </div>
                                </td>
                                <td colSpan={8} className="variant-group-summary">
                                  <strong>{group.items.length} ukuran  -  stok {groupStock}</strong>
                                  <small>Ukuran/Pola: {groupSizes || "-"}</small>
                                  <small>Harga: {group.items.length ? `${formatCurrency(groupMinPrice)} - ${formatCurrency(groupMaxPrice)}` : "-"}</small>
                                  <small>Media: {colorImages.length}/5 foto{colorVideo ? "  -  1 video" : ""}</small>
                                </td>
                                <td>
                                  <span className={`status-pill ${groupActive ? "active" : ""}`}>
                                    {groupActive ? "AKTIF" : "NONAKTIF"}
                                  </span>
                                </td>
                                <td className="action-stack collapse-action-empty" aria-label="Aksi disembunyikan saat warna collapse"></td>
                              </tr>
                            );
                          }

                          return group.items.map((v, rowIndex) => (
                            <tr key={v.id}>
                              {rowIndex === 0 && (
                                <td className="photo-cell merged-photo-cell" rowSpan={group.items.length}>
                                  {mediaContent}
                                </td>
                              )}

                              {rowIndex === 0 && (
                                <td className="merged-color-cell" rowSpan={group.items.length}>
                                  <div className="color-cell-content">
                                    <strong>{group.colorName}</strong>
                                  </div>
                                </td>
                              )}

                              <td>{sizeLabel(v.sizes)}</td>
                              <td>{v.stock_qty}</td>
                              <td>{formatCurrency(v.base_price)}</td>
                              <td>{v.discount_type === "NONE" ? "-" : `${v.discount_value}${v.discount_type === "PERCENT" ? "%" : ""}`}</td>
                              <td><strong>{formatCurrency(finalPrice(v))}</strong></td>
                              <td>{v.sku_variant}</td>
                              <td>{v.weight_gram} gr</td>
                              <td>{v.package_length_cm || 0}  x  {v.package_width_cm || 0}  x  {v.package_height_cm || 0}</td>
                              <td><span className={`status-pill ${v.status === "AKTIF" ? "active" : ""}`}>{v.status}</span></td>
                              <td className="action-stack">
                                <button onClick={() => openEditVariant(product, v)}>Edit</button>
                                <button className="danger" onClick={() => setVariantInactive(v)}>Nonaktifkan</button>
                                <button className="danger solid-danger" onClick={() => hardDeleteVariant(v)}>Hapus</button>
                              </td>
                            </tr>
                          ));
                        })}

                        {list.length === 0 && (
                          <tr>
                            <td colSpan={12}>
                              <div className="empty-state">
                                <h3>Belum ada varian</h3>
                                <p>Klik + Tambah Varian untuk mulai mengisi warna, ukuran, stok, harga, dan foto.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
            </div>
          );
        })}

        {activeProducts.length === 0 && (
          <div className="empty-state">
            <h3>Belum ada produk</h3>
            <p>Klik + Tambah Produk Induk untuk mulai input produk pertama.</p>
            <button className="btn-primary" onClick={openAddProduct}>+ Tambah Produk Induk</button>
          </div>
        )}
      </div>

      {productModal.open && (
        <ProductModal
          data={productModal.data}
          master={master}
          saving={saving}
          onChange={data => setProductModal(prev => ({ ...prev, data }))}
          onClose={() => setProductModal({ open: false, data: emptyProduct })}
          onSave={saveProduct}
        />
      )}

      {variantModal.open && (
        <VariantModal
          data={variantModal.data}
          master={master}
          product={variantModal.product}
          saving={saving}
          onChange={data => setVariantModal(prev => ({ ...prev, data }))}
          onClose={() => setVariantModal({ open: false, data: emptyVariant, product: null })}
          onSave={saveVariant}
        />
      )}

      {toastMessage && (
        <div className="toast-stack" role="status" aria-live="polite">
          <div className={`toast-card ${error ? "toast-error" : "toast-success"}`}>
            <div>
              <strong>{error ? "Perhatian" : saving ? "Memproses" : "Berhasil"}</strong>
              <p>{toastMessage}</p>
            </div>
            {!saving && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
                aria-label="Tutup pesan"
              >
                 x 
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ProductMatrixAutofillField({
  value,
  options,
  getLabel,
  onChange,
  placeholder,
}: {
  value: string | null | undefined;
  options: MasterRow[];
  getLabel: (row: MasterRow) => string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const selected = options.find(row => String(row.id) === String(value || ""));
  const selectedLabel = selected ? getLabel(selected) : "";
  const [text, setText] = useState(selectedLabel);
  const [listId] = useState(() => `pm-autofill-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    setText(selectedLabel);
  }, [selectedLabel]);

  function findExactMatch(label: string) {
    const normalized = String(label || "").trim().toLowerCase();
    if (!normalized) return null;

    return options.find(row => getLabel(row).trim().toLowerCase() === normalized) || null;
  }

  function commit(label: string) {
    const normalized = String(label || "").trim();

    if (!normalized) {
      onChange("");
      setText("");
      return;
    }

    const match = findExactMatch(normalized);
    if (match) {
      onChange(String(match.id));
      setText(getLabel(match));
      return;
    }

    setText(selectedLabel);
  }

  return (
    <div className="product-matrix-autofill">
      <input
        value={text}
        list={listId}
        onChange={event => {
          const next = event.target.value;
          setText(next);
          const match = findExactMatch(next);
          if (match) onChange(String(match.id));
          if (!next.trim()) onChange("");
        }}
        onBlur={() => commit(text)}
        onKeyDown={event => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(text);
          }
        }}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        {options.map(row => {
          const label = getLabel(row);
          return label ? <option key={row.id} value={label} /> : null;
        })}
      </datalist>
    </div>
  );
}
function ProductModal({
  data,
  master,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  data: any;
  master: MasterState;
  saving: boolean;
  onChange: (data: any) => void;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  function setField(key: string, value: any) {
    const next = { ...data, [key]: value };

    if (key === "product_name" && !data.slug) {
      next.slug = slugify(`${value}-${data.sku_product || "AUTO"}`);
    }

    if (key === "sku_product") {
      next.sku_product = String(value || "").toUpperCase();
      if (!data.slug && data.product_name) next.slug = slugify(`${data.product_name}-${value || "AUTO"}`);
    }

    onChange(next);
  }

  const skuPreview = generateSkuPreview(data, master);

  return (
    <div className="modal-backdrop crud-modal-backdrop">
      <div className="crud-modal">
        <div className="modal-title-row">
          <div>
            <h2>{data.id ? "Edit Produk Induk" : "Tambah Produk Induk"}</h2>
            <p>Isi data utama produk. Varian warna/ukuran dibuat setelah produk induk tersimpan.</p>
          </div>
          <button onClick={onClose}> x </button>
        </div>

        <div className="form-grid">
          <label>
            SKU Produk
            <input className="readonly-input" value={skuPreview} readOnly />
            <small className="field-help">SKU dibuat otomatis saat produk disimpan. Anda tidak perlu mengisi manual.</small>
          </label>
          <label>
            Status
            <select value={data.status} onChange={e => setField("status", e.target.value)}>
              <option value="AKTIF">AKTIF</option>
              <option value="DRAFT">DRAFT</option>
              <option value="NONAKTIF">NONAKTIF</option>
              <option value="ARSIP">ARSIP</option>
            </select>
          </label>
          <label className="wide">
            Nama Produk / Judul Listing
            <input value={data.product_name} onChange={e => setField("product_name", e.target.value)} placeholder="Kaos/T-Shirt Premium UrbaNoiD ..." />
          </label>
          <label className="wide">
            Slug
            <input value={data.slug} onChange={e => setField("slug", e.target.value)} placeholder="slug-produk" />
          </label>
          <label>
            Etalase
            <select value={data.showcase_id} onChange={e => setField("showcase_id", e.target.value)}>
              <option value="">- Pilih -</option>
              {master.showcases.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>
            Kategori
            <select value={data.category_id} onChange={e => setField("category_id", e.target.value)}>
              <option value="">- Pilih -</option>
              {master.categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label>
            Bahan
            <ProductMatrixAutofillField
              value={data.material_id}
              options={master.materials}
              getLabel={row => row.name || ""}
              onChange={value => setField("material_id", value)}
              placeholder="Cari bahan..."
            />
          </label>
          <label>
            Gramasi
            <input value={data.gramasi} onChange={e => setField("gramasi", e.target.value)} placeholder="24S" />
          </label>
          <label className="wide">
            Jenis Model
            <ProductMatrixAutofillField
              value={data.model_id}
              options={master.product_models}
              getLabel={row => [row.model_type, row.print_type, row.motif, row.theme].filter(Boolean).join(" / ")}
              onChange={value => setField("model_id", value)}
              placeholder="Cari jenis model..."
            />
          </label>
          <label className="wide">
            Deskripsi
            <textarea value={data.description} onChange={e => setField("description", e.target.value)} rows={4} placeholder="Deskripsi produk..." />
          </label>
        </div>

        <div className="modal-actions crud-modal-actions">
          <button className="btn-primary" disabled={saving} onClick={() => onSave(data)}>Simpan Produk</button>
          <button className="btn-secondary" onClick={onClose}>Batal</button>
        </div>
      </div>
    </div>
  );
}

function VariantModal({
  data,
  master,
  product,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  data: any;
  master: MasterState;
  product?: ProductRow | null;
  saving: boolean;
  onChange: (data: any) => void;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  function setField(key: string, value: any) {
    const next = { ...data, [key]: value };

    const color = master.colors.find(c => c.id === (key === "color_id" ? value : next.color_id));
    const size = master.sizes.find(s => s.id === (key === "size_id" ? value : next.size_id));
    next.variant_name = [color?.name, size?.size_name, size?.pattern_type].filter(Boolean).join(" / ");
    next.sku_variant = generateSkuVariant(product || null, color, size);

    onChange(next);
  }

  const selectedColor = master.colors.find(c => c.id === data.color_id);
  const selectedSize = master.sizes.find(s => s.id === data.size_id);
  const skuVariantPreview = generateSkuVariant(product || null, selectedColor, selectedSize);

  return (
    <div className="modal-backdrop crud-modal-backdrop">
      <div className="crud-modal">
        <div className="modal-title-row">
          <div>
            <h2>{data.id ? "Edit Varian Produk" : "Tambah Varian Produk"}</h2>
            <p>{product?.product_name || "Produk"}</p>
          </div>
          <button onClick={onClose}> x </button>
        </div>

        <div className="form-grid">
          <label>
            Warna
            <ProductMatrixAutofillField
              value={data.color_id}
              options={master.colors}
              getLabel={row => row.name || ""}
              onChange={value => setField("color_id", value)}
              placeholder="Cari warna..."
            />
          </label>
          <label>
            Ukuran / Pola
            <select value={data.size_id} onChange={e => setField("size_id", e.target.value)}>
              <option value="">- Pilih -</option>
              {master.sizes.map(row => <option key={row.id} value={row.id}>{row.size_name} / {row.pattern_type}</option>)}
            </select>
          </label>
          <label className="wide">
            Nama Varian Otomatis
            <input value={data.variant_name} onChange={e => setField("variant_name", e.target.value)} placeholder="Burgundy / M / Regular Fit" />
          </label>
          <label>
            SKU Varian
            <input className="readonly-input" value={skuVariantPreview} readOnly />
            <small className="field-help">SKU varian dibuat otomatis dari SKU produk + warna + ukuran + pola.</small>
          </label>
          <label>
            Status
            <select value={data.status} onChange={e => setField("status", e.target.value)}>
              <option value="AKTIF">AKTIF</option>
              <option value="DRAFT">DRAFT</option>
              <option value="NONAKTIF">NONAKTIF</option>
              <option value="ARSIP">ARSIP</option>
            </select>
          </label>
          <label>
            Stok
            <input type="number" value={data.stock_qty} onChange={e => setField("stock_qty", e.target.value)} />
          </label>
          <label>
            Stok Minimum
            <input type="number" value={data.stock_min} onChange={e => setField("stock_min", e.target.value)} />
          </label>
          <label>
            Harga Default
            <input type="number" value={data.base_price} onChange={e => setField("base_price", e.target.value)} />
          </label>
              <label>
                HPP / Unit
                <input
                  type="number"
                  min={0}
                  value={data.hpp_cost}
                  onChange={e => setField("hpp_cost", e.target.value)}
                  placeholder="Biaya produksi per unit"
                />
              </label>
          <label>
            Tipe Diskon
            <select value={data.discount_type} onChange={e => setField("discount_type", e.target.value)}>
              <option value="NONE">Tanpa Diskon</option>
              <option value="PERCENT">Persen</option>
              <option value="AMOUNT">Nominal</option>
            </select>
          </label>
          <label>
            Nilai Diskon
            <input type="number" value={data.discount_value} onChange={e => setField("discount_value", e.target.value)} />
          </label>
          <label>
            Harga Akhir Preview
            <input value={formatCurrency(finalPrice(data))} readOnly />
          </label>
          <label>
            Mulai Diskon
            <input type="date" value={data.discount_start || ""} onChange={e => setField("discount_start", e.target.value)} />
          </label>
          <label>
            Akhir Diskon
            <input type="date" value={data.discount_end || ""} onChange={e => setField("discount_end", e.target.value)} />
          </label>
          <label>
            Berat Produk (gr)
            <input type="number" value={data.weight_gram} onChange={e => setField("weight_gram", e.target.value)} />
          </label>
          <label>
            Panjang Paket (cm)
            <input type="number" value={data.package_length_cm} onChange={e => setField("package_length_cm", e.target.value)} />
          </label>
          <label>
            Lebar Paket (cm)
            <input type="number" value={data.package_width_cm} onChange={e => setField("package_width_cm", e.target.value)} />
          </label>
          <label>
            Tinggi Paket (cm)
            <input type="number" value={data.package_height_cm} onChange={e => setField("package_height_cm", e.target.value)} />
          </label>
        </div>

        <div className="modal-actions crud-modal-actions">
          <button className="btn-primary" disabled={saving} onClick={() => onSave(data)}>Simpan Varian</button>
          <button className="btn-secondary" onClick={onClose}>Batal</button>
        </div>
      </div>
    </div>
  );
}

