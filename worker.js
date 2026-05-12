export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/ping") {
      return jsonResponse({ ok: true, time: new Date().toISOString() });
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    return new Response(HTML, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
};

async function handleApi(request, env) {
  try {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (!env || !env.FINANCE_KV) {
      return jsonResponse({
        ok: false,
        error: "KV_BINDING_MISSING",
        message: "Binding KV belum ada. Buat KV Namespace lalu pasang binding dengan variable name FINANCE_KV."
      }, 500);
    }

    const url = new URL(request.url);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ ok: false, error: "INVALID_JSON" }, 400);
    }

    const workspace = cleanWorkspace(body.workspace);
    const pin = String(body.pin || "").trim();
    if (!workspace || !pin) {
      return jsonResponse({ ok: false, error: "AUTH_REQUIRED", message: "Nama gudang dan PIN wajib diisi." }, 400);
    }

    const key = await dataKey(workspace, pin);

    if (url.pathname === "/api/load") {
      const record = await env.FINANCE_KV.get(key, { type: "json" });
      return jsonResponse({
        ok: true,
        exists: Boolean(record),
        workspace,
        revision: record && Number(record.revision || 0) || 0,
        updatedAt: record && record.updatedAt || null,
        data: record && record.data || null
      });
    }

    if (url.pathname === "/api/save") {
      const validation = validateFinanceData(body.data);
      if (!validation.ok) {
        return jsonResponse({ ok: false, error: "INVALID_DATA", message: validation.message }, 400);
      }

      const current = await env.FINANCE_KV.get(key, { type: "json" });
      const revision = current && Number(current.revision || 0) ? Number(current.revision || 0) + 1 : 1;
      const record = {
        revision,
        updatedAt: new Date().toISOString(),
        data: body.data
      };

      await env.FINANCE_KV.put(key, JSON.stringify(record));

      return jsonResponse({
        ok: true,
        workspace,
        revision: record.revision,
        updatedAt: record.updatedAt
      });
    }

    if (url.pathname === "/api/reset") {
      await env.FINANCE_KV.delete(key);
      return jsonResponse({ ok: true, workspace, deleted: true });
    }

    return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404);
  } catch (error) {
    return jsonResponse({ ok: false, error: "SERVER_ERROR", message: String(error && error.message || error) }, 500);
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json;charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function cleanWorkspace(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function dataKey(workspace, pin) {
  const hash = await sha256Hex(workspace + ":" + pin);
  return "finance:v2:" + hash;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validateFinanceData(data) {
  if (!data || typeof data !== "object") return { ok: false, message: "Data kosong." };
  if (!Array.isArray(data.wallets)) return { ok: false, message: "wallets harus array." };
  if (!Array.isArray(data.transactions)) return { ok: false, message: "transactions harus array." };

  const size = JSON.stringify(data).length;
  if (size > 2_000_000) return { ok: false, message: "Data terlalu besar. Export backup lalu bersihkan riwayat lama." };

  for (const wallet of data.wallets) {
    if (!wallet || typeof wallet !== "object") return { ok: false, message: "Format kas tidak valid." };
    if (!wallet.id || !wallet.name) return { ok: false, message: "Kas wajib punya id dan nama." };
    wallet.balance = Number(wallet.balance || 0);
  }

  for (const tx of data.transactions) {
    if (!tx || typeof tx !== "object") return { ok: false, message: "Format transaksi tidak valid." };
    if (!tx.id || !tx.type || !tx.title) return { ok: false, message: "Transaksi wajib punya id, type, dan title." };
    tx.amount = Math.max(0, Number(tx.amount || 0));
  }

  return { ok: true };
}

const HTML = String.raw`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#06121f">
  <title>UangKu KV - Catatan Keuangan Realtime</title>
  <style>
    :root {
      --bg: #06121f;
      --bg2: #081827;
      --card: rgba(255,255,255,.085);
      --line: rgba(255,255,255,.12);
      --text: #f7fbff;
      --muted: rgba(247,251,255,.68);
      --soft: rgba(247,251,255,.42);
      --green: #5ef0a5;
      --blue: #70b8ff;
      --red: #ff6b7a;
      --orange: #ffc36b;
      --purple: #b992ff;
      --shadow: 0 28px 80px rgba(0,0,0,.38);
      --safe: env(safe-area-inset-bottom, 0px);
    }

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 0%, rgba(112,184,255,.24), transparent 34%),
        radial-gradient(circle at 90% 0%, rgba(94,240,165,.16), transparent 32%),
        radial-gradient(circle at 45% 90%, rgba(185,146,255,.12), transparent 35%),
        linear-gradient(145deg, var(--bg), #08101c 58%, #050911);
      overflow-x: hidden;
    }

    body:before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
      background-size: 42px 42px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,.75), transparent 82%);
    }

    button, input, select { font: inherit; }
    button { border: 0; cursor: pointer; }
    input, select { outline: none; }

    .app {
      width: min(1180px, 100%);
      margin: 0 auto;
      padding: 18px 16px 112px;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 50;
      margin: -18px -16px 18px;
      padding: 14px 16px 10px;
      background: linear-gradient(to bottom, rgba(6,18,31,.92), rgba(6,18,31,.48));
      border-bottom: 1px solid rgba(255,255,255,.07);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    }

    .topbar-inner {
      width: min(1180px, 100%);
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .logo {
      width: 43px;
      height: 43px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      color: #03101c;
      background: linear-gradient(145deg, var(--green), var(--blue));
      box-shadow: 0 14px 34px rgba(94,240,165,.18);
      font-weight: 950;
    }
    .brand h1 { margin: 0; font-size: 18px; letter-spacing: -.03em; }
    .brand p { margin: 2px 0 0; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .top-actions { display: flex; gap: 8px; align-items: center; }

    .btn, .main-btn, .danger-btn, .mini-btn, .status-pill {
      min-height: 43px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text);
      user-select: none;
      white-space: nowrap;
      transition: transform .16s ease, background .16s ease, opacity .16s ease;
    }
    .btn:active, .main-btn:active, .danger-btn:active, .mini-btn:active { transform: scale(.97); }
    .btn, .status-pill {
      padding: 0 15px;
      background: rgba(255,255,255,.085);
      border: 1px solid var(--line);
    }
    .status-pill { font-size: 12px; color: var(--muted); min-height: 38px; }
    .dot { width: 8px; height: 8px; border-radius: 99px; background: var(--orange); box-shadow: 0 0 18px rgba(255,195,107,.5); }
    .status-pill.ok .dot { background: var(--green); box-shadow: 0 0 18px rgba(94,240,165,.55); }
    .status-pill.bad .dot { background: var(--red); box-shadow: 0 0 18px rgba(255,107,122,.55); }
    .btn:hover { background: rgba(255,255,255,.13); }
    .main-btn {
      min-height: 49px;
      padding: 0 18px;
      color: #03101c;
      font-weight: 900;
      background: linear-gradient(135deg, var(--green), var(--blue));
      box-shadow: 0 18px 38px rgba(94,240,165,.16);
    }
    .danger-btn {
      padding: 0 14px;
      color: #ffd8dd;
      background: rgba(255,107,122,.12);
      border: 1px solid rgba(255,107,122,.25);
    }
    .mini-btn {
      min-height: 34px;
      padding: 0 10px;
      font-size: 12px;
      background: rgba(255,255,255,.085);
      border: 1px solid rgba(255,255,255,.11);
    }

    .grid-hero {
      display: grid;
      grid-template-columns: 1.08fr .92fr;
      gap: 16px;
      align-items: stretch;
    }

    .grid-section {
      display: grid;
      grid-template-columns: .92fr 1.08fr;
      gap: 16px;
      margin-top: 16px;
    }

    .card {
      position: relative;
      overflow: hidden;
      border-radius: 26px;
      background: linear-gradient(145deg, rgba(255,255,255,.105), rgba(255,255,255,.055));
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .card:after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(120deg, rgba(255,255,255,.14), transparent 32%, transparent 76%, rgba(255,255,255,.05));
      opacity: .58;
    }
    .card > * { position: relative; z-index: 1; }

    .balance-card {
      min-height: 292px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .eyebrow { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
    .big-balance { margin: 0; line-height: .98; font-size: clamp(34px, 7vw, 66px); letter-spacing: -.075em; }
    .desc { color: var(--muted); line-height: 1.58; margin: 12px 0 0; }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 18px;
    }
    .stat {
      padding: 14px;
      border-radius: 19px;
      background: rgba(0,0,0,.16);
      border: 1px solid rgba(255,255,255,.1);
    }
    .stat span { display: block; color: var(--muted); font-size: 12px; }
    .stat strong { display: block; margin-top: 6px; font-size: 15px; letter-spacing: -.02em; }
    .positive { color: var(--green); }
    .negative { color: var(--red); }

    .panel, .quick-card { padding: 18px; }
    .card-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .card-title h2 { margin: 0; font-size: 18px; letter-spacing: -.03em; }
    .card-title p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }

    .tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .tab-btn {
      min-height: 41px;
      color: var(--muted);
      border-radius: 999px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.1);
      font-weight: 850;
    }
    .tab-btn.active { color: #03101c; background: linear-gradient(135deg, var(--green), var(--blue)); }

    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .field { min-width: 0; display: flex; flex-direction: column; gap: 7px; }
    .field.full { grid-column: 1 / -1; }
    .field label { color: var(--muted); font-size: 12px; }
    .input, .select {
      width: 100%;
      min-height: 47px;
      padding: 0 14px;
      border-radius: 17px;
      color: var(--text);
      background: rgba(0,0,0,.18);
      border: 1px solid rgba(255,255,255,.11);
    }
    .input::placeholder { color: rgba(247,251,255,.35); }
    .select option { color: white; background: #0a1b2e; }
    .hidden { display: none !important; }
    .form-actions { display: flex; gap: 10px; margin-top: 12px; }
    .form-actions .main-btn { flex: 1; }

    .wallet-list, .budget-list { display: grid; gap: 10px; }
    .wallet-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 13px;
      border-radius: 21px;
      background: rgba(0,0,0,.15);
      border: 1px solid rgba(255,255,255,.1);
    }
    .wallet-icon {
      width: 43px;
      height: 43px;
      border-radius: 16px;
      display: grid;
      place-items: center;
      background: rgba(112,184,255,.14);
      border: 1px solid rgba(112,184,255,.2);
      font-size: 20px;
    }
    .wallet-item h3 { margin: 0; font-size: 14px; }
    .wallet-item p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
    .wallet-balance { text-align: right; font-weight: 950; letter-spacing: -.02em; }
    .row-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 6px; }

    .chart-box {
      height: 220px;
      display: grid;
      place-items: center;
      margin-top: 4px;
      margin-bottom: 14px;
      border-radius: 22px;
      background: rgba(0,0,0,.13);
      border: 1px solid rgba(255,255,255,.08);
      overflow: hidden;
    }
    canvas { width: 100%; height: 100%; display: block; }

    .budget-item {
      padding: 13px;
      border-radius: 19px;
      background: rgba(0,0,0,.14);
      border: 1px solid rgba(255,255,255,.09);
    }
    .budget-head { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-bottom: 8px; }
    .bar { height: 9px; border-radius: 999px; background: rgba(255,255,255,.09); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: inherit; width: 0%; background: linear-gradient(90deg, var(--green), var(--blue)); transition: width .35s ease; }
    .budget-note { margin: 8px 0 0; color: var(--muted); font-size: 12px; }

    .tools { display: flex; flex-wrap: wrap; gap: 8px; }
    .filter { display: grid; grid-template-columns: 1fr 160px; gap: 10px; margin-bottom: 12px; }
    .tx-list { display: grid; gap: 9px; max-height: 462px; overflow: auto; padding-right: 2px; scrollbar-width: thin; }
    .tx-list::-webkit-scrollbar { width: 6px; }
    .tx-list::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(255,255,255,.18); }
    .tx-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 19px;
      background: rgba(0,0,0,.16);
      border: 1px solid rgba(255,255,255,.09);
      animation: pop .2s ease both;
    }
    @keyframes pop { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
    .tx-icon {
      width: 41px;
      height: 41px;
      border-radius: 15px;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.08);
      font-weight: 950;
    }
    .tx-title { margin: 0; font-size: 14px; font-weight: 900; }
    .tx-meta { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .tx-amount { text-align: right; white-space: nowrap; font-weight: 950; }

    .empty {
      padding: 34px 20px;
      text-align: center;
      color: var(--muted);
      border-radius: 20px;
      background: rgba(255,255,255,.04);
      border: 1px dashed rgba(255,255,255,.18);
    }

    .bottom-nav {
      position: fixed;
      z-index: 60;
      left: 50%;
      bottom: max(14px, var(--safe));
      transform: translateX(-50%);
      width: min(620px, calc(100% - 24px));
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      padding: 8px;
      border-radius: 999px;
      background: rgba(6,18,31,.79);
      border: 1px solid rgba(255,255,255,.13);
      box-shadow: 0 22px 55px rgba(0,0,0,.34);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
    }
    .nav-btn {
      min-height: 45px;
      border-radius: 999px;
      color: var(--muted);
      background: transparent;
      font-weight: 900;
      font-size: 13px;
    }
    .nav-btn.active { color: var(--text); background: rgba(255,255,255,.12); }

    .modal {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: none;
      place-items: end center;
      padding: 16px;
      background: rgba(0,0,0,.58);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    .modal.active { display: grid; }
    .modal-card {
      width: min(520px, 100%);
      max-height: calc(100vh - 32px);
      overflow: auto;
      border-radius: 28px;
      padding: 18px;
      background: #09192a;
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 30px 90px rgba(0,0,0,.55);
      animation: sheet .21s ease both;
    }
    @keyframes sheet { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
    .modal-head { display: flex; justify-content: space-between; align-items: start; gap: 14px; margin-bottom: 14px; }
    .modal-head h2 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
    .modal-head p { margin: 5px 0 0; color: var(--muted); font-size: 13px; line-height: 1.45; }

    .toast {
      position: fixed;
      z-index: 130;
      left: 50%;
      bottom: 88px;
      transform: translateX(-50%) translateY(14px);
      opacity: 0;
      pointer-events: none;
      max-width: calc(100% - 28px);
      text-align: center;
      color: #06121f;
      background: linear-gradient(135deg, var(--green), var(--blue));
      padding: 12px 16px;
      border-radius: 999px;
      font-weight: 950;
      box-shadow: 0 18px 40px rgba(0,0,0,.28);
      transition: .22s ease;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

    .lock-screen {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: grid;
      place-items: center;
      padding: 18px;
      background:
        radial-gradient(circle at 20% 10%, rgba(94,240,165,.2), transparent 34%),
        radial-gradient(circle at 90% 0%, rgba(112,184,255,.22), transparent 36%),
        #06121f;
    }
    .lock-screen.hidden-lock { display: none; }
    .lock-card {
      width: min(450px, 100%);
      padding: 24px;
      border-radius: 30px;
      background: rgba(255,255,255,.09);
      border: 1px solid rgba(255,255,255,.14);
      box-shadow: var(--shadow);
    }
    .lock-card .logo { margin: 0 auto 14px; width: 56px; height: 56px; border-radius: 20px; font-size: 22px; }
    .lock-card h2 { margin: 0; font-size: 25px; text-align: center; }
    .lock-card p { color: var(--muted); line-height: 1.55; text-align: center; }
    .small { font-size: 12px; color: var(--muted); line-height: 1.55; }
    .check-row { display: flex; align-items: center; gap: 10px; margin: 12px 0 0; color: var(--muted); font-size: 13px; }
    .check-row input { width: 18px; height: 18px; accent-color: #5ef0a5; }
    .setup-warning { display: none; margin-top: 12px; padding: 12px; border-radius: 18px; border: 1px solid rgba(255,107,122,.3); background: rgba(255,107,122,.1); color: #ffd8dd; font-size: 13px; line-height: 1.5; }
    .setup-warning.show { display: block; }

    @media (max-width: 900px) {
      .grid-hero, .grid-section { grid-template-columns: 1fr; }
      .balance-card { min-height: auto; }
    }

    @media (max-width: 640px) {
      .app { padding: 14px 12px 106px; }
      .topbar { margin: -14px -12px 14px; padding: 12px; }
      .brand p { max-width: 180px; }
      .top-actions .btn span, .status-pill span.status-label { display: none; }
      .status-pill { padding: 0 12px; }
      .balance-card, .quick-card, .panel { padding: 15px; border-radius: 22px; }
      .stats { grid-template-columns: 1fr; }
      .form-grid { grid-template-columns: 1fr; }
      .form-actions { flex-direction: column; }
      .filter { grid-template-columns: 1fr; }
      .wallet-item, .tx-item { grid-template-columns: auto 1fr; }
      .wallet-balance, .tx-amount { grid-column: 2; text-align: left; }
      .row-actions { justify-content: flex-start; }
      .bottom-nav { width: calc(100% - 16px); bottom: max(8px, var(--safe)); gap: 4px; padding: 6px; }
      .nav-btn { min-height: 44px; font-size: 12px; }
    }

    @media (prefers-reduced-motion: reduce) {
      * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }
  </style>
</head>
<body>
  <div id="lockScreen" class="lock-screen">
    <div class="lock-card">
      <div class="logo">Rp</div>
      <h2>UangKu KV</h2>
      <p>Masuk ke gudang KV kamu. Data akan tersimpan di Cloudflare KV dan otomatis sinkron antar perangkat.</p>
      <div class="field" style="margin-top:16px">
        <label for="workspaceInput">Nama gudang</label>
        <input id="workspaceInput" class="input" autocomplete="username" placeholder="Contoh: keuangan-pribadi">
      </div>
      <div class="field" style="margin-top:10px">
        <label for="pinInput">PIN gudang</label>
        <input id="pinInput" class="input" type="password" autocomplete="current-password" inputmode="numeric" maxlength="32" placeholder="Minimal 4 angka/huruf">
      </div>
      <label class="check-row"><input id="rememberInput" type="checkbox" checked> Ingat di perangkat ini</label>
      <button id="loginBtn" class="main-btn" style="width:100%;margin-top:14px">Masuk / Buat Gudang</button>
      <button id="localOnlyBtn" class="btn" style="width:100%;margin-top:10px">Pakai mode lokal dulu</button>
      <div id="setupWarning" class="setup-warning"></div>
      <p class="small">Tips: pakai nama gudang + PIN yang sama di HP/laptop agar datanya sama. Jangan bagikan PIN ke orang lain.</p>
    </div>
  </div>

  <div class="app" id="app">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <div class="logo">Rp</div>
          <div>
            <h1>UangKu KV</h1>
            <p id="workspaceLabel">Realtime finance tracker</p>
          </div>
        </div>
        <div class="top-actions">
          <button class="status-pill" id="syncStatus" title="Status sinkron"><i class="dot"></i><span class="status-label">Belum sync</span></button>
          <button class="btn" id="openWalletModal"><span>Tambah Kas</span> ＋</button>
          <button class="btn" id="logoutBtn"><span>Kunci</span> 🔒</button>
        </div>
      </div>
    </header>

    <main>
      <section class="grid-hero" id="dashboardSection">
        <article class="card balance-card">
          <div>
            <p class="eyebrow">Total saldo semua kas</p>
            <h2 class="big-balance" id="totalBalance">Rp0</h2>
            <p class="desc">Pantau uang kamu ada di mana saja: cash, bank, e-wallet, tabungan, atau kas lain. Setiap pengeluaran otomatis mengurangi saldo kas yang dipilih dan tersimpan ke KV.</p>
          </div>
          <div class="stats">
            <div class="stat">
              <span>Pemasukan bulan ini</span>
              <strong class="positive" id="monthIncome">Rp0</strong>
            </div>
            <div class="stat">
              <span>Pengeluaran bulan ini</span>
              <strong class="negative" id="monthExpense">Rp0</strong>
            </div>
            <div class="stat">
              <span>Sisa bersih bulan ini</span>
              <strong id="monthNet">Rp0</strong>
            </div>
          </div>
        </article>

        <article class="card quick-card" id="inputSection">
          <div class="card-title">
            <div>
              <h2>Input cepat</h2>
              <p>Catat jajan, pemasukan, atau transfer antar kas.</p>
            </div>
          </div>

          <div class="tabs">
            <button class="tab-btn active" data-type="expense">Keluar</button>
            <button class="tab-btn" data-type="income">Masuk</button>
            <button class="tab-btn" data-type="transfer">Transfer</button>
          </div>

          <form id="transactionForm">
            <div class="form-grid">
              <div class="field full">
                <label for="titleInput">Keterangan</label>
                <input class="input" id="titleInput" placeholder="Contoh: Jajan bakso" autocomplete="off" required>
              </div>
              <div class="field">
                <label for="amountInput">Nominal</label>
                <input class="input" id="amountInput" inputmode="numeric" placeholder="25000" required>
              </div>
              <div class="field">
                <label for="categoryInput">Kategori</label>
                <select class="select" id="categoryInput"></select>
              </div>
              <div class="field" id="fromWalletWrap">
                <label for="fromWalletInput">Pakai kas</label>
                <select class="select" id="fromWalletInput"></select>
              </div>
              <div class="field hidden" id="toWalletWrap">
                <label for="toWalletInput">Tujuan kas</label>
                <select class="select" id="toWalletInput"></select>
              </div>
              <div class="field full">
                <label for="dateInput">Tanggal</label>
                <input class="input" id="dateInput" type="date" required>
              </div>
            </div>
            <div class="form-actions">
              <button class="main-btn" type="submit" id="submitBtn">Simpan Pengeluaran</button>
              <button class="btn" type="button" id="clearForm">Reset</button>
            </div>
          </form>
        </article>
      </section>

      <section class="grid-section" id="walletSection">
        <article class="card panel">
          <div class="card-title">
            <div>
              <h2>Posisi kas</h2>
              <p>Saldo per dompet, bank, dan e-wallet.</p>
            </div>
            <button class="mini-btn" id="sortWallets">Urutkan</button>
          </div>
          <div class="wallet-list" id="walletList"></div>
        </article>

        <article class="card panel" id="reportSection">
          <div class="card-title">
            <div>
              <h2>Ringkasan bulan ini</h2>
              <p>Perbandingan pemasukan dan pengeluaran.</p>
            </div>
          </div>
          <div class="chart-box">
            <canvas id="financeChart" width="700" height="260" aria-label="Grafik keuangan"></canvas>
          </div>
          <div class="budget-list" id="budgetList"></div>
        </article>
      </section>

      <section class="grid-section">
        <article class="card panel">
          <div class="card-title">
            <div>
              <h2>Backup & sinkron</h2>
              <p>Export backup tetap penting walaupun sudah pakai KV.</p>
            </div>
          </div>
          <div class="tools">
            <button class="btn" id="syncNowBtn">Sync Sekarang</button>
            <button class="btn" id="exportBtn">Export JSON</button>
            <button class="btn" id="importBtn">Import JSON</button>
            <input type="file" id="importFile" accept="application/json" hidden>
            <button class="danger-btn" id="resetAllBtn">Reset Semua</button>
          </div>
          <p class="desc" style="font-size:13px;margin-bottom:0">Mode realtime memakai auto-sync/polling beberapa detik sekali. Data utama tersimpan di KV jika binding FINANCE_KV sudah dipasang.</p>
        </article>

        <article class="card panel" id="historySection">
          <div class="card-title">
            <div>
              <h2>Riwayat transaksi</h2>
              <p>Lihat, cari, dan hapus catatan kalau salah input.</p>
            </div>
          </div>
          <div class="filter">
            <input class="input" id="searchInput" placeholder="Cari: jajan, gaji, BCA...">
            <select class="select" id="filterType">
              <option value="all">Semua</option>
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>
          <div class="tx-list" id="transactionList"></div>
        </article>
      </section>
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Navigasi cepat">
    <button class="nav-btn active" data-jump="dashboardSection">Saldo</button>
    <button class="nav-btn" data-jump="inputSection">Input</button>
    <button class="nav-btn" data-jump="walletSection">Kas</button>
    <button class="nav-btn" data-jump="historySection">Riwayat</button>
  </nav>

  <div class="modal" id="walletModal">
    <div class="modal-card">
      <div class="modal-head">
        <div>
          <h2>Tambah kas baru</h2>
          <p>Contoh: Bank BCA, DANA, OVO, Cash Dompet, Tabungan, Kas Darurat.</p>
        </div>
        <button class="mini-btn" id="closeWalletModal">Tutup</button>
      </div>
      <form id="walletForm">
        <div class="form-grid">
          <div class="field full">
            <label for="walletNameInput">Nama kas</label>
            <input class="input" id="walletNameInput" placeholder="Contoh: Bank BCA" required>
          </div>
          <div class="field">
            <label for="walletTypeInput">Tipe</label>
            <select class="select" id="walletTypeInput">
              <option value="Bank">Bank</option>
              <option value="Cash">Cash</option>
              <option value="E-Wallet">E-Wallet</option>
              <option value="Tabungan">Tabungan</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
          <div class="field">
            <label for="walletBalanceInput">Saldo awal</label>
            <input class="input" id="walletBalanceInput" inputmode="numeric" placeholder="100000" required>
          </div>
        </div>
        <button class="main-btn" style="width:100%;margin-top:12px" type="submit">Simpan Kas</button>
      </form>
    </div>
  </div>

  <div class="toast" id="toast">Berhasil disimpan</div>

  <script>
    var STORAGE_KEY = "uangku_kv_cache_v2";
    var AUTH_KEY = "uangku_kv_auth_v2";
    var state = {
      activeType: "expense",
      sortWalletDesc: true,
      data: defaultData(),
      workspace: "",
      pin: "",
      mode: "locked",
      revision: 0,
      updatedAt: null,
      dirty: false,
      saving: false,
      poller: null,
      saveTimer: null
    };

    var categories = {
      expense: ["Makan & Jajan", "Transport", "Belanja", "Tagihan", "Hiburan", "Pendidikan", "Kesehatan", "Lainnya"],
      income: ["Gaji", "Freelance", "Jualan", "Hadiah", "Bonus", "Lainnya"],
      transfer: ["Pindah Kas"]
    };

    var rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

    function el(id) { return document.getElementById(id); }
    function all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function today() { return new Date().toISOString().slice(0, 10); }
    function cleanNumber(value) { return Number(String(value || "").replace(/[^0-9-]/g, "")) || 0; }
    function formatMoney(value) { return rupiah.format(Number(value || 0)); }
    function currentMonth() { return today().slice(0, 7); }
    function monthKey(dateText) { return String(dateText || "").slice(0, 7); }

    function escapeHtml(text) {
      return String(text == null ? "" : text).replace(/[&<>'"]/g, function(char) {
        return { "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#039;", "\"":"&quot;" }[char];
      });
    }

    function defaultData() {
      return {
        wallets: [
          { id: uid(), name: "Cash Dompet", type: "Cash", balance: 150000 },
          { id: uid(), name: "Bank Utama", type: "Bank", balance: 1200000 },
          { id: uid(), name: "DANA / E-Wallet", type: "E-Wallet", balance: 250000 }
        ],
        transactions: []
      };
    }

    function cacheKey() {
      return STORAGE_KEY + ":" + (state.workspace || "local");
    }

    function saveCache() {
      try {
        localStorage.setItem(cacheKey(), JSON.stringify({ data: state.data, revision: state.revision, updatedAt: state.updatedAt }));
      } catch (e) {}
    }

    function loadCache(workspace) {
      try {
        var saved = localStorage.getItem(STORAGE_KEY + ":" + (workspace || "local"));
        if (!saved) return null;
        var parsed = JSON.parse(saved);
        if (parsed && parsed.data && parsed.data.wallets && parsed.data.transactions) return parsed;
      } catch (e) {}
      return null;
    }

    function toast(message) {
      var box = el("toast");
      box.textContent = message;
      box.classList.add("show");
      clearTimeout(window.__toastTimer);
      window.__toastTimer = setTimeout(function() { box.classList.remove("show"); }, 1800);
    }

    function setStatus(text, kind) {
      var box = el("syncStatus");
      box.classList.remove("ok", "bad");
      if (kind === "ok") box.classList.add("ok");
      if (kind === "bad") box.classList.add("bad");
      var label = box.querySelector(".status-label");
      if (label) label.textContent = text;
      box.title = text;
    }

    async function api(path, payload) {
      var res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {})
      });
      var json = await res.json().catch(function() { return null; });
      if (!res.ok || !json || json.ok === false) {
        var message = json && (json.message || json.error) || "Request gagal";
        var error = new Error(message);
        error.payload = json;
        throw error;
      }
      return json;
    }

    async function login(useLocalOnly) {
      var workspace = el("workspaceInput").value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-");
      var pin = el("pinInput").value.trim();
      var warning = el("setupWarning");
      warning.classList.remove("show");
      warning.textContent = "";

      if (!workspace) workspace = "keuangan-pribadi";
      if (!useLocalOnly && pin.length < 4) return toast("PIN minimal 4 karakter");
      if (useLocalOnly && !pin) pin = "local";

      state.workspace = workspace;
      state.pin = pin;
      state.mode = useLocalOnly ? "local" : "kv";
      el("workspaceLabel").textContent = useLocalOnly ? "Mode lokal • " + workspace : "Gudang KV • " + workspace;

      if (el("rememberInput").checked) {
        localStorage.setItem(AUTH_KEY, JSON.stringify({ workspace: workspace, pin: pin, mode: state.mode }));
      } else {
        localStorage.removeItem(AUTH_KEY);
      }

      var cached = loadCache(workspace);
      if (cached) {
        state.data = cached.data;
        state.revision = Number(cached.revision || 0);
        state.updatedAt = cached.updatedAt || null;
      } else {
        state.data = defaultData();
        state.revision = 0;
        state.updatedAt = null;
      }

      el("lockScreen").classList.add("hidden-lock");
      renderAll();

      if (useLocalOnly) {
        setStatus("Mode lokal", "bad");
        toast("Masuk mode lokal");
        return;
      }

      setStatus("Mengambil KV...", "");
      try {
        var remote = await api("/api/load", { workspace: workspace, pin: pin });
        if (remote.data) {
          state.data = remote.data;
          state.revision = Number(remote.revision || 0);
          state.updatedAt = remote.updatedAt || null;
          saveCache();
          renderAll();
          setStatus("Realtime aktif", "ok");
          toast("Data KV berhasil dimuat");
        } else {
          state.revision = 0;
          state.updatedAt = null;
          await saveRemote(true);
          toast("Gudang baru dibuat di KV");
        }
        startPolling();
      } catch (error) {
        setStatus("KV belum siap", "bad");
        warning.textContent = "Gagal konek KV: " + error.message + ". Pastikan binding KV bernama FINANCE_KV sudah dipasang di Worker Settings.";
        warning.classList.add("show");
        toast("KV belum tersambung");
      }
    }

    async function saveRemote(forceNow) {
      saveCache();
      if (state.mode === "local") {
        state.updatedAt = new Date().toISOString();
        setStatus("Lokal tersimpan", "bad");
        return;
      }
      if (state.mode !== "kv" || !state.workspace || !state.pin) return;
      if (state.saving && !forceNow) return;

      state.saving = true;
      state.dirty = true;
      setStatus("Menyimpan...", "");
      try {
        var res = await api("/api/save", { workspace: state.workspace, pin: state.pin, data: state.data });
        state.revision = Number(res.revision || state.revision || 0);
        state.updatedAt = res.updatedAt || new Date().toISOString();
        state.dirty = false;
        saveCache();
        setStatus("Realtime aktif", "ok");
      } catch (error) {
        setStatus("Gagal sync", "bad");
        toast("Gagal simpan KV: " + error.message);
      } finally {
        state.saving = false;
      }
    }

    function scheduleSave() {
      saveCache();
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(function() { saveRemote(false); }, 450);
    }

    function startPolling() {
      stopPolling();
      state.poller = setInterval(pollRemote, 4000);
    }

    function stopPolling() {
      if (state.poller) clearInterval(state.poller);
      state.poller = null;
    }

    async function pollRemote() {
      if (state.mode !== "kv" || state.saving || state.dirty || !state.workspace || !state.pin) return;
      try {
        var remote = await api("/api/load", { workspace: state.workspace, pin: state.pin });
        var remoteRevision = Number(remote.revision || 0);
        if (remote.data && remoteRevision > Number(state.revision || 0)) {
          state.data = remote.data;
          state.revision = remoteRevision;
          state.updatedAt = remote.updatedAt || null;
          saveCache();
          renderAll();
          setStatus("Update masuk", "ok");
          setTimeout(function() { setStatus("Realtime aktif", "ok"); }, 1300);
        } else {
          setStatus("Realtime aktif", "ok");
        }
      } catch (error) {
        setStatus("Offline/KV error", "bad");
      }
    }

    function walletIcon(type) {
      if (type === "Bank") return "🏦";
      if (type === "Cash") return "💵";
      if (type === "E-Wallet") return "📱";
      if (type === "Tabungan") return "🪙";
      return "💼";
    }

    function txIcon(type) {
      if (type === "income") return "↙";
      if (type === "transfer") return "⇄";
      return "↗";
    }

    function getWallet(id) {
      for (var i = 0; i < state.data.wallets.length; i++) {
        if (state.data.wallets[i].id === id) return state.data.wallets[i];
      }
      return null;
    }

    function monthSummary() {
      var month = currentMonth();
      var income = 0;
      var expense = 0;
      state.data.transactions.forEach(function(tx) {
        if (monthKey(tx.date) !== month) return;
        if (tx.type === "income") income += tx.amount;
        if (tx.type === "expense") expense += tx.amount;
      });
      return { income: income, expense: expense, net: income - expense };
    }

    function renderWalletOptions() {
      var html = "";
      state.data.wallets.forEach(function(w) {
        html += '<option value="' + w.id + '">' + escapeHtml(w.name) + ' • ' + formatMoney(w.balance) + '</option>';
      });
      el("fromWalletInput").innerHTML = html;
      el("toWalletInput").innerHTML = html;
    }

    function renderCategories() {
      var list = categories[state.activeType] || [];
      var html = "";
      list.forEach(function(cat) {
        html += '<option value="' + escapeHtml(cat) + '">' + escapeHtml(cat) + '</option>';
      });
      el("categoryInput").innerHTML = html;
    }

    function renderDashboard() {
      var total = state.data.wallets.reduce(function(sum, w) { return sum + Number(w.balance || 0); }, 0);
      var summary = monthSummary();
      el("totalBalance").textContent = formatMoney(total);
      el("monthIncome").textContent = formatMoney(summary.income);
      el("monthExpense").textContent = formatMoney(summary.expense);
      el("monthNet").textContent = formatMoney(summary.net);
      el("monthNet").className = summary.net >= 0 ? "positive" : "negative";
    }

    function renderWallets() {
      var wallets = state.data.wallets.slice().sort(function(a, b) {
        return state.sortWalletDesc ? b.balance - a.balance : a.balance - b.balance;
      });
      var list = el("walletList");
      if (!wallets.length) {
        list.innerHTML = '<div class="empty">Belum ada kas. Tambahkan Bank/Cash/E-Wallet dulu.</div>';
        return;
      }
      var html = "";
      wallets.forEach(function(w) {
        html += '<div class="wallet-item">' +
          '<div class="wallet-icon">' + walletIcon(w.type) + '</div>' +
          '<div><h3>' + escapeHtml(w.name) + '</h3><p>' + escapeHtml(w.type) + '</p></div>' +
          '<div><div class="wallet-balance">' + formatMoney(w.balance) + '</div>' +
          '<div class="row-actions"><button class="mini-btn" data-edit-wallet="' + w.id + '">Edit</button><button class="mini-btn" data-delete-wallet="' + w.id + '">Hapus</button></div></div>' +
          '</div>';
      });
      list.innerHTML = html;
    }

    function formatDate(dateText) {
      var date = new Date(dateText + "T00:00:00");
      return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
    }

    function renderTransactions() {
      var search = el("searchInput").value.trim().toLowerCase();
      var type = el("filterType").value;
      var txs = state.data.transactions.slice().sort(function(a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime() || b.createdAt - a.createdAt;
      });
      if (type !== "all") txs = txs.filter(function(tx) { return tx.type === type; });
      if (search) {
        txs = txs.filter(function(tx) {
          var from = getWallet(tx.fromWalletId);
          var to = getWallet(tx.toWalletId);
          var text = [tx.title, tx.category, from ? from.name : "", to ? to.name : "", tx.date].join(" ").toLowerCase();
          return text.indexOf(search) !== -1;
        });
      }
      var list = el("transactionList");
      if (!txs.length) {
        list.innerHTML = '<div class="empty">Belum ada transaksi yang cocok.</div>';
        return;
      }
      var html = "";
      txs.forEach(function(tx) {
        var from = getWallet(tx.fromWalletId);
        var to = getWallet(tx.toWalletId);
        var fromName = from ? from.name : "Kas terhapus";
        var toName = to ? to.name : "Kas terhapus";
        var sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
        var cls = tx.type === "income" ? "positive" : tx.type === "expense" ? "negative" : "";
        var meta = "";
        if (tx.type === "transfer") {
          meta = escapeHtml(fromName) + " → " + escapeHtml(toName) + " • " + formatDate(tx.date);
        } else {
          meta = escapeHtml(tx.category) + " • " + escapeHtml(tx.type === "income" ? toName : fromName) + " • " + formatDate(tx.date);
        }
        html += '<div class="tx-item">' +
          '<div class="tx-icon">' + txIcon(tx.type) + '</div>' +
          '<div><p class="tx-title">' + escapeHtml(tx.title) + '</p><p class="tx-meta">' + meta + '</p></div>' +
          '<div><div class="tx-amount ' + cls + '">' + sign + formatMoney(tx.amount) + '</div>' +
          '<div class="row-actions"><button class="mini-btn" data-delete-tx="' + tx.id + '">Hapus</button></div></div>' +
          '</div>';
      });
      list.innerHTML = html;
    }

    function renderBudgets() {
      var month = currentMonth();
      var byCategory = {};
      var totalExpense = 0;
      state.data.transactions.forEach(function(tx) {
        if (tx.type === "expense" && monthKey(tx.date) === month) {
          byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount;
          totalExpense += tx.amount;
        }
      });
      var items = Object.keys(byCategory).map(function(k) { return [k, byCategory[k]]; }).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 5);
      if (!items.length) {
        el("budgetList").innerHTML = '<div class="empty">Belum ada pengeluaran bulan ini.</div>';
        return;
      }
      var html = "";
      items.forEach(function(item) {
        var percent = totalExpense ? Math.round((item[1] / totalExpense) * 100) : 0;
        html += '<div class="budget-item">' +
          '<div class="budget-head"><strong>' + escapeHtml(item[0]) + '</strong><span>' + formatMoney(item[1]) + ' • ' + percent + '%</span></div>' +
          '<div class="bar"><span style="width:' + percent + '%"></span></div>' +
          '<p class="budget-note">Kontribusi terhadap total pengeluaran bulan ini.</p>' +
          '</div>';
      });
      el("budgetList").innerHTML = html;
    }

    function renderChart() {
      var canvas = el("financeChart");
      var ctx = canvas.getContext("2d");
      var summary = monthSummary();
      var w = canvas.width;
      var h = canvas.height;
      var max = Math.max(summary.income, summary.expense, 1);
      var bars = [
        { label: "Pemasukan", value: summary.income, a: "#5ef0a5", b: "#70b8ff" },
        { label: "Pengeluaran", value: summary.expense, a: "#ff6b7a", b: "#ffc36b" }
      ];
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fillRect(0, h - 42, w, 1);
      bars.forEach(function(bar, i) {
        var barW = 130;
        var x = w / 2 - 160 + i * 320;
        var height = Math.max(8, (bar.value / max) * (h - 112));
        var y = h - 44 - height;
        var grd = ctx.createLinearGradient(x, y, x, y + height);
        grd.addColorStop(0, bar.a);
        grd.addColorStop(1, bar.b);
        roundRect(ctx, x, y, barW, height, 18);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.fillStyle = "rgba(247,251,255,.84)";
        ctx.font = "700 20px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(shortMoney(bar.value), x + barW / 2, Math.max(24, y - 10));
        ctx.fillStyle = "rgba(247,251,255,.62)";
        ctx.font = "600 18px system-ui";
        ctx.fillText(bar.label, x + barW / 2, h - 16);
      });
    }

    function roundRect(ctx, x, y, width, height, radius) {
      var r = Math.min(radius, width / 2, height / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + width, y, x + width, y + height, r);
      ctx.arcTo(x + width, y + height, x, y + height, r);
      ctx.arcTo(x, y + height, x, y, r);
      ctx.arcTo(x, y, x + width, y, r);
      ctx.closePath();
    }

    function shortMoney(value) {
      var n = Number(value || 0);
      if (n >= 1000000000) return "Rp" + (n / 1000000000).toFixed(1).replace(".0", "") + "M";
      if (n >= 1000000) return "Rp" + (n / 1000000).toFixed(1).replace(".0", "") + "jt";
      if (n >= 1000) return "Rp" + Math.round(n / 1000) + "rb";
      return "Rp" + n;
    }

    function renderAll() {
      renderWalletOptions();
      renderCategories();
      renderDashboard();
      renderWallets();
      renderTransactions();
      renderBudgets();
      requestAnimationFrame(renderChart);
    }

    function setActiveType(type) {
      state.activeType = type;
      all(".tab-btn").forEach(function(btn) { btn.classList.toggle("active", btn.getAttribute("data-type") === type); });
      el("toWalletWrap").classList.toggle("hidden", type !== "transfer");
      el("fromWalletWrap").querySelector("label").textContent = type === "transfer" ? "Dari kas" : type === "income" ? "Masuk ke kas" : "Pakai kas";
      el("titleInput").placeholder = type === "expense" ? "Contoh: Jajan bakso" : type === "income" ? "Contoh: Gaji bulan ini" : "Contoh: Pindah uang ke DANA";
      el("submitBtn").textContent = type === "expense" ? "Simpan Pengeluaran" : type === "income" ? "Simpan Pemasukan" : "Simpan Transfer";
      renderCategories();
    }

    function addTransaction(event) {
      event.preventDefault();
      if (!state.data.wallets.length) return toast("Tambahkan kas dulu");
      var type = state.activeType;
      var title = el("titleInput").value.trim();
      var amount = cleanNumber(el("amountInput").value);
      var category = el("categoryInput").value;
      var date = el("dateInput").value || today();
      var fromId = el("fromWalletInput").value;
      var toId = el("toWalletInput").value;
      if (!title || amount <= 0) return toast("Isi keterangan dan nominal dengan benar");
      if (type === "transfer" && fromId === toId) return toast("Kas asal dan tujuan harus berbeda");
      var fromWallet = getWallet(fromId);
      var toWallet = getWallet(toId);
      if (type === "expense") {
        if (!fromWallet) return toast("Kas tidak ditemukan");
        fromWallet.balance -= amount;
      }
      if (type === "income") {
        if (!fromWallet) return toast("Kas tidak ditemukan");
        fromWallet.balance += amount;
      }
      if (type === "transfer") {
        if (!fromWallet || !toWallet) return toast("Kas tidak ditemukan");
        fromWallet.balance -= amount;
        toWallet.balance += amount;
      }
      state.data.transactions.push({
        id: uid(),
        type: type,
        title: title,
        amount: amount,
        category: category,
        date: date,
        fromWalletId: type === "income" ? null : fromId,
        toWalletId: type === "income" ? fromId : type === "transfer" ? toId : null,
        createdAt: Date.now()
      });
      resetForm(false);
      renderAll();
      scheduleSave();
      toast("Transaksi berhasil disimpan");
    }

    function resetForm(includeDate) {
      el("titleInput").value = "";
      el("amountInput").value = "";
      if (includeDate) el("dateInput").value = today();
    }

    function deleteTransaction(id) {
      var tx = null;
      state.data.transactions.forEach(function(item) { if (item.id === id) tx = item; });
      if (!tx) return;
      if (!confirm("Hapus transaksi ini? Saldo kas akan dikembalikan.")) return;
      var from = getWallet(tx.fromWalletId);
      var to = getWallet(tx.toWalletId);
      if (tx.type === "expense" && from) from.balance += tx.amount;
      if (tx.type === "income" && to) to.balance -= tx.amount;
      if (tx.type === "transfer") {
        if (from) from.balance += tx.amount;
        if (to) to.balance -= tx.amount;
      }
      state.data.transactions = state.data.transactions.filter(function(item) { return item.id !== id; });
      renderAll();
      scheduleSave();
      toast("Transaksi dihapus");
    }

    function editWallet(id) {
      var wallet = getWallet(id);
      if (!wallet) return;
      var name = prompt("Nama kas:", wallet.name);
      if (!name) return;
      var balance = prompt("Saldo sekarang:", wallet.balance);
      if (balance === null) return;
      wallet.name = name.trim();
      wallet.balance = cleanNumber(balance);
      renderAll();
      scheduleSave();
      toast("Kas diperbarui");
    }

    function deleteWallet(id) {
      var used = state.data.transactions.some(function(tx) { return tx.fromWalletId === id || tx.toWalletId === id; });
      if (used) return alert("Kas ini sudah dipakai transaksi. Hapus transaksi terkait dulu kalau ingin menghapus kas.");
      if (!confirm("Hapus kas ini?")) return;
      state.data.wallets = state.data.wallets.filter(function(w) { return w.id !== id; });
      renderAll();
      scheduleSave();
      toast("Kas dihapus");
    }

    function addWallet(event) {
      event.preventDefault();
      var name = el("walletNameInput").value.trim();
      var type = el("walletTypeInput").value;
      var balance = cleanNumber(el("walletBalanceInput").value);
      if (!name) return toast("Nama kas wajib diisi");
      state.data.wallets.push({ id: uid(), name: name, type: type, balance: balance });
      el("walletForm").reset();
      el("walletModal").classList.remove("active");
      renderAll();
      scheduleSave();
      toast("Kas baru ditambahkan");
    }

    function exportData() {
      var payload = { exportedAt: new Date().toISOString(), workspace: state.workspace || "local", revision: state.revision || 0, data: state.data };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "uangku-kv-backup-" + today() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Backup JSON dibuat");
    }

    function importData(file) {
      var reader = new FileReader();
      reader.onload = function() {
        try {
          var parsed = JSON.parse(reader.result);
          var imported = parsed.data && parsed.data.wallets ? parsed.data : parsed;
          if (!imported.wallets || !imported.transactions) throw new Error("Format salah");
          state.data = imported;
          renderAll();
          scheduleSave();
          toast("Data berhasil diimport");
        } catch (e) {
          alert("File JSON tidak valid.");
        }
      };
      reader.readAsText(file);
    }

    async function resetAll() {
      if (!confirm("Yakin reset semua data keuangan? Ini tidak bisa dibatalkan.")) return;
      state.data = defaultData();
      state.revision = 0;
      state.updatedAt = null;
      saveCache();
      renderAll();
      if (state.mode === "kv") {
        try {
          await api("/api/reset", { workspace: state.workspace, pin: state.pin });
          await saveRemote(true);
        } catch (e) {
          setStatus("Reset lokal saja", "bad");
        }
      }
      toast("Data direset");
    }

    function logout() {
      stopPolling();
      localStorage.removeItem(AUTH_KEY);
      state.mode = "locked";
      state.pin = "";
      el("pinInput").value = "";
      el("lockScreen").classList.remove("hidden-lock");
      setStatus("Terkunci", "");
    }

    function bindEvents() {
      all(".tab-btn").forEach(function(btn) {
        btn.addEventListener("click", function() { setActiveType(btn.getAttribute("data-type")); });
      });
      el("loginBtn").addEventListener("click", function() { login(false); });
      el("localOnlyBtn").addEventListener("click", function() { login(true); });
      el("pinInput").addEventListener("keydown", function(e) { if (e.key === "Enter") login(false); });
      el("transactionForm").addEventListener("submit", addTransaction);
      el("clearForm").addEventListener("click", function() { resetForm(true); });
      el("walletForm").addEventListener("submit", addWallet);
      el("openWalletModal").addEventListener("click", function() { el("walletModal").classList.add("active"); });
      el("closeWalletModal").addEventListener("click", function() { el("walletModal").classList.remove("active"); });
      el("walletModal").addEventListener("click", function(e) { if (e.target.id === "walletModal") el("walletModal").classList.remove("active"); });
      el("searchInput").addEventListener("input", renderTransactions);
      el("filterType").addEventListener("change", renderTransactions);
      el("sortWallets").addEventListener("click", function() { state.sortWalletDesc = !state.sortWalletDesc; renderWallets(); });
      el("syncNowBtn").addEventListener("click", function() { saveRemote(true).then(pollRemote); });
      el("syncStatus").addEventListener("click", function() { saveRemote(true).then(pollRemote); });
      el("exportBtn").addEventListener("click", exportData);
      el("importBtn").addEventListener("click", function() { el("importFile").click(); });
      el("importFile").addEventListener("change", function(e) { if (e.target.files[0]) importData(e.target.files[0]); });
      el("resetAllBtn").addEventListener("click", resetAll);
      el("logoutBtn").addEventListener("click", logout);
      el("walletList").addEventListener("click", function(e) {
        var editId = e.target.getAttribute("data-edit-wallet");
        var deleteId = e.target.getAttribute("data-delete-wallet");
        if (editId) editWallet(editId);
        if (deleteId) deleteWallet(deleteId);
      });
      el("transactionList").addEventListener("click", function(e) {
        var deleteId = e.target.getAttribute("data-delete-tx");
        if (deleteId) deleteTransaction(deleteId);
      });
      all(".nav-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var target = el(btn.getAttribute("data-jump"));
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          all(".nav-btn").forEach(function(b) { b.classList.remove("active"); });
          btn.classList.add("active");
        });
      });
      el("amountInput").addEventListener("input", function(e) {
        var raw = cleanNumber(e.target.value);
        e.target.value = raw ? raw.toLocaleString("id-ID") : "";
      });
      el("walletBalanceInput").addEventListener("input", function(e) {
        var raw = cleanNumber(e.target.value);
        e.target.value = raw ? raw.toLocaleString("id-ID") : "";
      });
      window.addEventListener("resize", function() { requestAnimationFrame(renderChart); });
      document.addEventListener("visibilitychange", function() {
        if (!document.hidden) pollRemote();
      });
    }

    function restoreAuth() {
      try {
        var auth = JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
        if (auth && auth.workspace) {
          el("workspaceInput").value = auth.workspace;
          el("pinInput").value = auth.pin || "";
          if (auth.pin) setTimeout(function() { login(auth.mode === "local"); }, 350);
        }
      } catch (e) {}
    }

    el("dateInput").value = today();
    bindEvents();
    renderAll();
    setStatus("Terkunci", "");
    restoreAuth();
  </script>
</body>
</html>`;
