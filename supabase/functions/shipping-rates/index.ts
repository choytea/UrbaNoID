// ============================================================
// UrbaNoiD Supabase Native
// Phase 3B.7W - Biteship Rates Checkout Integration
// Supabase Edge Function: shipping-rates
// ============================================================
// Frontend calls:
//   supabase.functions.invoke("shipping-rates", { body: { destination, items, couriers } })
//
// Required secret:
//   BITESHIP_API_KEY="biteship_test_..." or production key later
// Optional secret:
//   BITESHIP_API_BASE_URL="https://api.biteship.com"
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, any>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function asString(value: any, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function nullableString(value: any) {
  const text = asString(value);
  return text ? text : null;
}

function toNumber(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveNumber(value: any, fallback = 0) {
  const n = toNumber(value, fallback);
  return n > 0 ? n : fallback;
}

function parsePostalCode(value: any): number | undefined {
  const digits = asString(value).replace(/\D/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

function cleanPhone(value: any) {
  const raw = asString(value);
  if (!raw) return "";
  const plus = raw.startsWith("+") ? "+" : "";
  return plus + raw.replace(/[^0-9]/g, "");
}

function normalizeCourierList(value: any) {
  const raw = Array.isArray(value) ? value.join(",") : asString(value || "jne,sicepat,anteraja,jnt,pos,tiki");
  return raw
    .split(/[\s,;|]+/g)
    .map((x) => x.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, ""))
    .filter(Boolean)
    .join(",");
}

function getServiceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed?.service_role) return parsed.service_role;
      if (parsed?.serviceRole) return parsed.serviceRole;
      if (parsed?.secret) return parsed.secret;
      const values = Object.values(parsed).filter(Boolean);
      if (values.length) return String(values[0]);
    } catch (_) {
      // ignore malformed env and fall through
    }
  }
  throw new Error("SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEYS belum tersedia di Edge Function.");
}

