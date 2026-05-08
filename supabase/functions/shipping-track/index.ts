import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const PHASE = "3B.10B-R2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AnyRecord = Record<string, any>;

function jsonResponse(payload: AnyRecord, status = 200): Response {
  return new Response(JSON.stringify({ phase: PHASE, ...payload }, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function isCourierPlaceholder(value: unknown): boolean {
  const text = cleanText(value).toLowerCase();

  if (!text) return true;

  return [
    "biteship",
    "bitship",
    "manual",
    "kurir",
    "ekspedisi",
    "courier",
    "shipping",
    "pengiriman",
    "-",
    "null",
    "undefined",
  ].includes(text);
}

function normalizeCourierCode10B(input: unknown): string {
  let text = cleanText(input).toLowerCase();

  if (!text || isCourierPlaceholder(text)) return "";

  text = text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/courier/g, "")
    .replace(/ekspedisi/g, "")
    .replace(/pengiriman/g, "")
    .trim();

  const beforeSlash = text.split("/")[0]?.trim();
  if (beforeSlash) text = beforeSlash;

  const aliasRules: Array<[RegExp, string]> = [
    [/j\s*&\s*t|jnt|jnt express|j\&t|jet express|jet/, "jnt"],
    [/\bjne\b|jalur nugraha ekakurir/, "jne"],
    [/\btiki\b|titipan kilat/, "tiki"],
    [/sicepat|si cepat/, "sicepat"],
    [/anteraja|anter aja/, "anteraja"],
    [/ninja/, "ninja"],
    [/lion/, "lion"],
    [/id\s*express|idexpress/, "idexpress"],
    [/\bpos\b|pos indonesia/, "pos"],
    [/wahana/, "wahana"],
    [/\bsap\b|sap express/, "sap"],
    [/paxel/, "paxel"],
    [/gojek|gosend|go-send/, "gojek"],
    [/grab|grabexpress|grab express/, "grab"],
    [/deliveree/, "deliveree"],
    [/\brpx\b/, "rpx"],
    [/\bjdl\b|jd\.?id/, "jdl"],
    [/shopee|spx|shopee express/, "spx"],
    [/indah/, "indah"],
  ];

  for (const [regex, code] of aliasRules) {
    if (regex.test(text)) return code;
  }

  text = text
    .replace(/\b(reguler|regular|reg|economy|ekonomi|cargo|instant|same day|sameday|next day|nextday|express|hemat|standard|standar)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();

  if (isCourierPlaceholder(text)) return "";

  return text;
}

function collectStringsDeep(value: any, output: string[] = [], depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return output;

  if (typeof value === "string" || typeof value === "number") {
    const text = cleanText(value);
    if (text) output.push(text);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringsDeep(item, output, depth + 1);
    return output;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      collectStringsDeep(value[key], output, depth + 1);
    }
  }

  return output;
}

function extractCourierCandidates10B(body: AnyRecord): string[] {
  const direct = [
    body.courier_code,
    body.courier,
    body.courier_company,
    body.courier_name,
    body.shipping_courier,
    body.shipping_provider,
    body.shipping_service,
    body.expedition,
    body.expedition_code,
    body.expedition_name,
    body.service,
    body.service_type,
    body.shipment?.courier_code,
    body.shipment?.courier,
    body.shipment?.courier_company,
    body.shipment?.courier_name,
    body.shipment?.shipping_courier,
    body.shipment?.shipping_provider,
    body.shipment?.shipping_service,
    body.shipment?.expedition,
    body.shipment?.expedition_name,
    body.shipment?.service,
    body.shipment?.service_type,
    body.order?.courier_code,
    body.order?.courier,
    body.order?.courier_company,
    body.order?.courier_name,
    body.order?.shipping_courier,
    body.order?.shipping_provider,
    body.order?.shipping_service,
    body.order?.expedition,
    body.order?.expedition_name,
    body.order?.service,
    body.order?.service_type,
    body.order?.courier?.code,
    body.order?.courier?.company,
    body.order?.courier?.name,
  ].map(cleanText).filter(Boolean);

  const deep = collectStringsDeep(body).filter((text) =>
    /jne|tiki|j\s*&\s*t|jnt|sicepat|anteraja|ninja|lion|pos indonesia|wahana|sap|paxel|gosend|gojek|grab|id express|idexpress|spx|shopee express/i.test(text)
  );

  return [...direct, ...deep];
}

function bestCourierCode10B(body: AnyRecord): { input: string; code: string; candidates: string[] } {
  const candidates = extractCourierCandidates10B(body);

  for (const candidate of candidates) {
    const code = normalizeCourierCode10B(candidate);
    if (code) return { input: candidate, code, candidates };
  }

  return {
    input: firstNonEmpty(candidates),
    code: "",
    candidates,
  };
}

function extractWaybill10B(body: AnyRecord): string {
  return firstNonEmpty([
    body.waybill_id,
    body.waybill,
    body.resi,
    body.awb,
    body.tracking_number,
    body.receipt_number,
    body.courier_waybill_id,
    body.shipment?.waybill_id,
    body.shipment?.waybill,
    body.shipment?.tracking_number,
    body.shipment?.awb,
    body.order?.waybill_id,
    body.order?.waybill,
    body.order?.tracking_number,
    body.order?.courier?.waybill_id,
    body.order?.courier?.tracking_number,
  ]);
}

function extractBiteshipOrderId10B(body: AnyRecord): string {
  return firstNonEmpty([
    body.biteship_order_id,
    body.biteship_id,
    body.shipping_order_id,
    body.shipment_order_id,
    body.shipment?.biteship_order_id,
    body.shipment?.order_id,
    body.order?.biteship_order_id,
  ]);
}

async function fetchBiteship10B(path: string, apiKey: string): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(`https://api.biteship.com${path}`, {
    method: "GET",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch (_) {
    data = { message: await response.text().catch(() => "") };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function friendlyBiteshipError10B(raw: any, statusCode?: number): string {
  const rawMessage = cleanText(
    raw?.message ||
    raw?.error ||
    raw?.errors?.[0]?.message ||
    raw?.data?.message
  );

  const lower = rawMessage.toLowerCase();

  if (/cannot process authorization|authorization|unauthorized|forbidden|api key|token/.test(lower)) {
    return "Tracking belum dapat diproses karena kode kurir atau akses Biteship tidak valid. Jika pesanan lama/manual, lengkapi kurir aktual seperti JNE, TIKI, J&T, SiCepat, atau AnterAja.";
  }

  if (!rawMessage && statusCode === 404) {
    return "Data tracking belum ditemukan di Biteship. Pesanan lama/manual mungkin belum memiliki resi atau kode kurir yang valid.";
  }

  if (/not found|order not found|tracking.*not|waybill.*not|failed to retrieve/i.test(rawMessage)) {
    return "Data tracking belum ditemukan. Nomor resi mungkin belum aktif di kurir atau data order lama/manual belum lengkap.";
  }

  if (/waybill|resi|tracking|awb/.test(lower) && /not|tidak|invalid|kosong|empty|found|retrieve/.test(lower)) {
    return "Nomor resi belum tersedia atau belum dikenali oleh sistem kurir.";
  }

  if (/courier|kurir|company|code/.test(lower) && /not|tidak|invalid|kosong|empty|found/.test(lower)) {
    return "Kode kurir belum valid untuk tracking. Sistem sudah mencoba normalisasi, tetapi data order lama/manual mungkin perlu dilengkapi.";
  }

  if (/rate limit|too many/.test(lower)) {
    return "Biteship sedang membatasi permintaan tracking. Coba beberapa saat lagi.";
  }

  if (/timeout|network|fetch/.test(lower)) {
    return "Koneksi ke Biteship sedang bermasalah. Coba lagi beberapa saat.";
  }

  return "Tracking belum dapat diperbarui. Pesanan lama/manual mungkin belum memiliki data Biteship lengkap.";
}

function extractTrackingPayload10B(raw: any): any {
  return raw?.data || raw?.object || raw?.tracking || raw || {};
}

function extractHistory10B(payload: any): any[] {
  const candidates = [
    payload?.history,
    payload?.histories,
    payload?.tracking_history,
    payload?.tracking?.history,
    payload?.data?.history,
    payload?.object?.history,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function normalizeStatusLabel10B(statusInput: unknown): string {
  const status = cleanText(statusInput).toLowerCase();

  if (!status) return "Belum ada update tracking";
  if (/delivered|received|completed|finish|success|terkirim|diterima/.test(status)) return "Terkirim / diterima";
  if (/transit|dropping|on_process|on process|shipping|shipped|manifest|departed|arrived|perjalanan/.test(status)) return "Dalam perjalanan";
  if (/picked|pickup|pick_up|picked_up|penjemputan|dijemput/.test(status)) return "Dijemput kurir";
  if (/confirmed|allocated|courier_allocated|processing|process|created|pending/.test(status)) return "Diproses kurir";
  if (/cancel|canceled|cancelled|dibatalkan/.test(status)) return "Dibatalkan";
  if (/return|returned|retur|dikembalikan/.test(status)) return "Dikembalikan";
  if (/failed|problem|issue|exception|gagal|bermasalah/.test(status)) return "Bermasalah, perlu pengecekan";

  return cleanText(statusInput);
}

function latestStatusFromHistory10B(history: any[]): string {
  if (!Array.isArray(history) || history.length === 0) return "";

  const first = history[0] || {};
  const last = history[history.length - 1] || {};

  return first.status || first.note || first.description || last.status || last.note || last.description || "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      ok: false,
      tracking_available: false,
      code: "METHOD_NOT_ALLOWED",
      message: "Gunakan metode POST untuk cek tracking.",
    }, 200);
  }

  try {
    const apiKey = Deno.env.get("BITESHIP_API_KEY") || Deno.env.get("BITESHIP_TOKEN") || "";

    let body: AnyRecord = {};

    try {
      body = await req.json();
    } catch (_) {
      body = {};
    }

    const waybill = extractWaybill10B(body);
    const biteshipOrderId = extractBiteshipOrderId10B(body);
    const courierPick = bestCourierCode10B(body);
    const courierInput = courierPick.input;
    const courierCode = courierPick.code;

    if (!apiKey) {
      return jsonResponse({
        success: false,
        ok: false,
        tracking_available: false,
        code: "BITESHIP_API_KEY_MISSING",
        message: "Konfigurasi Biteship belum tersedia. Pastikan secret BITESHIP_API_KEY sudah diset di Supabase.",
        courier_input: courierInput,
        courier_code_normalized: courierCode,
        waybill_id: waybill,
        biteship_order_id: biteshipOrderId,
      }, 200);
    }

    if (!waybill) {
      return jsonResponse({
        success: false,
        ok: false,
        tracking_available: false,
        code: "WAYBILL_NOT_AVAILABLE",
        message: "Nomor resi belum tersedia. Tracking biasanya baru aktif setelah seller membuat booking dan kurir menerbitkan resi.",
        courier_input: courierInput,
        courier_code_normalized: courierCode,
        waybill_id: "",
        biteship_order_id: biteshipOrderId,
      }, 200);
    }

    if (!courierCode) {
      return jsonResponse({
        success: false,
        ok: false,
        tracking_available: false,
        code: "COURIER_CODE_NOT_AVAILABLE",
        message: "Kode kurir belum valid untuk tracking. Data saat ini terbaca sebagai provider/integrator, bukan kurir aktual. Lengkapi atau pilih kurir aktual seperti JNE, TIKI, J&T, SiCepat, atau AnterAja.",
        courier_input: courierInput,
        courier_code_normalized: "",
        courier_candidates: courierPick.candidates,
        waybill_id: waybill,
        biteship_order_id: biteshipOrderId,
      }, 200);
    }

    const trackingResult = await fetchBiteship10B(
      `/v1/trackings/${encodeURIComponent(waybill)}/couriers/${encodeURIComponent(courierCode)}`,
      apiKey
    );

    if (!trackingResult.ok) {
      return jsonResponse({
        success: false,
        ok: false,
        tracking_available: false,
        code: "BITESHIP_TRACKING_ERROR",
        message: friendlyBiteshipError10B(trackingResult.data, trackingResult.status),
        courier_input: courierInput,
        courier_code: courierCode,
        courier_code_normalized: courierCode,
        waybill_id: waybill,
        biteship_order_id: biteshipOrderId,
        biteship_status: trackingResult.status,
      }, 200);
    }

    const payload = extractTrackingPayload10B(trackingResult.data);
    const history = extractHistory10B(payload);

    const status = firstNonEmpty([
      payload?.status,
      payload?.shipment_status,
      payload?.delivery_status,
      payload?.tracking_status,
      latestStatusFromHistory10B(history),
    ]);

    const statusLabel = normalizeStatusLabel10B(status);

    return jsonResponse({
      success: true,
      ok: true,
      tracking_available: true,
      code: "TRACKING_OK",
      message: "Tracking berhasil diperbarui.",
      courier_input: courierInput,
      courier_code: courierCode,
      courier_code_normalized: courierCode,
      waybill_id: waybill,
      biteship_order_id: biteshipOrderId,
      status,
      status_label: statusLabel,
      tracking_status: status,
      shipment_status: status,
      tracking_history: history,
      history,
      tracking: payload,
    }, 200);
  } catch (err) {
    return jsonResponse({
      success: false,
      ok: false,
      tracking_available: false,
      code: "UNHANDLED_TRACKING_ERROR",
      message: "Tracking belum dapat diperbarui. Sistem mencegah pesan teknis mentah tampil ke pengguna.",
      technical_message: err instanceof Error ? err.message : String(err),
    }, 200);
  }
});
