import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCourier(value: unknown, fallback = "jne") {
  const raw = String(value || fallback).trim().toLowerCase();
  if (raw.includes("j&t")) return "jnt";
  return raw.replace(/express/g, "").replace(/[^a-z0-9]/g, "") || fallback;
}

async function assertSeller(serviceClient: any, authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user?.id) throw new Error("Login seller/admin diperlukan.");

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  const role = String(profile?.role || "").toUpperCase();
  if (!profile?.is_active || !["ADMIN", "SUPERADMIN", "SELLER"].includes(role)) {
    throw new Error("Akses seller/admin diperlukan.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const biteshipKey = Deno.env.get("BITESHIP_API_KEY") || "";
    const biteshipBaseUrl = Deno.env.get("BITESHIP_BASE_URL") || "https://api.biteship.com";

    if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum tersedia.");
    if (!biteshipKey) throw new Error("BITESHIP_API_KEY belum diset di Supabase Secrets.");

    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const shipmentId = String(body.shipment_id || "").trim();
    if (!shipmentId) throw new Error("shipment_id wajib dikirim.");

    const serviceClient = createClient(supabaseUrl, serviceKey);
    await assertSeller(serviceClient, authHeader);

    const { data: shipment, error: shipmentError } = await serviceClient
      .from("shipments")
      .select("*")
      .eq("id", shipmentId)
      .single();

    if (shipmentError || !shipment) throw new Error(shipmentError?.message || "Shipment tidak ditemukan.");

    const trackingNumber = shipment.tracking_number || shipment.provider_tracking_id;
    if (!trackingNumber) throw new Error("Nomor resi/tracking belum tersedia.");

    const courierCode = normalizeCourier(shipment.courier_code || shipment.courier_name || shipment.expedition_name);
    const endpoint = `${biteshipBaseUrl.replace(/\/$/, "")}/v1/trackings/${encodeURIComponent(trackingNumber)}/couriers/${encodeURIComponent(courierCode)}`;

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": biteshipKey,
        "Content-Type": "application/json",
      },
    });

    const providerJson = await response.json().catch(() => ({}));

    if (!response.ok || providerJson?.success === false) {
      const message = providerJson?.error || providerJson?.message || `Biteship tracking error HTTP ${response.status}`;
      await serviceClient.from("shipments").update({
        biteship_error: message,
        last_tracking_payload: providerJson,
        last_tracking_at: new Date().toISOString(),
      }).eq("id", shipment.id);

      return jsonResponse({ ok: false, error: message, provider: providerJson }, 400);
    }

    const status =
      providerJson?.status ||
      providerJson?.tracking?.status ||
      providerJson?.history?.[0]?.status ||
      shipment.shipping_status ||
      "TRACKED";

    let mappedStatus = shipment.shipping_status || "DIKIRIM";
    const normalized = String(status).toLowerCase();
    if (normalized.includes("delivered") || normalized.includes("diterima")) mappedStatus = "DITERIMA";
    else if (normalized.includes("picked") || normalized.includes("dropping") || normalized.includes("transit")) mappedStatus = "DIKIRIM";
    else if (normalized.includes("confirmed") || normalized.includes("allocated")) mappedStatus = "DIKEMAS";

    await serviceClient.from("shipments").update({
      booking_status: `TRACKING_${String(status).toUpperCase()}`,
      shipping_status: mappedStatus,
      last_tracking_payload: providerJson,
      last_tracking_at: new Date().toISOString(),
      biteship_error: null,
    }).eq("id", shipment.id);

    if (shipment.order_id) {
      await serviceClient.from("orders").update({
        shipping_status: mappedStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", shipment.order_id);
    }

    return jsonResponse({
      ok: true,
      status,
      mapped_status: mappedStatus,
      provider: providerJson,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
