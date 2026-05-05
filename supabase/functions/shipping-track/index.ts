// ============================================================
// UrbaNoiD Supabase Native
// Phase 3B.7U - Biteship Tracking Sync
// Supabase Edge Function: shipping-track
// ============================================================
// Frontend already calls:
//   supabase.functions.invoke("shipping-track", { body: { shipment_id } })
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

function toNumber(value: any, fallback: number | null = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCourier(value: any) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_\-]/g, "")
    .trim();
}

function normalizeStatus(value: any) {
  return asString(value)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "")
    .toUpperCase();
}

function getServiceRoleKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;

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

function mapBiteshipStatusToApp(status: string | null) {
  const s = asString(status).toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;

  if (["delivered"].includes(s)) return "DITERIMA";
  if (["picked", "droppingoff", "returnintransit"].includes(s)) return "DIKIRIM";
  if (s.includes("transit") || s.includes("dropping") || s.includes("picked")) return "DIKIRIM";
  if (["confirmed", "allocated", "pickingup"].includes(s)) return "DIKEMAS";
  if (["cancelled", "canceled", "rejected", "couriernotfound"].includes(s)) return "BELUM_DIKIRIM";

  return null;
}

function extractTrackingFields(payload: JsonRecord) {
  const courier = payload?.courier || payload?.order?.courier || {};
  const delivery = payload?.delivery || payload?.order?.delivery || {};
  const latestHistory = Array.isArray(payload?.history) && payload.history.length
    ? payload.history[payload.history.length - 1]
    : null;

  const status =
    nullableString(payload?.status) ||
    nullableString(payload?.order_status) ||
    nullableString(delivery?.status) ||
    nullableString(courier?.status) ||
    nullableString(latestHistory?.status) ||
    nullableString(payload?.message);

  const waybillId =
    nullableString(payload?.waybill_id) ||
    nullableString(payload?.courier_waybill_id) ||
    nullableString(courier?.waybill_id) ||
    nullableString(courier?.waybill_number) ||
    nullableString(payload?.order?.courier?.waybill_id);

  const trackingId =
    nullableString(payload?.id) ||
    nullableString(payload?.tracking_id) ||
    nullableString(courier?.tracking_id) ||
    nullableString(payload?.order?.courier?.tracking_id);

  const trackingUrl =
    nullableString(payload?.link) ||
    nullableString(payload?.tracking_url) ||
    nullableString(courier?.link) ||
    nullableString(courier?.tracking_url) ||
    nullableString(payload?.order?.courier?.link);

  const labelUrl =
    nullableString(payload?.label_url) ||
    nullableString(payload?.shipping_label_url) ||
    nullableString(courier?.label_url) ||
    nullableString(payload?.order?.courier?.label_url);

  const history =
    Array.isArray(payload?.history) ? payload.history :
    Array.isArray(payload?.trackings) ? payload.trackings :
    Array.isArray(payload?.events) ? payload.events :
    Array.isArray(payload?.details) ? payload.details :
    null;

  const actualShippingCost =
    // Phase 3B.7V actual cost candidates - lebih luas agar ongkir aktual Biteship mudah tampil di UI.
    toNumber(payload?.price) ??
    toNumber(payload?.shipping_price) ??
    toNumber(payload?.order_price) ??
    toNumber(payload?.shipment_fee) ??
    toNumber(payload?.total_price) ??
    toNumber(courier?.price) ??
    toNumber(courier?.freight_cost) ??
    toNumber(courier?.cost) ??
    toNumber(courier?.shipping_price) ??
    toNumber(payload?.pricing?.total_price) ??
    toNumber(delivery?.price) ??
    toNumber(payload?.order?.price) ??
    toNumber(payload?.order?.shipping_price) ??
    toNumber(payload?.order?.courier?.price) ??
    toNumber(payload?.order?.courier?.freight_cost) ??
    null;

  return {
    status,
    waybillId,
    trackingId,
    trackingUrl,
    labelUrl,
    history,
    actualShippingCost,
  };
}

function extractBiteshipError(payload: JsonRecord, fallback: string) {
  return (
    asString(payload?.error) ||
    asString(payload?.message) ||
    asString(payload?.detail) ||
    fallback
  );
}

async function fetchBiteshipJson(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": apiKey,
      "Accept": "application/json",
    },
  });

  let payload: JsonRecord = {};
  try {
    payload = await response.json();
  } catch (_) {
    payload = { message: await response.text() };
  }

  return { response, payload };
}

