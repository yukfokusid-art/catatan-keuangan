# UangKu KV - Cloudflare Workers Finance Tracker

Website catatan keuangan pribadi yang berjalan di Cloudflare Workers dan menyimpan data di Cloudflare KV.

## Fitur

- Total saldo semua kas/dompet/bank/e-wallet
- Tambah/edit/hapus kas
- Input pengeluaran cepat
- Input pemasukan
- Transfer antar kas
- Riwayat transaksi + pencarian
- Ringkasan pemasukan/pengeluaran bulan ini
- Grafik ringan tanpa library eksternal
- Export/import backup JSON
- Auto-sync beberapa detik sekali antar perangkat melalui Cloudflare KV
- Login sederhana dengan Nama Gudang + PIN Gudang
- Semua code dalam satu file `worker.js`

## Cara deploy lewat Cloudflare Dashboard

1. Masuk Cloudflare Dashboard.
2. Buka **Workers & Pages**.
3. Buat atau buka Worker kamu.
4. Hapus semua isi `worker.js` lama.
5. Copy isi file `worker.js` dari ZIP ini, lalu paste ke editor Cloudflare Worker.
6. Jangan deploy dulu kalau binding KV belum ada.

## Buat KV Namespace

1. Di Cloudflare Dashboard, buka **Storage & Databases** / **KV**.
2. Klik **Create namespace**.
3. Beri nama misalnya `uangku_finance_kv`.
4. Buka Worker kamu > **Settings** > **Bindings**.
5. Tambahkan **KV Namespace Binding**.
6. Variable name wajib: `FINANCE_KV`
7. Pilih namespace KV yang tadi kamu buat.
8. Simpan.
9. Kembali ke editor Worker, klik **Deploy**.
10. Klik **Visit**.

Kalau muncul pesan `KV_BINDING_MISSING`, berarti binding belum dipasang atau namanya bukan `FINANCE_KV`.

## Cara login

- Nama gudang: bebas, contoh `keuangan-pribadi`
- PIN gudang: bebas, minimal 4 karakter
- Pakai nama gudang + PIN yang sama di HP/laptop agar data yang muncul sama.

Catatan: Ini sistem login sederhana untuk penggunaan pribadi. Jangan bagikan URL + Nama Gudang + PIN ke orang lain.

## Deploy via Wrangler optional

Lihat file `wrangler.toml.example`. Ganti `id` KV namespace sesuai akun Cloudflare kamu.

