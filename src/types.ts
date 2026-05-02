export type AppRole = "ADMIN" | "SELLER" | "BUYER";
export type AppStatus = "AKTIF" | "NONAKTIF" | "DRAFT" | "ARSIP";

export type Profile = {
  id: string;
  role: AppRole;
  username: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  address_line: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_active: boolean;
};

export type CatalogVariant = {
  variant_id: string;
  sku_variant: string;
  color_id?: string | null;
  color_name: string | null;
  hex_code: string | null;
  size_name: string | null;
  pattern_type: string | null;
  stock_qty: number;
  base_price: number;
  final_price: number;
  weight_gram: number;
  package_length_cm: number | null;
  package_width_cm: number | null;
  package_height_cm: number | null;
};

export type CatalogImage = {
  image_id: string;
  variant_id: string | null;
  color_id: string | null;
  image_url: string;
  sort_order: number;
  is_primary: boolean;
  alt_text: string | null;
};

export type CatalogVideo = {
  id: string;
  product_id: string;
  color_id: string | null;
  color_name: string | null;
  video_url: string;
  storage_path: string | null;
  title?: string | null;
};

export type BuyerCatalogProduct = {
  product_id: string;
  sku_product: string;
  product_name: string;
  slug: string;
  description: string | null;
  gramasi: string | null;
  status: AppStatus;
  showcase_name: string | null;
  category_name: string | null;
  material_name: string | null;
  model_type: string | null;
  print_type: string | null;
  motif: string | null;
  theme: string | null;
  total_variants: number;
  total_stock: number;
  min_price: number | null;
  max_price: number | null;
  primary_image_url: string | null;
  variants: CatalogVariant[];
  images: CatalogImage[];
  videos: CatalogVideo[];
};