function getBiteshipApiKey() {
  return (
    Deno.env.get("BITESHIP_API_KEY") ||
    Deno.env.get("BITESHIP_TEST_API_KEY") ||
    Deno.env.get("BITESHIP_TOKEN") ||
    ""
  ).trim();
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function normalizeItem(item: JsonRecord, index: number) {
  const qty = Math.max(1, Math.floor(toPositiveNumber(item.qty || item.quantity, 1)));
  const unitValue = Math.max(1, Math.round(toPositiveNumber(item.unit_price || item.price || item.value || item.subtotal, 1)));
  const subtotal = Math.max(1, Math.round(toPositiveNumber(item.subtotal, unitValue * qty)));
  const weight = Math.max(1, Math.round(toPositiveNumber(item.weight_gram || item.weight || item.package_weight_gram, 250)));

  const result: JsonRecord = {
    name: asString(item.product_name || item.name || `Produk ${index + 1}`),
    description: [item.color_name, item.size_name, item.pattern_type].filter(Boolean).join(" / ") || undefined,
    sku: nullableString(item.sku_variant || item.sku_product || item.sku),
    category: "fashion",
    value: Math.max(1, Math.round(subtotal / qty)),
    quantity: qty,
    weight,
  };

  const length = toNumber(item.package_length_cm || item.length_cm || item.length, 0);
  const width = toNumber(item.package_width_cm || item.width_cm || item.width, 0);
  const height = toNumber(item.package_height_cm || item.height_cm || item.height, 0);
  if (length > 0) result.length = length;
  if (width > 0) result.width = width;
  if (height > 0) result.height = height;
  return result;
}

function buildItems(inputItems: JsonRecord[], fallbackSubtotal = 0) {
  const rows = Array.isArray(inputItems) ? inputItems : [];
  const mapped = rows.map((item, index) => normalizeItem(item, index)).filter(Boolean);
  if (mapped.length) return mapped;
  return [{
    name: "Produk UrbaNoiD",
    category: "fashion",
    value: Math.max(1, Math.round(toPositiveNumber(fallbackSubtotal, 85000))),
    quantity: 1,
    weight: 500,
  }];
}

function extractRates(payload: JsonRecord) {
  const candidates = [
    payload?.pricing,
    payload?.prices,
    payload?.rates,
    payload?.data?.pricing,
    payload?.data?.prices,
    payload?.data?.rates,
    payload?.couriers,
    payload?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function ratePrice(rate: JsonRecord) {
  const candidates = [
    rate?.price,
    rate?.shipping_price,
    rate?.shipment_fee,
    rate?.total_price,
    rate?.amount,
    rate?.cost,
    rate?.freight_cost,
    rate?.final_price,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate, 0);
    if (value > 0) return value;
  }
  return 0;
}

function normalizeRate(rate: JsonRecord, index: number) {
  const courierCode = asString(rate.courier_code || rate.courier_company || rate.company || rate.code || rate.courier?.code);
  const courierName = asString(rate.courier_name || rate.courier_company || rate.company || rate.courier?.name || courierCode).toUpperCase();
  const serviceCode = asString(rate.courier_service_code || rate.courier_type || rate.service_code || rate.type || rate.service?.code || rate.code);
  const serviceName = asString(rate.courier_service_name || rate.service_name || rate.service || rate.name || serviceCode).toUpperCase();
  const price = ratePrice(rate);
  const duration = nullableString(rate.duration || rate.shipment_duration_range || rate.etd || rate.estimated_delivery || rate.delivery_time);
  const description = nullableString(rate.description || rate.courier_description || rate.service_description);
  const id = asString(rate.id || rate.rate_id || `${courierCode}-${serviceCode}-${price}-${index}`).replace(/\s+/g, "-");

  return {
    id,
    provider: "biteship",
    courier_code: courierCode,
    courier_name: courierName,
    courier_company: courierCode || courierName.toLowerCase(),
    service_code: serviceCode,
    service_name: serviceName,
    courier_type: serviceCode,
    price,
    duration,
    description,
    raw: rate,
  };
}

function buildRatesPayload(store: JsonRecord, destination: JsonRecord, items: JsonRecord[], couriers: any, fallbackSubtotal: number) {
  const originPostalCode = parsePostalCode(store.postal_code || store.kode_pos);
  const destinationPostalCode = parsePostalCode(destination.postal_code || destination.kode_pos || destination.shipping_postal_code);

  const payload: JsonRecord = {
    couriers: normalizeCourierList(couriers),
    items: buildItems(items, fallbackSubtotal),
  };

  if (originPostalCode) payload.origin_postal_code = originPostalCode;
  if (destinationPostalCode) payload.destination_postal_code = destinationPostalCode;
  if (store.origin_area_id) payload.origin_area_id = store.origin_area_id;
  if (store.origin_location_id) payload.origin_location_id = store.origin_location_id;
  if (destination.destination_area_id || destination.area_id) payload.destination_area_id = destination.destination_area_id || destination.area_id;
  if (destination.destination_location_id || destination.location_id) payload.destination_location_id = destination.destination_location_id || destination.location_id;

  const originLat = toNumber(store.origin_latitude, NaN);
  const originLng = toNumber(store.origin_longitude, NaN);
  if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
    payload.origin_latitude = originLat;
    payload.origin_longitude = originLng;
  }

  const destLat = toNumber(destination.latitude || destination.destination_latitude, NaN);
  const destLng = toNumber(destination.longitude || destination.destination_longitude, NaN);
  if (Number.isFinite(destLat) && Number.isFinite(destLng)) {
    payload.destination_latitude = destLat;
    payload.destination_longitude = destLng;
  }

  return payload;
}

function validatePayload(payload: JsonRecord, destination: JsonRecord) {
  const errors: string[] = [];
  if (!payload.origin_postal_code && !payload.origin_area_id && !payload.origin_location_id && !(payload.origin_latitude && payload.origin_longitude)) {
    errors.push("Origin toko belum lengkap. Isi kode pos toko, origin area/location ID, atau koordinat toko pada Profil Toko.");
  }
  if (!payload.destination_postal_code && !payload.destination_area_id && !payload.destination_location_id && !(payload.destination_latitude && payload.destination_longitude)) {
    errors.push("Alamat buyer belum lengkap. Isi kode pos tujuan atau area/location ID tujuan.");
  }
  if (!destination?.address && !destination?.shipping_address && !destination?.address_line) {
    // Tidak selalu wajib untuk Rates API, tetapi membantu validasi checkout.
  }
  if (!payload.couriers) errors.push("Daftar kurir belum tersedia.");
  if (!payload.items?.length) errors.push("Item pengiriman belum tersedia.");
  if (errors.length) throw new Error(errors.join(" "));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method tidak didukung." }, 405);

  let body: JsonRecord = {};
  try { body = await req.json(); } catch (_) { body = {}; }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL belum tersedia di Edge Function.");

    const serviceClient = createClient(supabaseUrl, getServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ success: false, error: "Login buyer/seller diperlukan untuk menghitung ongkir." }, 401);

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !userData?.user) return jsonResponse({ success: false, error: "Token login tidak valid." }, 401);

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id, role, is_active, full_name, email, phone, address_line, district, city, province, postal_code")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (!profile?.is_active) return jsonResponse({ success: false, error: "Profil user tidak aktif." }, 403);

    const { data: storeRows, error: storeError } = await serviceClient
      .from("store_profiles")
      .select("*")
      .eq("is_active", true)
      .limit(1);
    if (storeError) throw storeError;
    const store = Array.isArray(storeRows) && storeRows.length ? storeRows[0] : null;
    if (!store) return jsonResponse({ success: false, error: "Profil toko aktif belum tersedia." }, 400);

    let destination: JsonRecord = body.destination || {};
    let items: JsonRecord[] = Array.isArray(body.items) ? body.items : [];
    let fallbackSubtotal = toNumber(body.subtotal || body.subtotal_amount || body.total_items_amount, 0);

    if (body.order_id) {
      const { data: order, error: orderError } = await serviceClient.from("orders").select("*").eq("id", body.order_id).single();
      if (orderError || !order) return jsonResponse({ success: false, error: "Order tidak ditemukan." }, 404);
      const { data: orderItems } = await serviceClient.from("order_items").select("*").eq("order_id", body.order_id);
      const { data: shipment } = await serviceClient.from("shipments").select("*").eq("order_id", body.order_id).limit(1).maybeSingle();
      destination = {
        ...destination,
        shipping_address: shipment?.address || order.shipping_address,
        postal_code: shipment?.postal_code || order.shipping_postal_code,
        district: shipment?.district || order.shipping_district,
        city: shipment?.city || order.shipping_city,
        province: shipment?.province || order.shipping_province,
        phone: shipment?.phone || order.customer_phone,
      };
      items = Array.isArray(orderItems) ? orderItems : items;
      fallbackSubtotal = toNumber(order.subtotal_amount || order.total_amount || order.grand_total, fallbackSubtotal);
    } else if (!destination?.postal_code && !destination?.shipping_postal_code && !destination?.area_id) {
      destination = {
        ...destination,
        address_line: profile.address_line,
        postal_code: profile.postal_code,
        district: profile.district,
        city: profile.city,
        province: profile.province,
        phone: profile.phone,
      };
    }

    const biteshipApiKey = getBiteshipApiKey();
    if (!biteshipApiKey) throw new Error("Secret BITESHIP_API_KEY belum diset di Supabase.");

    const requestCouriers = normalizeCourierList(body.couriers || body.courier || body.courier_company);
    const payload = buildRatesPayload(store, destination, items, requestCouriers, fallbackSubtotal);
    validatePayload(payload, destination);

    const apiBaseUrl = Deno.env.get("BITESHIP_API_BASE_URL") || "https://api.biteship.com";
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v1/rates/couriers`, {
      method: "POST",
      headers: {
        "Authorization": biteshipApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let biteshipResult: JsonRecord = {};
    try { biteshipResult = await response.json(); } catch (_) { biteshipResult = { message: await response.text() }; }

    // Phase 3B.7W-R2 non-2xx friendly: frontend supabase.functions.invoke treats non-2xx as transport error.
    // Return HTTP 200 with success:false so checkout can show the real Biteship validation message.
    if (!response.ok || biteshipResult.success === false) {
      const message = asString(biteshipResult?.error || biteshipResult?.message || biteshipResult?.detail, `Biteship Rates API gagal HTTP ${response.status}.`);
      return jsonResponse({ success: false, error: message, request_payload: payload, biteship: biteshipResult, http_status: response.status }, 200);
    }

    const rates = extractRates(biteshipResult)
      .map((rate: JsonRecord, index: number) => normalizeRate(rate, index))
      .filter((rate: JsonRecord) => rate.price > 0 && (rate.courier_code || rate.courier_name) && (rate.service_code || rate.service_name))
      .sort((a: JsonRecord, b: JsonRecord) => a.price - b.price);

    return jsonResponse({
      success: true,
      message: "Ongkir Biteship berhasil dihitung.",
      request_payload: payload,
      rates,
      raw: biteshipResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
