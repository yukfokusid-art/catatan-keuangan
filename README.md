# FotoHD Instant Enhancer

Website statis untuk membuat foto terlihat lebih HD langsung di browser.

## Fitur

- Upload foto JPG, PNG, atau WEBP.
- Upscale 2x, 3x, atau 4x.
- Smart sharpen berbasis Canvas.
- Pengaturan brightness, contrast, saturation, dan sharpness.
- Preview before/after dengan slider.
- Download hasil dalam PNG, JPG, atau WEBP.
- Tidak membutuhkan backend/database.
- Cocok deploy di Cloudflare Pages.

## Cara Deploy ke Cloudflare Pages

1. Extract file ZIP ini.
2. Masuk ke Cloudflare Dashboard.
3. Buka **Workers & Pages**.
4. Pilih **Create application** > **Pages**.
5. Upload folder hasil extract.
6. Deploy.

## Catatan Penting

Website ini melakukan peningkatan kualitas berbasis browser: upscale, sharpen, contrast, brightness, dan saturation. Ini bukan AI super-resolution server-side, jadi foto yang sangat rusak atau blur parah tetap memiliki batas hasil.

Jika ingin hasil seperti AI enhancer sungguhan, perlu integrasi API/model AI tambahan seperti Replicate, Stability AI, atau model super-resolution lain.
