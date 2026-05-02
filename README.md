# UrbaNoiD Supabase Native Starter App v1.0

Starter app ini adalah Fase 2B untuk mulai membangun ulang UrbaNoiD dari nol dengan Supabase Native.

## Isi fitur awal

- Login/register buyer/seller via Supabase Auth.
- Deteksi role dari `public.profiles`.
- Halaman Buyer Catalog membaca `public.v_buyer_catalog`.
- Modal detail produk dengan pilihan warna, ukuran/pola, gambar, stok, harga.
- Halaman Seller Dashboard membaca ringkasan produk/order/stok.
- Halaman Master Data membaca etalase, kategori, bahan, warna, ukuran, dan model.
- Halaman Product Matrix awal untuk menampilkan produk dan varian dari Supabase.
- SQL tambahan grant API agar tabel/view bisa diakses melalui Supabase client dengan tetap dikontrol RLS.

## Setup

1. Pastikan SQL clean install v1.0.2 sudah berhasil.
2. Pastikan user admin sudah punya `role = 'ADMIN'` di `public.profiles`.
3. Jalankan SQL:
   `supabase_sql/04_grants_for_supabase_api.sql`
4. Copy `.env.example` menjadi `.env.local`.
5. Isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Jalankan:

```bash
npm install
npm run dev
```

Buka:
- `http://localhost:5173/#/buyer`
- `http://localhost:5173/#/seller`

## Catatan keamanan

Jangan pernah memasukkan `service_role` key ke frontend. Gunakan hanya `anon public key`.
