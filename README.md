# River Guard

Sistem pemantauan kekeruhan **air sungai** berbasis IoT. Sensor turbidity **DFRobot SEN0189** dibaca oleh **ESP32**, datanya dikirim ke **Supabase** lewat REST API, lalu ditampilkan pada dashboard web **Next.js** beserta indikator kualitas yang mengacu pada baku mutu air sungai nasional.

## Daftar isi

- [Arsitektur](#arsitektur)
- [Fitur](#fitur)
- [Dasar klasifikasi](#dasar-klasifikasi)
- [Perangkat keras](#perangkat-keras)
- [Firmware ESP32](#firmware-esp32)
- [Database Supabase](#database-supabase)
- [Dashboard web](#dashboard-web)
- [Kalibrasi NTU ke TSS](#kalibrasi-ntu-ke-tss)
- [Pengujian di Cirkit](#pengujian-di-cirkit)
- [Keterbatasan](#keterbatasan)
- [Status pengembangan](#status-pengembangan)
- [Referensi](#referensi)

## Arsitektur

![Arsitektur River Guard](C:\Users\bbros\Downloads\turbidity_twin\mytoren\public\arsitektur.svg)

Alur singkat:

1. ESP32 membaca tegangan sensor (median dari beberapa sampel ADC, lalu divalidasi rentangnya).
2. Tegangan dikonversi menjadi NTU dan dikirim ke tabel `readings` secara berkala.
3. Dashboard mengambil data, mengestimasi TSS dari NTU memakai koefisien kalibrasi lokasi, lalu menampilkan indikator kelas dan peringatan kenaikan mendadak.

## Fitur

- Pembacaan kekeruhan (NTU), ADC mentah, dan tegangan.
- Estimasi TSS (mg/L) dari NTU, dibandingkan dengan baku mutu TSS sungai pada PP 22/2021.
- Peringatan kenaikan kekeruhan mendadak terhadap kondisi dasar (mis. akibat hujan, erosi, atau pembuangan).
- Grafik tren (1H/6H/24H/7D), tabel riwayat, ekspor CSV, indikator online/offline perangkat.
- Pengiriman memakai koneksi HTTPS yang dipakai ulang, jadwal berbasis `millis()`, dan reconnect Wi-Fi tanpa memblokir.

## Dasar klasifikasi

### Tidak ada baku mutu NTU untuk sungai di Indonesia

Baku mutu air sungai nasional diatur dalam **PP No. 22 Tahun 2021, Lampiran VI** (Baku Mutu Air Nasional, bagian I: air sungai dan sejenisnya). Lampiran tersebut **tidak menetapkan nilai batas kekeruhan (NTU)** untuk sungai. Parameter fisik yang terkait adalah **padatan tersuspensi total (TSS)** dan **warna**:

| Parameter | Satuan | Kelas I | Kelas II | Kelas III | Kelas IV |
|---|---|---|---|---|---|
| TSS | mg/L | 40 | 50 | 100 | 400 |
| Warna | Pt-Co | 15 | 50 | 100 | - |

Catatan: batas TSS tidak berlaku untuk air gambut (berdasarkan kondisi alaminya).

Peruntukan kelas menurut peraturan:

| Kelas | Peruntukan (ringkas) |
|---|---|
| I | Air baku air minum dan peruntukan lain yang setara |
| II | Prasarana/sarana rekreasi air, budidaya ikan air tawar, peternakan, irigasi |
| III | Budidaya ikan air tawar, peternakan, irigasi |
| IV | Irigasi |

Karena turbidity sensor mengukur NTU (sifat optik) dan bukan TSS (massa partikel per liter), proyek ini memakai pendekatan **NTU → estimasi TSS → indikator kelas**:

```
TSS_est (mg/L) = a × NTU + b      (a, b dari kalibrasi lokasi)
```

Hubungan NTU-TSS bersifat **spesifik lokasi** (tergantung jenis partikel, ukuran, warna, dan musim) dan tidak ada hubungan universal. Karena itu koefisien `a` dan `b` harus ditentukan dari sampel sungai yang dipantau (lihat [Kalibrasi NTU ke TSS](#kalibrasi-ntu-ke-tss)).

### Indikator pada dashboard

| Indikator | TSS estimasi | Dasar |
|---|---|---|
| Kelas I | ≤ 40 mg/L | PP 22/2021 |
| Kelas II | > 40 sampai 50 mg/L | PP 22/2021 |
| Kelas III | > 50 sampai 100 mg/L | PP 22/2021 |
| Kelas IV | > 100 sampai 400 mg/L | PP 22/2021 |
| Melampaui | > 400 mg/L | Di atas batas Kelas IV |

Peringatan penting:

- Ini adalah **indikator berdasarkan satu parameter**. Penetapan kelas atau status mutu air sungai yang sebenarnya membutuhkan banyak parameter (fisika, kimia, mikrobiologi) dan metode penilaian resmi (mis. Pedoman Penentuan Status Mutu Air, Kepmen LH No. 115 Tahun 2003). Dashboard tidak boleh dibaca sebagai penetapan status mutu.
- Batas Kelas I (40) dan Kelas II (50) hanya berjarak 10 mg/L. Sensor SEN0189 kemungkinan tidak dapat memisahkannya secara andal. Opsi: tampilkan keduanya sebagai satu level "Kelas I-II (≤ 50 mg/L)".
- Permenkes No. 2 Tahun 2023 (kekeruhan < 3 NTU) adalah baku mutu **air minum dan air higiene sanitasi**, bukan baku mutu sungai. Angka itu tidak dipakai untuk sungai.

### Deteksi kenaikan mendadak (acuan internasional)

Beberapa pedoman luar negeri mengatur kekeruhan sebagai **kenaikan terhadap kondisi dasar (background)**, bukan angka mutlak. Contohnya CCME (Kanada, 1999) untuk perlindungan biota air tawar:

- Aliran jernih: kenaikan maksimum 8 NTU dari background untuk paparan jangka pendek (± 24 jam), dan rata-rata kenaikan maksimum 2 NTU untuk jangka lebih panjang (± 30 hari).
- Aliran tinggi atau air keruh: kenaikan maksimum 8 NTU bila background 8-80 NTU, dan tidak lebih dari 10% dari background bila background > 80 NTU.

Proyek ini mengadaptasi aturan tersebut sebagai **peringatan kejadian**, bukan sebagai baku mutu Indonesia:

| Kondisi | Peringatan jika |
|---|---|
| Background ≤ 80 NTU | NTU saat ini > background + 8 |
| Background > 80 NTU | NTU saat ini > background × 1,1 |

`background` = median NTU 24 jam sebelumnya. Agar tidak berkedip, peringatan baru aktif bila kondisi terpenuhi pada beberapa pembacaan berturut-turut (mis. 3).

Sebagai konteks, panduan ANZECC (2000) untuk sungai di Selandia Baru memakai nilai pemicu kekeruhan < 5,6 NTU (sungai dataran rendah) dan < 4,1 NTU (sungai dataran tinggi). Nilai ini untuk kondisi sungai Selandia Baru dan tidak otomatis sesuai dengan sungai di Indonesia.

## Perangkat keras

| Komponen | Keterangan |
|---|---|
| ESP32 | ADC 12-bit, Wi-Fi |
| DFRobot SEN0189 | Catu 5 V, output analog sekitar 4,1 ± 0,3 V di air murni, tegangan turun saat kekeruhan naik |
| Pembagi tegangan | Menurunkan output sensor agar aman untuk ADC ESP32 (maks 3,3 V). `DIV_RATIO = 0.6`, contoh R1 = 2 kΩ dan R2 = 3 kΩ |

Pengkabelan:

| Dari | Ke |
|---|---|
| SEN0189 VCC | 5 V |
| SEN0189 GND | GND |
| SEN0189 AOUT | Pembagi tegangan, lalu pin ADC (`TURBIDITY_PIN`) |

> **Pin ADC.** `TURBIDITY_PIN = 1` cocok untuk ESP32-S3/C3. Pada ESP32 klasik, GPIO1 adalah TX serial, gunakan GPIO34 atau GPIO35.

Pertimbangan pemasangan di sungai (belum diuji):

- Rentang sensor sekitar 0-3000 NTU sudah sesuai dengan sungai, yang kekeruhannya bisa melonjak saat hujan.
- Pasang probe pada kedalaman dan posisi yang konsisten, jauh dari dasar (sedimen) dan permukaan (gelembung, sampah).
- Lindungi bagian elektronik dari air dan cek spesifikasi bagian sensor yang boleh terendam.
- Probe akan terlapisi kotoran (biofilm). Bersihkan berkala dan periksa pergeseran baseline.
- Lokasi lapangan umumnya tidak punya Wi-Fi. Pertimbangkan hotspot seluler atau modul GSM, dan catu daya mandiri (panel surya).

## Firmware ESP32

Arduino framework dengan library `WiFi`, `WiFiClientSecure`, `HTTPClient` (bawaan paket board ESP32).

Konfigurasi utama:

| Konstanta | Fungsi | Nilai awal |
|---|---|---|
| `WIFI_SSID`, `WIFI_PASSWORD` | Kredensial Wi-Fi | `CirkitWifi` / kosong (simulasi) |
| `SUPABASE_URL`, `SUPABASE_KEY` | Endpoint dan key publik | isi milikmu sendiri |
| `DEVICE_ID` | Identitas stasiun | `sungai-01` |
| `TURBIDITY_PIN` | Pin ADC sensor | lihat perangkat keras |
| `INTERVAL_MS` | Jeda antar kirim | 3000 (simulasi), 30000-60000 (lapangan) |
| `V_CLEAR`, `SLOPE`, `DIV_RATIO` | Konversi tegangan ke NTU | model linear Cirkit, kalibrasi ulang untuk sensor asli |
| `NTU_MAX` | Batas atas NTU | 3000 |
| `TSS_A`, `TSS_B` | Koefisien estimasi TSS | **placeholder 1,0 dan 0,0** (hanya untuk simulasi) |

> **Keamanan.** Jangan commit `SUPABASE_KEY` asli ke repositori publik. Jika sempat terpublikasi, rotate di dashboard Supabase.

Format data yang dikirim:

```json
{
  "device_id": "sungai-01",
  "adc_raw": 1830,
  "voltage": 1.4752,
  "ntu": 120.5,
  "tss_est": 120.5,
  "status": "Kelas IV"
}
```

`voltage` adalah tegangan pada pin ADC (setelah pembagi tegangan), bukan tegangan sensor.

## Database Supabase

```sql
create table public.readings (
  id         bigint generated always as identity primary key,
  created_at timestamptz  not null default now(),
  device_id  text         not null,
  adc_raw    integer      not null,
  voltage    numeric(6,4) not null,
  ntu        numeric(7,1) not null,
  tss_est    numeric(8,1),
  status     text         not null
);

create index readings_device_time_idx
  on public.readings (device_id, created_at desc);

alter table public.readings enable row level security;

create policy "anon can insert readings"
  on public.readings for insert to anon with check (true);

create policy "anon can read readings"
  on public.readings for select to anon using (true);
```

Jika tabel dari versi toren sudah ada, cukup tambahkan kolom:

```sql
alter table public.readings add column tss_est numeric(8,1);
```

Policy di atas membuat data dapat dibaca dan ditulis siapa pun yang memegang key publik. Ini dapat diterima untuk tugas kuliah, tetapi tidak untuk produksi.

**Skala data.** Dengan interval 30-60 detik, rentang 7 hari menghasilkan ribuan baris. Untuk rentang panjang, buat view agregat per jam (`date_trunc`) agar dashboard tidak menarik ribuan baris sekaligus.

## Dashboard web

Next.js (App Router, TypeScript), polling REST ke Supabase.

```bash
npm install
cp .env.example .env.local   # lalu isi dua variabel di bawah
npm run dev
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
```

Tanpa dua variabel di atas, dashboard berjalan dalam mode preview dengan data simulasi.

Perilaku penting:

- Perangkat dianggap **offline** bila data terakhir lebih tua dari sekitar 3× interval kirim.
- Estimasi TSS dan indikator kelas dihitung di dashboard dari NTU (satu sumber kebenaran), sehingga koefisien kalibrasi dapat diperbarui tanpa memprogram ulang perangkat.
- Rentang grafik mengambil data sesuai rentang waktu yang dipilih.

## Kalibrasi NTU ke TSS

Hubungan NTU-TSS umumnya didekati dengan regresi linear, tetapi tidak ada hubungan universal dan hubungannya cenderung lebih lemah pada kekeruhan rendah (di bawah sekitar 25 NTU pada salah satu studi). Langkah yang disarankan:

1. Pada lokasi sungai yang sama, ambil beberapa **sampel berpasangan**: catat pembacaan NTU sensor saat pengambilan, lalu bawa sampel ke laboratorium untuk uji **TSS (gravimetri)**.
2. Kumpulkan titik pada berbagai kondisi: aliran normal dan setelah hujan. Prosedur Alberta Transportation menyarankan idealnya sekitar 5 titik di bawah 15 NTU dan minimal 5 titik tambahan sampai sekitar 500 NTU.
3. Lakukan regresi linear `TSS = a × NTU + b`, periksa R², lalu isi `TSS_A` dan `TSS_B` (firmware) serta konstanta yang sama di dashboard.
4. Ulangi kalibrasi per musim atau setelah probe dibersihkan atau diganti.

Selama kalibrasi lokasi belum dilakukan, nilai `TSS_A = 1,0` dan `TSS_B = 0,0` hanyalah **asumsi sementara untuk simulasi**, bukan hasil studi.

Selain itu, konversi tegangan ke NTU pada sensor asli juga harus dikalibrasi. Model linear Cirkit (`V_CLEAR = 3,9994`, `SLOPE = -0,0008`) tidak berlaku untuk SEN0189 asli, yang kurva resminya berbentuk polinomial dan bervariasi antar unit.

## Pengujian di Cirkit

Dengan `TSS_A = 1,0` dan `TSS_B = 0,0` (TSS estimasi sama dengan NTU), uji dengan nilai yang tidak persis di batas karena satu langkah ADC setara sekitar 1,7 NTU:

| Slider NTU | Ekspektasi |
|---|---|
| 0, 30 | Kelas I |
| 45 | Kelas II |
| 80 | Kelas III |
| 200, 350 | Kelas IV |
| 500, 1000, 3000 | Melampaui |

Uji juga peringatan kenaikan mendadak: biarkan slider di 20 NTU beberapa saat, lalu naikkan ke 40 NTU (kenaikan > 8 NTU di atas background ≤ 80 NTU).

## Keterbatasan

- Pengembangan dan pengujian baru dilakukan di **simulator**. Akurasi pada hardware asli belum diketahui.
- SEN0189 adalah sensor murah dan cocok sebagai **indikator tren**, bukan alat ukur terkalibrasi. Output di air murni bervariasi antar unit (4,1 ± 0,3 V).
- TSS adalah **estimasi** dari NTU. Akurasinya bergantung pada kualitas kalibrasi lokasi, dan menurun pada kekeruhan rendah.
- Satu parameter tidak cukup untuk menetapkan kelas atau status mutu air sungai.
- Peringatan kenaikan mendadak mengadaptasi pedoman luar negeri (CCME), bukan peraturan Indonesia.
- Fouling probe, gelembung, sampah, dan sinar matahari dapat mengganggu pembacaan di lapangan.
- `client.setInsecure()` melewati verifikasi sertifikat TLS (cukup untuk simulasi). RLS pada skema di atas terbuka untuk pemegang key publik.

## Status pengembangan

- [x] Prototipe simulasi Cirkit untuk pemantauan air toren (ambang Permenkes).
- [ ] Firmware: klasifikasi berbasis estimasi TSS, median sampel, validasi rentang, `DEVICE_ID` sungai.
- [ ] Database: kolom `tss_est`, indeks per `device_id`.
- [ ] Dashboard: ubah teks dan visual dari toren ke sungai, indikator kelas PP 22/2021, peringatan kenaikan mendadak, grafik skala log.
- [ ] Kalibrasi NTU-TSS dengan sampel lapangan dan uji laboratorium.
- [ ] Uji hardware asli dan kalibrasi tegangan ke NTU.

## Referensi

- Peraturan Pemerintah No. 22 Tahun 2021, Lampiran VI: Baku Mutu Air Nasional. https://lh.gunungkidulkab.go.id/wp-content/uploads/2024/08/97Lampiran-VI-Salinan-PP-Nomor-22-Tahun-2021.pdf
- CCME. *Turbidity (Canadian Water Quality Guidelines for the Protection of Aquatic Life)*, 1999. https://ccme.ca/en/chemical/219
- ANZECC (2000), nilai pemicu sungai Selandia Baru, sebagaimana dirangkum Northland Regional Council. https://nrc.govt.nz/resource-library-summary/research-and-reports/rivers-and-streams/2006-states-and-trends-of-northland-rivers/methods
- Alberta Transportation. *Conversion of Nephelometric Turbidity Units into mg/L.* https://www.alberta.ca/system/files/custom_downloaded_images/tr-conversion-of-nephelometric-turbidity-units.pdf
- Estimasi TSS dari kekeruhan di DAS Doce (tidak ada model tunggal yang universal). https://scielo.br/j/eagri/a/K7tdPbhZBc5JHBKcgPTrjvs/?lang=en
- Hakim dkk. (2019). *Characterization of turbidity water sensor SEN0189 on the changes of total suspended solids in the water.* J. Phys.: Conf. Ser. 1280, 022064. https://doi.org/10.1088/1742-6596/1280/2/022064
- DFRobot. *Turbidity Sensor SKU SEN0189 (wiki).* https://wiki.dfrobot.com/Turbidity_sensor_SKU__SEN0189
- Permenkes No. 2 Tahun 2023 (baku mutu air minum dan air higiene sanitasi; **tidak berlaku sebagai baku mutu sungai**). https://peraturan.bpk.go.id/Details/245563/permenkes-no-2-tahun

## Lisensi

Proyek kuliah. Tentukan lisensi sesuai kebutuhan sebelum dipublikasikan.