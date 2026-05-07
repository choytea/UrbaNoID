// Phase 3B.8-R2 — Biteship Order Retrieve Mapping Polish
// Phase 3B.8-R2-R1 syntax hotfix: remove escaped template literals for Deno deploy
// Supabase Edge Function: shipping-track
//
// Tujuan:
// - Memperkuat Cek Tracking dengan fallback GET /v1/orders/:id.
// - Membaca response order Biteship testing/production secara lengkap:
//   response.status, courier.tracking_id, courier.waybill_id, courier.link,
//   courier.history, courier.shipment_fee, price.
// - Menyimpan hasil ke public.shipments tanpa menaruh API key di frontend.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PHASE = "3B.8-R2";
const BITESHIP_BASE_URL = "https://api.biteship.com";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: corsHeaders,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function getPath(obj: unknown, path: Array<string | number>): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
      continue;
    }
    if (isRecord(current) && typeof key === "string") {
      current = current[key];
      continue;
    }
    return undefined;
  }
  return current;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function lastStatusFromHistory(history: unknown): string | null {
  const arr = getArray(history);
  if (!arr.length) return null;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    const item = arr[i];
    if (isRecord(item)) {
      const status = firstString(item.status, item.status_code, item.event);
      if (status) return status;
    }
  }
  return null;
}

function normalizeBiteshipStatus(status: string | null, hasOrderId: boolean): string {
  const raw = (status || "").trim();
  if (!raw && hasOrderId) return "BITESHIP_BOOKED";
  if (!raw) return "BITESHIP_UNKNOWN";
  const clean = raw
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .toUpperCase();
  return clean.startsWith("BITESHIP_") ? clean : "BITESHIP_" + clean;
}

function mapShippingStatus(rawStatus: string | null): string | null {
  const status = (rawStatus || "").toLowerCase();
  if (!status) return null;
  if (/(cancel|failed|return|returned)/.test(status)) return "DIBATALKAN";
  if (/(delivered|completed|done|finished|received)/.test(status)) return "DITERIMA";
  if (/(drop|dropping|transit|in_transit|on_delivery|deliver|picked|pickup|picked_up|otw)/.test(status)) return "DIKIRIM";
  if (/(confirmed|allocated|booked|booking|created|scheduled|pending|process)/.test(status)) return "DIKEMAS";
  return null;
}

function pickPayloadRoot(payload: unknown): unknown {
  // Biteship response sering root object langsung.
  // Beberapa endpoint bisa mengembalikan data/object nested.
  if (!isRecord(payload)) return payload;
  if (isRecord(payload.data)) return payload.data;
  if (isRecord(payload.order)) return payload.order;
  return payload;
}

type NormalizedTracking = {
  providerOrderId: string | null;
  providerTrackingId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  courierCompany: string | null;
  courierType: string | null;
  rawStatus: string | null;
  bookingStatus: string;
  shippingStatus: string | null;
  actualShippingCost: number | null;
  biteshipTotalPrice: number | null;
  history: unknown[];
  response: unknown;
};

function normalizeBiteshipResponse(payload: unknown, previous: Record<string, unknown>): NormalizedTracking {
  const root = pickPayloadRoot(payload);
  const courier = getPath(root, ["courier"]);
  const courierObj = isRecord(courier) ? courier : {};
  const history = getArray(courierObj.history).length
    ? getArray(courierObj.history)
    : getArray(getPath(root, ["history"]));

  const rawStatus = firstString(
    getPath(root, ["status"]),
    getPath(root, ["order_status"]),
    getPath(root, ["delivery", "status"]),
    getPath(courierObj, ["status"]),
    lastStatusFromHistory(history),
    previous.tracking_status,
    previous.booking_status,
  );

  const providerOrderId = firstString(
    getPath(root, ["id"]),
    getPath(root, ["order_id"]),
    getPath(root, ["biteship_order_id"]),
    previous.provider_order_id,
  );

  const providerTrackingId = firstString(
    getPath(courierObj, ["tracking_id"]),
    getPath(root, ["tracking_id"]),
    getPath(root, ["courier_tracking_id"]),
    previous.provider_tracking_id,
  );

  const trackingNumber = firstString(
    getPath(courierObj, ["waybill_id"]),
    getPath(courierObj, ["waybill"]),
    getPath(courierObj, ["tracking_number"]),
    getPath(root, ["waybill_id"]),
    getPath(root, ["waybill"]),
    getPath(root, ["tracking_number"]),
    previous.tracking_number,
  );

  const trackingUrl = firstString(
    getPath(courierObj, ["link"]),
    getPath(courierObj, ["tracking_link"]),
    getPath(root, ["tracking_url"]),
    getPath(root, ["tracking_link"]),
    previous.tracking_url,
  );

  const courierCompany = firstString(
    getPath(courierObj, ["company"]),
    getPath(root, ["courier_company"]),
    previous.courier_company,
    previous.provider_name,
  );

  const courierType = firstString(
    getPath(courierObj, ["type"]),
    getPath(root, ["courier_type"]),
    getPath(root, ["courier_service"]),
    previous.courier_type,
    previous.service_type,
  );

  const actualShippingCost = firstNumber(
    getPath(courierObj, ["shipment_fee"]),
    getPath(courierObj, ["shipping_cost"]),
    getPath(courierObj, ["price"]),
    getPath(root, ["courier", "shipment_fee"]),
    getPath(root, ["delivery", "fee"]),
    getPath(root, ["shipment_fee"]),
    getPath(root, ["shipping_cost"]),
    getPath(root, ["actual_shipping_cost"]),
    previous.actual_shipping_cost,
  );

  const biteshipTotalPrice = firstNumber(
    getPath(root, ["price"]),
    getPath(root, ["total_price"]),
    getPath(root, ["amount"]),
  );

  return {
    providerOrderId,
    providerTrackingId,
    trackingNumber,
    trackingUrl,
    courierCompany,
    courierType,
    rawStatus,
    bookingStatus: normalizeBiteshipStatus(rawStatus, Boolean(providerOrderId)),
    shippingStatus: mapShippingStatus(rawStatus),
    actualShippingCost,
    biteshipTotalPrice,
    history,
    response: payload,
  };
}