async function updateTrackingFailure(serviceClient: any, shipmentId: string, message: string, details?: JsonRecord) {
  await serviceClient
    .from("shipments")
    .update({
      biteship_error: message,
      tracking_response_json: details || null,
      tracking_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentId);
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
  if (!shipmentId) {
    return jsonResponse({ success: false, error: "shipment_id wajib dikirim." }, 400);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL belum tersedia di Edge Function.");

    const serviceKey = getServiceRoleKey();
    const biteshipApiKey = getBiteshipApiKey();
    if (!biteshipApiKey) throw new Error("Secret BITESHIP_API_KEY belum diset.");

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ success: false, error: "Login seller/admin diperlukan." }, 401);

    const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
    if (userError || !userData?.user) return jsonResponse({ success: false, error: "Token login tidak valid." }, 401);

    const userId = userData.user.id;
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    const role = asString(profile?.role).toUpperCase();
    if (!profile?.is_active || !["ADMIN", "SUPERADMIN", "SELLER"].includes(role)) {
      return jsonResponse({ success: false, error: "Akses seller/admin diperlukan untuk cek tracking." }, 403);
    }

    const { data: shipment, error: shipmentError } = await serviceClient
      .from("shipments")
      .select("*")
      .eq("id", shipmentId)
      .single();

    if (shipmentError || !shipment) return jsonResponse({ success: false, error: "Data shipment tidak ditemukan." }, 404);

    if (!shipment.provider_tracking_id && !shipment.tracking_number && !shipment.provider_order_id) {
      const msg = "Tracking ID, resi, atau Biteship Order ID belum tersedia.";
      await updateTrackingFailure(serviceClient, shipmentId, msg);
      return jsonResponse({ success: false, error: msg }, 400);
    }

    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("id", shipment.order_id)
      .maybeSingle();

    if (orderError) throw orderError;

    const apiBaseUrl = Deno.env.get("BITESHIP_API_BASE_URL") || "https://api.biteship.com";
    const base = apiBaseUrl.replace(/\/$/, "");
    const attempts: { label: string; url: string }[] = [];

    if (shipment.provider_tracking_id) {
      attempts.push({
        label: "tracking_id",
        url: `${base}/v1/trackings/${encodeURIComponent(asString(shipment.provider_tracking_id))}`,
      });
    }

    const courierCode = normalizeCourier(shipment.courier_code || shipment.courier_name || shipment.expedition_name || "jne");
    if (shipment.tracking_number && courierCode) {
      attempts.push({
        label: "public_waybill",
        url: `${base}/v1/trackings/${encodeURIComponent(asString(shipment.tracking_number))}/couriers/${encodeURIComponent(courierCode)}`,
      });
    }

    if (shipment.provider_order_id) {
      attempts.push({
        label: "order_id",
        url: `${base}/v1/orders/${encodeURIComponent(asString(shipment.provider_order_id))}`,
      });
    }

    let finalPayload: JsonRecord | null = null;
    let finalSource = "";
    let lastError = "";
    let lastPayload: JsonRecord | undefined;

    for (const attempt of attempts) {
      const { response, payload } = await fetchBiteshipJson(attempt.url, biteshipApiKey);
      lastPayload = payload;
      if (response.ok && payload?.success !== false) {
        finalPayload = payload;
        finalSource = attempt.label;
        break;
      }
      lastError = extractBiteshipError(payload, `Biteship tracking gagal di ${attempt.label} dengan HTTP ${response.status}.`);
    }

    if (!finalPayload) {
      const msg = lastError || "Biteship tracking gagal. Tidak ada response sukses dari endpoint tracking/order.";
      await updateTrackingFailure(serviceClient, shipmentId, msg, lastPayload);
      return jsonResponse({ success: false, error: msg, biteship: lastPayload || null }, 400);
    }

    const fields = extractTrackingFields(finalPayload);
    const trackingStatus = nullableString(fields.status);
    const normalizedTrackingStatus = normalizeStatus(trackingStatus || "CHECKED");
    const appShippingStatus = mapBiteshipStatusToApp(trackingStatus);

    const updatePayload: JsonRecord = {
      provider_name: "biteship",
      tracking_status: trackingStatus,
      tracking_number: fields.waybillId || shipment.tracking_number || null,
      provider_tracking_id: fields.trackingId || shipment.provider_tracking_id || null,
      tracking_url: fields.trackingUrl || shipment.tracking_url || null,
      label_url: fields.labelUrl || shipment.label_url || null,
      tracking_history_json: fields.history || null,
      tracking_response_json: finalPayload,
      actual_shipping_cost: fields.actualShippingCost,
      booking_status: normalizedTrackingStatus ? `BITESHIP_${normalizedTrackingStatus}` : (shipment.booking_status || "BITESHIP_TRACKED"),
      biteship_error: null,
      tracking_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (appShippingStatus) updatePayload.shipping_status = appShippingStatus;

    const { error: updateError } = await serviceClient
      .from("shipments")
      .update(updatePayload)
      .eq("id", shipmentId);

    if (updateError) throw updateError;

    if (order?.id && appShippingStatus) {
      await serviceClient
        .from("orders")
        .update({
          shipping_status: appShippingStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }

    if (order?.id) {
      await serviceClient
        .from("order_messages")
        .insert({
          order_id: order.id,
          sender_id: userId,
          sender_role: "SELLER",
          message: `Cek tracking Biteship berhasil. Status: ${trackingStatus || "tercek"}. Resi: ${fields.waybillId || shipment.tracking_number || "-"}.`,
          created_at: new Date().toISOString(),
        });
    }

    return jsonResponse({
      success: true,
      message: "Cek tracking Biteship berhasil.",
      shipment_id: shipmentId,
      order_id: order?.id || shipment.order_id,
      source: finalSource,
      tracking_status: trackingStatus,
      app_shipping_status: appShippingStatus,
      tracking_number: fields.waybillId || shipment.tracking_number || null,
      provider_tracking_id: fields.trackingId || shipment.provider_tracking_id || null,
      tracking_url: fields.trackingUrl || shipment.tracking_url || null,
      label_url: fields.labelUrl || shipment.label_url || null,
      actual_shipping_cost: fields.actualShippingCost,
      biteship: finalPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = supabaseUrl ? getServiceRoleKey() : "";
      if (supabaseUrl && serviceKey && shipmentId) {
        const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        await updateTrackingFailure(serviceClient, shipmentId, message);
      }
    } catch (_) {
      // ignore secondary failure
    }
    return jsonResponse({ success: false, error: message }, 500);
  }
});
