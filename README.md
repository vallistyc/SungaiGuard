# Toren Guard

Dashboard pemantauan kekeruhan air toren dengan Next.js. Halaman menampilkan pembacaan sensor terkini, tren NTU, ringkasan statistik, ambang kualitas, dan riwayat yang dapat diekspor ke CSV.

## Menjalankan aplikasi

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Menghubungkan Supabase

Buat file `.env.local` di folder proyek:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Dashboard membaca tabel `readings` dengan kolom `created_at`, `ntu`, `adc_raw`, `voltage`, dan `status`. Kolom `id` opsional. Pastikan Row Level Security dan policy tabel mengizinkan key publik membaca data yang memang aman untuk dashboard.

Tanpa kedua variabel tersebut, aplikasi berjalan dalam **mode preview** dengan data simulasi yang ditandai dengan jelas. Pembacaan Supabase diperbarui otomatis setiap 3 detik; perangkat ditandai offline jika data terakhir lebih lama dari 30 detik.

## Ambang kualitas

- **Jernih:** sampai dengan 3 NTU
- **Agak keruh:** di atas 3 sampai dengan 25 NTU
- **Keruh:** di atas 25 NTU

Ambang ini harus disamakan dengan nilai yang digunakan pada sketch perangkat sensor.

## Pemeriksaan

```bash
npm run lint
npm run build
```
