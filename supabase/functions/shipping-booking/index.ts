import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JsonRecord = Record<string, any>;

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeCourier(value: unknown, fallback = "jne") {
  const raw = String(value || fallback).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw.includes("j&t")) return "jnt";
  return raw
    .replace(/express/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim() || fallback;
}

function normalizeService(value: unknown, fallback = "reg") {
  const raw = String(value || fallback).trim().toLowerCase();
  return raw.replace(/[^a-z0-9_]/g, "") || fallback;
}

function numericPostal(value: unknown, label: string) {
  const raw = String(value || "").replace(/\D/g, "");
  if (!raw) throw new Error(`${label} wajib diisi untuk booking Biteship.`);
  return Number(raw);
}

function positiveNumber(value: unknown, fallback: number) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
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
    throw new Error("Akses seller/admin diperlukan untuk booking Biteship.");
  }

  return userData.user;
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
    const force = Boolean(body.force);

    if (!shipmentId) throw new Error("shipment_id wajib dikirim.");

    const serviceClient = createClient(supabaseUrl, serviceKey);
    await assertSeller(serviceClient, authHeader);

    const { data: shipment, error: shipmentError } = await serviceClient
      .from("shipments")
      .select("*")
      .eq("id", shipmentId)
      .single();

    if (shipmentError || !shipment) throw new Error(shipmentError?.message || "Shipment tidak ditemukan.");

    if (shipment.provider_order_id && !force) {
      return jsonResponse({
        ok: true,
        reused: true,
        message: "Shipment sudah pernah dibooking.",
        shipment,
      });
    }

    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .select("*")
      .eq("id", shipment.order_id)
      .single();

    if (orderError || !order) throw new Error(orderError?.message || "Order tidak ditemukan.");

    const { data: orderItems, error: itemError } = await serviceClient
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    if (itemError) throw new Error(itemError.message);
    if (!orderItems?.length) throw new Error("Order belum memiliki item.");

    const { data: store, error: storeError } = await serviceClient
      .from("store_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (storeError) throw new Error(storeError.message);
    if (!store) throw new Error("Profil Toko belum tersedia/aktif.");

    const { data: expedition } = shipment.shipping_expedition_id
      ? await serviceClient.from("shipping_expeditions").select("*").eq("id", shipment.shipping_expedition_id).maybeSingle()
      : { data: null };

    const originPhone = store.phone || store.whatsapp;
    const originAddress = store.address_line;
    if (!originPhone) throw new Error("Nomor HP/WhatsApp toko wajib diisi di Profil Toko.");
    if (!originAddress) throw new Error("Alamat toko wajib diisi di Profil Toko.");
    if (!store.postal_code) throw new Error("Kode pos toko wajib diisi di Profil Toko.");

    const destinationPhone = shipment.phone || order.customer_phone;
    const destinationAddress = shipment.address || order.shipping_address;
    if (!destinationPhone) throw new Error("Nomor HP buyer/penerima belum tersedia.");
    if (!destinationAddress) throw new Error("Alamat buyer/penerima belum tersedia.");
    if (!shipment.postal_code && !order.shipping_postal_code) throw new Error("Kode pos buyer/penerima belum tersedia.");

    const courierCompany = normalizeCourier(shipment.courier_code || expedition?.courier_code || shipment.expedition_name || expedition?.name);
    const courierType = normalizeService(
      shipment.service_name || expedition?.provider_service_code || expedition?.service_name || Deno.env.get("BITESHIP_DEFAULT_COURIER_TYPE") || "reg"
    );

    const defaultLength = positiveNumber(Deno.env.get("BITESHIP_DEFAULT_LENGTH_CM"), 40);
    const defaultWidth = positiveNumber(Deno.env.get("BITESHIP_DEFAULT_WIDTH_CM"), 35);
    const defaultHeight = positiveNumber(Deno.env.get("BITESHIP_DEFAULT_HEIGHT_CM"), 2);

    const items = orderItems.map((item: JsonRecord) => ({
      name: item.product_name || item.sku_variant || "UrbaNoiD Product",
      description: [item.color_name, item.size_name, item.pattern_type].filter(Boolean).join(" / ") || "Fashion apparel",
      category: "fashion",
      sku: item.sku_variant || item.sku_product || undefined,
      value: positiveNumber(item.unit_price, 1),
      quantity: Math.max(1, Number(item.qty || 1)),
      weight: Math.max(1, Number(item.weight_gram || 250)),
      height: positiveNumber(item.package_height_cm, defaultHeight),
      length: positiveNumber(item.package_length_cm, defaultLength),
      width: positiveNumber(item.package_width_cm, defaultWidth),
    }));

    const collectionMethod =
      shipment.origin_collection_method ||
      expedition?.origin_collection_method ||
      store.origin_collection_method ||
      Deno.env.get("BITESHIP_COLLECTION_METHOD") ||
      "pickup";

    const payload: JsonRecord = {
      shipper_contact_name: store.origin_contact_name || store.store_name || "UrbaNoiD",
      shipper_contact_phone: originPhone,
      shipper_contact_email: store.email || undefined,
      shipper_organization: store.store_name || "UrbaNoiD",
      origin_contact_name: store.origin_contact_name || store.store_name || "UrbaNoiD",
      origin_contact_phone: originPhone,
      origin_contact_email: store.email || undefined,
      origin_address: originAddress,
      origin_note: store.origin_note || undefined,
      origin_postal_code: numericPostal(store.postal_code, "Kode pos toko"),
      origin_area_id: store.origin_area_id || undefined,
      origin_location_id: store.origin_location_id || undefined,
      origin_coordinate: (store.origin_latitude && store.origin_longitude)
        ? { latitude: Number(store.origin_latitude), longitude: Number(store.origin_longitude) }
        : undefined,
      origin_collection_method: collectionMethod,
      destination_contact_name: shipment.recipient_name || order.customer_name || "Customer",
      destination_contact_phone: destinationPhone,
      destination_contact_email: order.customer_email || undefined,
      destination_address: destinationAddress,
      destination_note: order.notes || undefined,
      destination_postal_code: numericPostal(shipment.postal_code || order.shipping_postal_code, "Kode pos buyer"),
      destination_area_id: shipment.destination_area_id || order.destination_area_id || undefined,
      destination_coordinate: (shipment.destination_latitude && shipment.destination_longitude)
        ? { latitude: Number(shipment.destination_latitude), longitude: Number(shipment.destination_longitude) }
        : undefined,
      courier_company: courierCompany,
      courier_type: courierType,
      delivery_type: Deno.env.get("BITESHIP_DELIVERY_TYPE") || "now",
      order_note: order.notes || `UrbaNoiD ${order.order_number || order.order_no || order.id}`,
      reference_id: order.order_number || order.order_no || order.id,
      metadata: {
        order_id: order.id,
        order_number: order.order_number || order.order_no,
        shipment_id: shipment.id,
        source: "urbanoid_supabase_native",
      },
      items,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined || payload[key] === null || payload[key] === "") delete payload[key];
    });

    const endpoint = `${biteshipBaseUrl.replace(/\/$/, "")}/v1/orders`;

    await serviceClient.from("shipments").update({
      provider_name: "Biteship",
      booking_status: "BITESHIP_REQUESTING",
      biteship_request: payload,
      biteship_error: null,
    }).eq("id", shipment.id);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": biteshipKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const providerJson = await response.json().catch(() => ({}));

    if (!response.ok || providerJson?.success === false) {
      const message = providerJson?.error || providerJson?.message || `Biteship error HTTP ${response.status}`;
      await serviceClient.from("shipments").update({
        provider_name: "Biteship",
        booking_status: "BITESHIP_FAILED",
        biteship_response: providerJson,
        biteship_error: message,
      }).eq("id", shipment.id);

      return jsonResponse({ ok: false, error: message, provider: providerJson, payload }, 400);
    }

    const providerOrderId = providerJson.id || providerJson.order_id || null;
    const providerTrackingId = providerJson.courier?.tracking_id || providerJson.tracking_id || null;
    const waybillId = providerJson.courier?.waybill_id || providerJson.waybill_id || providerJson.waybill || null;
    const trackingUrl = providerJson.courier?.link || providerJson.tracking_url || null;
    const labelUrl = providerJson.label_url || providerJson.shipping_label_url || providerJson.courier?.label_url || null;
    const providerStatus = providerJson.status || "confirmed";

    const { error: updateError } = await serviceClient
      .from("shipments")
      .update({
        provider_name: "Biteship",
        provider_order_id: providerOrderId,
        provider_tracking_id: providerTrackingId,
        tracking_number: waybillId,
        tracking_url: trackingUrl,
        label_url: labelUrl,
        booking_status: `BITESHIP_${String(providerStatus).toUpperCase()}`,
        booked_at: new Date().toISOString(),
        biteship_response: providerJson,
        biteship_error: null,
        shipping_status: waybillId ? "DIKEMAS" : "BELUM_DIKIRIM",
      })
      .eq("id", shipment.id);

    if (updateError) throw new Error(updateError.message);

    await serviceClient.from("orders").update({
      shipping_status: waybillId ? "DIKEMAS" : "BELUM_DIKIRIM",
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);

    return jsonResponse({
      ok: true,
      message: "Booking Biteship berhasil.",
      provider_order_id: providerOrderId,
      provider_tracking_id: providerTrackingId,
      tracking_number: waybillId,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      provider_status: providerStatus,
      provider: providerJson,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, 400);
  }
});
