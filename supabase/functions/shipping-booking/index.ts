// ============================================================
// UrbaNoiD Supabase Native
// Phase 3B.7T - Biteship Testing Booking Integration
// Supabase Edge Function: shipping-booking
// ============================================================
// Frontend calls:
//   supabase.functions.invoke("shipping-booking", { body: { shipment_id } })
//
// Required secret:
//   BITESHIP_API_KEY="biteship_test_..."
// Optional secrets:
//   BITESHIP_API_BASE_URL="https://api.biteship.com"
//   BITESHIP_TESTING_MODE="true"
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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
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

function normalizeCourier(value: any) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "")
    .trim();
}

function normalizeService(value: any) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "")
    .trim();
}

function normalizeCollectionMethod(value: any) {
  const text = asString(value).toLowerCase();
  if (text.includes("drop")) return "drop_off";
  return "pickup";
}

function makeReferenceId(order: JsonRecord) {
  const raw = asString(order.order_number || order.order_no || order.display_order_no || order.id);
  return `urbanoid-${raw}`.replace(/[^a-zA-Z0-9_\-]/g, "-").slice(0, 80);
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

function buildItems(items: JsonRecord[], order: JsonRecord) {
  const rows = Array.isArray(items) ? items : [];

  const mapped = rows.map((item, index) => {
    const qty = Math.max(1, Math.floor(toPositiveNumber(item.qty || item.quantity, 1)));
    const value = Math.max(1, Math.round(toPositiveNumber(item.unit_price || item.price || item.subtotal, 1)));
    const weight = Math.max(1, Math.round(toPositiveNumber(item.weight_gram || item.weight || item.package_weight_gram, 250)));

    const result: JsonRecord = {
      name: asString(item.product_name || item.name || `Produk ${index + 1}`),
      description: [item.color_name, item.size_name, item.pattern_type].filter(Boolean).join(" / ") || undefined,
      sku: nullableString(item.sku_variant || item.sku_product || item.sku),
      category: "fashion",
      value,
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
  });

  if (mapped.length) return mapped;

  return [{
    name: `Pesanan ${asString(order.order_number || order.order_no || order.id)}`,
    category: "fashion",
    value: Math.max(1, Math.round(toPositiveNumber(order.grand_total || order.total_amount || order.subtotal_amount, 1))),
    quantity: 1,
    weight: 500,
  }];
}

function extractBiteshipError(payload: JsonRecord, fallback: string) {
  return (
    asString(payload?.error) ||
    asString(payload?.message) ||
    asString(payload?.detail) ||
    fallback
  );
}

function buildBiteshipPayload(store: JsonRecord, order: JsonRecord, shipment: JsonRecord, items: JsonRecord[]) {
  const courierCompany = normalizeCourier(shipment.provider_courier_company || shipment.courier_code || order.shipping_courier_company || shipment.courier_name || shipment.expedition_name);
  const courierType = normalizeService(shipment.provider_service_code || shipment.provider_courier_type || order.shipping_courier_type || shipment.service_name || order.shipping_courier_service_name || shipment.courier_type);

  const originContactName = asString(store.origin_contact_name || store.store_name);
  const originPhone = cleanPhone(store.whatsapp || store.phone || store.telepon);
  const originAddress = asString(store.address_line || store.address || store.alamat_toko);
  const originPostalCode = parsePostalCode(store.postal_code || store.kode_pos);

  const destinationName = asString(shipment.recipient_name || order.customer_name);
  const destinationPhone = cleanPhone(shipment.phone || order.customer_phone);
  const destinationAddress = asString(shipment.address || order.shipping_address);
  const destinationPostalCode = parsePostalCode(shipment.postal_code || order.shipping_postal_code);

  const validationErrors: string[] = [];
  if (!courierCompany) validationErrors.push("Kurir pengiriman belum tersedia. Isi courier_code/courier_name pada data shipment/ekspedisi.");
  if (!courierType) validationErrors.push("Service pengiriman belum tersedia. Isi service_name, contoh REG.");
  if (!originContactName) validationErrors.push("Nama kontak pickup toko belum tersedia.");
  if (!originPhone) validationErrors.push("Nomor HP/WhatsApp toko belum tersedia.");
  if (!originAddress) validationErrors.push("Alamat pickup toko belum tersedia.");
  if (!originPostalCode && !store.origin_area_id && !store.origin_location_id && !(store.origin_latitude && store.origin_longitude)) {
    validationErrors.push("Origin toko perlu postal code, area_id, location_id, atau koordinat.");
  }
  if (!destinationName) validationErrors.push("Nama penerima/buyer belum tersedia.");
  if (!destinationPhone) validationErrors.push("Nomor HP buyer belum tersedia.");
  if (!destinationAddress) validationErrors.push("Alamat buyer belum tersedia.");
  if (!destinationPostalCode && !shipment.destination_area_id && !shipment.destination_location_id) {
    validationErrors.push("Alamat buyer perlu kode pos atau area/location id tujuan.");
  }

  if (validationErrors.length) {
    throw new Error(validationErrors.join(" "));
  }

  const payload: JsonRecord = {
    shipper_contact_name: originContactName,
    shipper_contact_phone: originPhone,
    shipper_contact_email: nullableString(store.email),
    shipper_organization: nullableString(store.store_name),

    origin_contact_name: originContactName,
    origin_contact_phone: originPhone,
    origin_contact_email: nullableString(store.email),
    origin_address: originAddress,
    origin_note: nullableString(store.origin_note),
    origin_collection_method: normalizeCollectionMethod(store.origin_collection_method),

    destination_contact_name: destinationName,
    destination_contact_phone: destinationPhone,
    destination_contact_email: nullableString(order.customer_email),
    destination_address: destinationAddress,
    destination_note: nullableString(order.notes),

    courier_company: courierCompany,
    courier_type: courierType,
    delivery_type: "now",
    order_note: nullableString(order.notes || store.origin_note),
    reference_id: makeReferenceId(order),
    tags: ["urbanoid", "testing"],
    metadata: {
      app: "UrbaNoiD Supabase Native",
      phase: "3B.7T",
      order_id: order.id,
      shipment_id: shipment.id,
      testing: true,
    },
    items: buildItems(items, order),
  };

  if (originPostalCode) payload.origin_postal_code = originPostalCode;
  if (destinationPostalCode) payload.destination_postal_code = destinationPostalCode;
  if (store.origin_area_id) payload.origin_area_id = store.origin_area_id;
  if (store.origin_location_id) payload.origin_location_id = store.origin_location_id;

  const originLat = toNumber(store.origin_latitude, NaN);
  const originLng = toNumber(store.origin_longitude, NaN);
  if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
    payload.origin_coordinate = { latitude: originLat, longitude: originLng };
  }

  if (shipment.destination_area_id) payload.destination_area_id = shipment.destination_area_id;
  if (shipment.destination_location_id) payload.destination_location_id = shipment.destination_location_id;

  return payload;
}

async function updateShipmentFailure(serviceClient: any, shipmentId: string, message: string, details?: JsonRecord) {
  await serviceClient
    .from("shipments")
    .update({
      booking_status: "BITESHIP_FAILED",
      biteship_error: message,
      provider_response_json: details || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentId);
}


function extractBiteshipActualShippingCost(payload: JsonRecord) {
  // Phase 3B.7V - simpan ongkir aktual dari response booking bila tersedia.
  const courier = payload?.courier || {};
  const candidates = [
    payload?.price,
    payload?.shipping_price,
    payload?.order_price,
    payload?.shipment_fee,
    payload?.total_price,
    courier?.price,
    courier?.freight_cost,
    courier?.cost,
    courier?.shipping_price,
    payload?.pricing?.total_price,
    payload?.delivery?.price,
    payload?.order?.price,
    payload?.order?.shipping_price,
    payload?.order?.courier?.price,
    payload?.order?.courier?.freight_cost,
  ];
  for (const candidate of candidates) {
    const value = toNumber(candidate, 0);
    if (value > 0) return value;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method tidak didukung." }, 405);

  let body: JsonRecord = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const shipmentId = asString(body.shipment_id || body.shipmentId);
  const force = Boolean(body.force);

  if (!shipmentId) {
    return jsonResponse({ success: false, error: "shipment_id wajib dikirim." }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL belum tersedia di Edge Function.");

    const serviceKey = getServiceRoleKey();
    const biteshipApiKey = getBiteshipApiKey();
    if (!biteshipApiKey) {
      throw new Error("Secret BITESHIP_API_KEY belum diset. Gunakan API Key Testing Biteship pada Supabase secrets.");
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ success: false, error: "Login seller/admin diperlukan." }, 401);

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ success: false, error: "Token login tidak valid." }, 401);
    }

    const userId = userData.user.id;

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = asString(profile?.role).toUpperCase();
    if (!profile?.is_active || !["ADMIN", "SUPERADMIN", "SELLER"].includes(role)) {
      return jsonResponse({ success: false, error: "Akses seller/admin diperlukan untuk Booking Biteship." }, 403);
    }

    const { data: shipment, error: shipmentError } = await serviceClient
      .from("shipments")
      .select("*")
      .eq("id", shipmentId)
      .single();

    if (shipmentError || !shipment) {
      return jsonResponse({ success: false, error: "Data shipment tidak ditemukan." }, 404);
    }

    if (shipment.provider_order_id && !force) {
      return jsonResponse({
        success: true,
        already_booked: true,
        message: "Shipment ini sudah memiliki Biteship Order ID.",
        shipment,
      });
    }

    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("id", shipment.order_id)
      .single();

    if (orderError || !order) {
      await updateShipmentFailure(serviceClient, shipmentId, "Order terkait shipment tidak ditemukan.");
      return jsonResponse({ success: false, error: "Order terkait shipment tidak ditemukan." }, 404);
    }

    const [{ data: itemRows, error: itemsError }, { data: storeRows, error: storeError }] = await Promise.all([
      serviceClient.from("order_items").select("*").eq("order_id", order.id),
      serviceClient.from("store_profiles").select("*").eq("is_active", true).limit(1),
    ]);

    if (itemsError) throw itemsError;
    if (storeError) throw storeError;

    const store = Array.isArray(storeRows) && storeRows.length ? storeRows[0] : null;
    if (!store) {
      await updateShipmentFailure(serviceClient, shipmentId, "Profil toko aktif belum tersedia.");
      return jsonResponse({ success: false, error: "Profil toko aktif belum tersedia." }, 400);
    }

    let biteshipPayload: JsonRecord;
    try {
      biteshipPayload = buildBiteshipPayload(store, order, shipment, itemRows || []);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : String(validationError);
      await updateShipmentFailure(serviceClient, shipmentId, message);
      return jsonResponse({ success: false, error: message }, 400);
    }

    const apiBaseUrl = Deno.env.get("BITESHIP_API_BASE_URL") || "https://api.biteship.com";
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v1/orders`, {
      method: "POST",
      headers: {
        "Authorization": biteshipApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(biteshipPayload),
    });

    let biteshipResult: JsonRecord = {};
    try {
      biteshipResult = await response.json();
    } catch (_) {
      biteshipResult = { message: await response.text() };
    }

    if (!response.ok || biteshipResult.success === false) {
      const message = extractBiteshipError(biteshipResult, `Biteship API gagal dengan HTTP ${response.status}.`);
      await updateShipmentFailure(serviceClient, shipmentId, message, biteshipResult);
      return jsonResponse({ success: false, error: message, biteship: biteshipResult }, response.ok ? 400 : response.status);
    }

    const courier = biteshipResult.courier || {};
    const providerOrderId = nullableString(biteshipResult.id || biteshipResult.order_id || biteshipResult.object_id);
    const trackingId = nullableString(courier.tracking_id || biteshipResult.tracking_id);
    const waybillId = nullableString(courier.waybill_id || courier.waybill_number || biteshipResult.waybill_id);
    const trackingUrl = nullableString(courier.link || courier.tracking_url || biteshipResult.tracking_url);
    const labelUrl = nullableString(courier.label_url || biteshipResult.label_url || biteshipResult.shipping_label_url);

    const { error: updateError } = await serviceClient
      .from("shipments")
      .update({
        provider_name: "biteship",
        provider_rate_id: shipment.provider_rate_id || order.shipping_rate_id || null,
        provider_order_id: providerOrderId,
        provider_tracking_id: trackingId,
        tracking_number: waybillId,
        tracking_url: trackingUrl,
        label_url: labelUrl,
        booking_status: "BITESHIP_BOOKED",
        biteship_error: null,
        provider_response_json: biteshipResult,
        shipping_rate_response_json: shipment.shipping_rate_response_json || order.shipping_rate_response_json || null,
        actual_shipping_cost: extractBiteshipActualShippingCost(biteshipResult),
        booking_created_at: new Date().toISOString(),
        shipping_status: shipment.shipping_status || "DIKEMAS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shipmentId);

    if (updateError) throw updateError;

    await serviceClient
      .from("orders")
      .update({
        shipping_status: order.shipping_status || "DIKEMAS",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await serviceClient
      .from("order_messages")
      .insert({
        order_id: order.id,
        sender_id: userId,
        sender_role: "SELLER",
        message: `Booking Biteship testing berhasil. Order ID: ${providerOrderId || "-"}. Resi: ${waybillId || "belum tersedia"}.`,
        created_at: new Date().toISOString(),
      });

    return jsonResponse({
      success: true,
      message: "Booking Biteship testing berhasil.",
      shipment_id: shipmentId,
      order_id: order.id,
      provider_order_id: providerOrderId,
      provider_tracking_id: trackingId,
      tracking_number: waybillId,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      biteship_status: biteshipResult.status || null,
      biteship: biteshipResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = supabaseUrl ? getServiceRoleKey() : "";
      if (supabaseUrl && serviceKey && shipmentId) {
        const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await updateShipmentFailure(serviceClient, shipmentId, message);
      }
    } catch (_) {
      // ignore secondary failure
    }
    return jsonResponse({ success: false, error: message }, 500);
  }
});
