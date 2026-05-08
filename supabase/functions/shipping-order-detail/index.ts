import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }

  return "";
}

function isStaffRole(role: unknown) {
  const text = asText(role).toLowerCase();
  return ["admin", "superadmin", "seller", "staff"].includes(text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({
      success: false,
      message: "Method not allowed. Use POST.",
    }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const biteshipApiKey = Deno.env.get("BITESHIP_API_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({
      success: false,
      message: "Supabase environment variables are incomplete.",
    }, 500);
  }

  if (!biteshipApiKey) {
    return jsonResponse({
      success: false,
      message: "BITESHIP_API_KEY is not configured in Supabase secrets.",
    }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  const { data: userData, error: userError } = await authClient.auth.getUser();

  if (userError || !userData?.user?.id) {
    return jsonResponse({
      success: false,
      message: "Unauthorized. Login seller/admin diperlukan.",
    }, 401);
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !isStaffRole(profile.role) || profile.is_active === false) {
    return jsonResponse({
      success: false,
      message: "Forbidden. Hanya seller/admin aktif yang dapat sync Biteship order detail.",
    }, 403);
  }

  let body: Record<string, unknown> = {};

  try {
    body = await req.json();
  } catch {
    return jsonResponse({
      success: false,
      message: "Request body harus JSON.",
    }, 400);
  }

  const shipmentId = asText(body.shipment_id);
  const bodyProviderOrderId = asText(body.provider_order_id);

  if (!shipmentId && !bodyProviderOrderId) {
    return jsonResponse({
      success: false,
      message: "Kirim shipment_id atau provider_order_id.",
    }, 400);
  }

  let shipmentQuery = serviceClient
    .from("shipments")
    .select("*")
    .limit(1);

  if (shipmentId) {
    shipmentQuery = shipmentQuery.eq("id", shipmentId);
  } else {
    shipmentQuery = shipmentQuery.eq("provider_order_id", bodyProviderOrderId);
  }

  const { data: shipments, error: shipmentError } = await shipmentQuery;

  if (shipmentError) {
    return jsonResponse({
      success: false,
      message: shipmentError.message,
    }, 500);
  }

  const shipment = Array.isArray(shipments) ? shipments[0] : null;

  if (!shipment) {
    return jsonResponse({
      success: false,
      message: "Shipment tidak ditemukan.",
    }, 404);
  }

  const providerOrderId = firstText(
    bodyProviderOrderId,
    shipment.provider_order_id,
    shipment.biteship_order_id
  );

  if (!providerOrderId) {
    const errorMessage = "provider_order_id Biteship belum tersedia pada shipment ini.";

    await serviceClient
      .from("shipments")
      .update({
        biteship_last_error: errorMessage,
        biteship_order_detail_synced_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);

    return jsonResponse({
      success: false,
      message: errorMessage,
      shipment_id: shipment.id,
    }, 200);
  }

  const biteshipUrl = `https://api.biteship.com/v1/orders/${encodeURIComponent(providerOrderId)}`;

  let biteshipStatus = 0;
  let biteshipPayload: any = null;

  try {
    const biteshipResponse = await fetch(biteshipUrl, {
      method: "GET",
      headers: {
        Authorization: biteshipApiKey,
        "Content-Type": "application/json",
      },
    });

    biteshipStatus = biteshipResponse.status;

    try {
      biteshipPayload = await biteshipResponse.json();
    } catch {
      biteshipPayload = {
        success: false,
        message: await biteshipResponse.text(),
      };
    }

    if (!biteshipResponse.ok || biteshipPayload?.success === false) {
      const errorMessage = firstText(
        biteshipPayload?.message,
        `Biteship GET /v1/orders/:id gagal dengan status ${biteshipStatus}`
      );

      await serviceClient
        .from("shipments")
        .update({
          biteship_last_error: errorMessage,
          biteship_order_detail_synced_at: new Date().toISOString(),
          tracking_response_json: biteshipPayload,
        })
        .eq("id", shipment.id);

      return jsonResponse({
        success: false,
        message: errorMessage,
        provider_order_id: providerOrderId,
        status: biteshipStatus,
        response: biteshipPayload,
      }, 200);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await serviceClient
      .from("shipments")
      .update({
        biteship_last_error: errorMessage,
        biteship_order_detail_synced_at: new Date().toISOString(),
      })
      .eq("id", shipment.id);

    return jsonResponse({
      success: false,
      message: errorMessage,
      provider_order_id: providerOrderId,
    }, 200);
  }

  const courier = biteshipPayload?.courier || {};
  const insurance = courier?.insurance || {};
  const destination = biteshipPayload?.destination || {};

  const shipmentFee = asNumber(courier?.shipment_fee);
  const insuranceFee = asNumber(insurance?.fee);
  const biteshipPrice = asNumber(biteshipPayload?.price);
  const history = Array.isArray(courier?.history) ? courier.history : [];

  const updatePayload = {
    provider_order_id: providerOrderId,

    biteship_order_detail_json: biteshipPayload,
    biteship_order_detail_synced_at: new Date().toISOString(),
    biteship_status: firstText(biteshipPayload?.status),
    biteship_short_id: firstText(biteshipPayload?.short_id),
    biteship_price: biteshipPrice || null,
    biteship_shipment_fee: shipmentFee || null,
    biteship_insurance_fee: insuranceFee || null,

    biteship_waybill_id: firstText(courier?.waybill_id),
    biteship_tracking_id: firstText(courier?.tracking_id),
    biteship_tracking_link: firstText(courier?.link),
    biteship_driver_name: firstText(courier?.driver_name, courier?.name),
    biteship_driver_phone: firstText(courier?.driver_phone, courier?.phone),
    biteship_driver_plate_number: firstText(courier?.driver_plate_number),
    biteship_courier_company: firstText(courier?.company),
    biteship_courier_type: firstText(courier?.type),
    biteship_routing_code: firstText(courier?.routing_code),
    biteship_destination_postal_code: firstText(destination?.postal_code),
    biteship_history_json: history,
    biteship_last_error: null,

    actual_shipping_cost: shipmentFee || biteshipPrice || shipment.actual_shipping_cost || null,
    tracking_number: firstText(courier?.waybill_id, shipment.tracking_number),
    provider_tracking_id: firstText(courier?.tracking_id, shipment.provider_tracking_id),
    tracking_url: firstText(courier?.link, shipment.tracking_url),
    tracking_history_json: history,
    tracking_response_json: biteshipPayload,
    tracking_checked_at: new Date().toISOString(),

    booking_status: firstText(biteshipPayload?.status, shipment.booking_status),
  };

  const { data: updatedShipment, error: updateError } = await serviceClient
    .from("shipments")
    .update(updatePayload)
    .eq("id", shipment.id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return jsonResponse({
      success: false,
      message: updateError.message,
      provider_order_id: providerOrderId,
    }, 500);
  }

  return jsonResponse({
    success: true,
    message: "Biteship order detail berhasil disinkronkan.",
    provider_order_id: providerOrderId,
    summary: {
      status: updatePayload.biteship_status,
      waybill_id: updatePayload.biteship_waybill_id,
      tracking_id: updatePayload.biteship_tracking_id,
      shipment_fee: updatePayload.biteship_shipment_fee,
      insurance_fee: updatePayload.biteship_insurance_fee,
      price: updatePayload.biteship_price,
    },
    shipment: updatedShipment,
  });
});