function biteshipAuthHeaders(apiKey: string): HeadersInit {
  const authValue = "Basic " + btoa(apiKey + ":");
  return {
    Authorization: authValue,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function fetchBiteship(apiKey: string, path: string): Promise<{
  ok: boolean;
  status: number;
  path: string;
  payload: unknown;
  error: string | null;
}> {
  try {
    const response = await fetch(BITESHIP_BASE_URL + path, {
      method: "GET",
      headers: biteshipAuthHeaders(apiKey),
    });
    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_) {
      // keep text payload
    }

    const message = isRecord(payload)
      ? firstString(payload.message, payload.error, payload.errors)
      : null;

    const successFlag = isRecord(payload) ? payload.success : undefined;
    const ok = response.ok && successFlag !== false;
    return {
      ok,
      status: response.status,
      path,
      payload,
      error: ok ? null : (message || ("Biteship returned HTTP " + response.status)),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      path,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function selectShipment(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const shipmentId = firstString(body.shipment_id, body.shipmentId, body.id);
  const orderId = firstString(body.order_id, body.orderId);
  const providerOrderId = firstString(body.provider_order_id, body.providerOrderId, body.biteship_order_id);
  const trackingNumber = firstString(body.tracking_number, body.trackingNumber, body.waybill_id, body.waybill);
  const providerTrackingId = firstString(body.provider_tracking_id, body.providerTrackingId, body.tracking_id);

  const selectColumns = "*";

  if (shipmentId) {
    const { data, error } = await supabase.from("shipments").select(selectColumns).eq("id", shipmentId).maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  if (orderId) {
    const { data, error } = await supabase.from("shipments").select(selectColumns).eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  if (providerOrderId) {
    const { data, error } = await supabase.from("shipments").select(selectColumns).eq("provider_order_id", providerOrderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  if (trackingNumber) {
    const { data, error } = await supabase.from("shipments").select(selectColumns).eq("tracking_number", trackingNumber).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  if (providerTrackingId) {
    const { data, error } = await supabase.from("shipments").select(selectColumns).eq("provider_tracking_id", providerTrackingId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data as Record<string, unknown>;
  }

  return null;
}

function buildBiteshipLookupPaths(shipment: Record<string, unknown>, body: Record<string, unknown>): string[] {
  const paths: string[] = [];

  const providerTrackingId = firstString(
    body.provider_tracking_id,
    body.providerTrackingId,
    body.tracking_id,
    shipment.provider_tracking_id,
  );

  const trackingNumber = firstString(
    body.tracking_number,
    body.trackingNumber,
    body.waybill_id,
    body.waybill,
    shipment.tracking_number,
  );

  const courierCompany = firstString(
    body.courier_company,
    body.courierCompany,
    body.courier_code,
    body.courierCode,
    shipment.courier_company,
    shipment.provider_name,
  );

  const providerOrderId = firstString(
    body.provider_order_id,
    body.providerOrderId,
    body.biteship_order_id,
    shipment.provider_order_id,
  );

  if (providerTrackingId) {
    paths.push("/v1/trackings/" + encodeURIComponent(providerTrackingId));
  }

  if (trackingNumber && courierCompany) {
    paths.push("/v1/trackings/" + encodeURIComponent(trackingNumber) + "/couriers/" + encodeURIComponent(courierCompany.toLowerCase()));
  }

  // Phase 3B.8-R2 penting: fallback order retrieve dengan Biteship Order ID.
  if (providerOrderId) {
    paths.push("/v1/orders/" + encodeURIComponent(providerOrderId));
  }

  return Array.from(new Set(paths));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, phase: PHASE, message: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const biteshipApiKey = Deno.env.get("BITESHIP_API_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, phase: PHASE, message: "Supabase service env is not configured" }, 500);
  }

  if (!biteshipApiKey) {
    return jsonResponse({ success: false, phase: PHASE, message: "BITESHIP_API_KEY secret is not configured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    body = isRecord(parsed) ? parsed : {};
  } catch (_) {
    body = {};
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let shipment: Record<string, unknown> | null = null;

  try {
    shipment = await selectShipment(supabase, body);
  } catch (error) {
    return jsonResponse({
      success: false,
      phase: PHASE,
      message: "Failed to find shipment",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }

  if (!shipment) {
    return jsonResponse({
      success: false,
      phase: PHASE,
      message: "Shipment not found. Provide shipment_id, order_id, provider_order_id, provider_tracking_id, or tracking_number.",
    }, 404);
  }

  const lookupPaths = buildBiteshipLookupPaths(shipment, body);

  if (!lookupPaths.length) {
    return jsonResponse({
      success: false,
      phase: PHASE,
      message: "No Biteship tracking/order identifier found on shipment.",
      shipment_id: shipment.id,
      order_id: shipment.order_id,
    }, 400);
  }

  const attempts = [];
  let best: Awaited<ReturnType<typeof fetchBiteship>> | null = null;

  for (const path of lookupPaths) {
    const result = await fetchBiteship(biteshipApiKey, path);
    attempts.push({
      path: result.path,
      ok: result.ok,
      status: result.status,
      error: result.error,
    });
    if (result.ok) {
      best = result;
      break;
    }
  }

  const now = new Date().toISOString();

  if (!best) {
    const errorMessage = attempts.map((a) => String(a.path) + ": " + String(a.error || a.status)).join(" | ");
    await supabase
      .from("shipments")
      .update({
        booking_status: "BITESHIP_TRACKING_FAILED",
        biteship_error: errorMessage,
        tracking_checked_at: now,
        updated_at: now,
      })
      .eq("id", shipment.id);

    return jsonResponse({
      success: false,
      phase: PHASE,
      message: "Failed to retrieve Biteship tracking/order data.",
      attempts,
    }, 200);
  }

  const normalized = normalizeBiteshipResponse(best.payload, shipment);

  const shipmentUpdate: Record<string, unknown> = {
    provider_name: "biteship",
    provider_order_id: normalized.providerOrderId,
    provider_tracking_id: normalized.providerTrackingId,
    tracking_number: normalized.trackingNumber,
    tracking_url: normalized.trackingUrl,
    booking_status: normalized.bookingStatus,
    tracking_status: normalized.rawStatus,
    tracking_history_json: normalized.history,
    tracking_response_json: normalized.response,
    provider_response_json: normalized.response,
    actual_shipping_cost: normalized.actualShippingCost,
    biteship_error: null,
    tracking_checked_at: now,
    updated_at: now,
  };

  if (normalized.shippingStatus) {
    shipmentUpdate.shipping_status = normalized.shippingStatus;
  }

  const { data: updatedShipment, error: updateError } = await supabase
    .from("shipments")
    .update(shipmentUpdate)
    .eq("id", shipment.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return jsonResponse({
      success: false,
      phase: PHASE,
      message: "Biteship data retrieved, but failed to update shipment.",
      error: updateError.message,
      normalized,
    }, 200);
  }

  // Best-effort sync ke order. Jika kolom tertentu tidak ada, jangan gagalkan tracking.
  const orderId = firstString(shipment.order_id);
  const orderSync: Record<string, unknown> = {};
  if (normalized.shippingStatus) orderSync.shipping_status = normalized.shippingStatus;
  if (normalized.rawStatus) orderSync.lifecycle_last_event = "biteship_" + normalized.rawStatus;
  orderSync.lifecycle_status_updated_at = now;

  let orderSyncError: string | null = null;
  if (orderId && Object.keys(orderSync).length) {
    const { error } = await supabase.from("orders").update(orderSync).eq("id", orderId);
    if (error) orderSyncError = error.message;
  }

  return jsonResponse({
    success: true,
    phase: PHASE,
    message: "Cek tracking Biteship berhasil",
    used_endpoint: best.path,
    attempts,
    status: normalized.rawStatus,
    booking_status: normalized.bookingStatus,
    shipping_status: normalized.shippingStatus,
    provider_order_id: normalized.providerOrderId,
    provider_tracking_id: normalized.providerTrackingId,
    tracking_number: normalized.trackingNumber,
    tracking_url: normalized.trackingUrl,
    actual_shipping_cost: normalized.actualShippingCost,
    biteship_total_price: normalized.biteshipTotalPrice,
    order_sync_warning: orderSyncError,
    shipment: updatedShipment,
  });
});
