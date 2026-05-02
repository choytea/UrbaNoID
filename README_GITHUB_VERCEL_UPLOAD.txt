# UrbaNoiD Supabase Native — GitHub Ready Vercel Package

Paket ini adalah paket bersih untuk GitHub/Vercel.

PENTING:
Upload ISI folder hasil extract ke root repository GitHub, bukan folder ZIP-nya dan bukan folder REPLACE_ONLY.

Struktur root repository harus terlihat seperti ini:

- package.json
- index.html
- vite.config.ts
- tsconfig.json
- vercel.json
- src/
  - main.tsx
  - App.tsx
  - styles.css
  - components/
  - pages/
  - lib/

Jika Vercel error:
Failed to resolve /src/main.tsx from /vercel/path0/index.html

Artinya file src/main.tsx belum ada di root repository GitHub yang dibuild oleh Vercel.

Vercel Settings:
- Framework Preset: Vite
- Build Command: npm run build
- Output Directory: dist

Environment Variables:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
