import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Truck } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Phase3B7WRateOption, phase3b7wRateToOrderPatch, phase3b7wRateToShipmentPatch } from "./Phase3B7WRatesCheckout";

const STORAGE_KEY = "urbanoid_phase3b7w_selected_rate";
const PATCH_FLAG = "__phase3b7wPatched";
const SELECTED_RATE_TTL_MS = 6 * 60 * 60 * 1000;
const AUTO_RATE_DEBOUNCE_MS = 850;
const MAX_REASONABLE_CHECKOUT_SUBTOTAL = 50_000_000;
const R13_MARKER = "Phase 3B.7W-R13 - Checkout Single Source of Truth";
const R14_MARKER = "Phase 3B.7W-R14 - Checkout Expedition Source Fix";

type CartItemSnapshot = {
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  weight_gram: number;
  package_length_cm?: number | null;
  package_width_cm?: number | null;
  package_height_cm?: number | null;
};

type SelectedRateBundle = {
  rate: Phase3B7WRateOption;
  subtotal: number;
  selected_at: string;
  phase: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function parseCurrency(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "").replace(/[^0-9]/g, "");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function safeMoney(value: unknown) {
  const n = parseCurrency(value);
  if (!n || n < 0 || n > MAX_REASONABLE_CHECKOUT_SUBTOTAL) return 0;
  return n;
}

function getElementText(el: Element | null | undefined) {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "");
}

function isVisible(el: Element | null | undefined) {
  if (!el) return false;
  const node = el as HTMLElement;
  const style = window.getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function isBridgeElement(el: Element | null | undefined) {
  return Boolean((el as HTMLElement | null)?.closest?.("[data-phase='3b7w-rates-checkout-bridge'], [data-phase='3b7w-r13-host']"));
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function leafElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll("label, span, strong, b, small, p, div, h1, h2, h3, h4"))
    .filter((el) => !isBridgeElement(el) && isVisible(el) && (el.children.length === 0 || /^label$/i.test(el.tagName))) as HTMLElement[];
}

function findTextElement(container: HTMLElement, pattern: RegExp) {
  return leafElements(container).find((el) => pattern.test((el.textContent || "").trim())) || null;
}

function isOrderHistoryContext() {
  const hash = String(window.location.hash || "").toLowerCase();
  if (hash.includes("buyer-profile") || hash.includes("orders") || hash.includes("pesanan") || hash.includes("seller")) return true;
  const text = document.body?.innerText || "";
  return /Pesanan Saya/i.test(text) && /Pembayaran\s*&\s*Konfirmasi/i.test(text);
}

function checkoutScore(node: Element) {
  const text = getElementText(node).toLowerCase();
  let score = 0;
  if (/checkout\s+pesanan/.test(text)) score += 12;
  if (/buat\s+pesanan/.test(text)) score += 8;
  if (/ringkasan\s+pesanan/.test(text)) score += 6;
  if (/ekspedisi\s+pengiriman/.test(text)) score += 5;
  if (/nama\s+penerima/.test(text)) score += 4;
  if (/kode\s+pos/.test(text)) score += 3;
  if (/pesanan\s+saya|pembayaran\s*&\s*konfirmasi|lihat\s+bukti\s+pembayaran/.test(text)) score -= 20;
  return score;
}

function findCheckoutContainer(): HTMLElement | null {
  if (isOrderHistoryContext()) return null;
  const selectors = [
    "[role='dialog']",
    ".checkout-modal",
    ".checkout-dialog",
    ".checkout-card",
    ".checkout-panel",
    ".checkout-form",
    ".modal-content",
    ".modal",
    "form",
    "section",
    "article",
    "main > div",
    "body > div",
    "div",
  ];
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (isBridgeElement(node) || !isVisible(node)) continue;
      const score = checkoutScore(node);
      if (score > bestScore) {
        best = node as HTMLElement;
        bestScore = score;
      }
    }
    if (best && bestScore >= 20) break;
  }
  return best && bestScore >= 14 ? best : null;
}

function findControlNearLabel(container: HTMLElement | null, labels: string[], selector = "input, textarea, select") {
  if (!container) return null;
  const labelRegexes = labels.map((label) => new RegExp(escapeForRegex(label), "i"));

  for (const labelNode of Array.from(container.querySelectorAll("label"))) {
    const text = labelNode.textContent || "";
    if (!labelRegexes.some((regex) => regex.test(text))) continue;
    const nested = labelNode.querySelector(selector);
    if (nested) return nested as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const id = labelNode.getAttribute("for");
    if (id) {
      const byId = container.querySelector(`#${id.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`);
      if (byId) return byId as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    }
    let next = labelNode.nextElementSibling;
    for (let i = 0; i < 4 && next; i += 1, next = next.nextElementSibling) {
      const found = next.matches(selector) ? next : next.querySelector(selector);
      if (found) return found as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    }
  }

  const controls = Array.from(container.querySelectorAll(selector)) as Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  for (const control of controls) {
    const meta = `${control.name || ""} ${control.id || ""} ${control.getAttribute("placeholder") || ""} ${control.getAttribute("aria-label") || ""}`;
    const parentText = getElementText(control.closest("label, .form-group, .field, .input-group, .checkout-field, div"));
    if (labelRegexes.some((regex) => regex.test(meta) || regex.test(parentText))) return control;
  }
  return null;
}

function readInputByLabel(container: HTMLElement | null, labels: string[]) {
  const control = findControlNearLabel(container, labels) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return String(control?.value || "").trim();
}

function findShippingSelect(container: HTMLElement | null) {
  const direct = findControlNearLabel(container, ["ekspedisi pengiriman", "ekspedisi", "kurir", "pengiriman"], "select") as HTMLSelectElement | null;
  if (direct) return direct;
  const selects = Array.from(container?.querySelectorAll("select") || []) as HTMLSelectElement[];
  return selects.find((select) => /jne|sicepat|anteraja|j&t|jnt|pos|tiki|reg|yes|ez/i.test(getElementText(select))) || null;
}

function findCheckoutSubmitButton(container: HTMLElement | null) {
  if (!container) return null;
  const candidates = Array.from(container.querySelectorAll("button, a, input[type='submit']")) as HTMLElement[];
  return candidates.find((el) => /buat\s+pesanan|checkout|bayar\s+sekarang|lanjutkan/i.test(getElementText(el))) || null;
}

function nearestBlock(control: Element | null) {
  return control?.closest("label, .form-group, .field, .input-group, .checkout-field, div") as HTMLElement | null;
}

function directChildWithin(container: HTMLElement, node: HTMLElement | null) {
  if (!node) return null;
  let current: HTMLElement | null = node;
  while (current && current.parentElement && current.parentElement !== container) {
    current = current.parentElement as HTMLElement;
  }
  return current && current.parentElement === container ? current : node;
}

function insertBefore(target: HTMLElement | null, node: HTMLElement, fallback: HTMLElement) {
  if (target?.parentElement) target.parentElement.insertBefore(node, target);
  else fallback.appendChild(node);
}

function ensureRatesHost(container: HTMLElement | null) {
  if (!container) return null;
  let host = container.querySelector("[data-phase='3b7w-r13-host']") as HTMLElement | null;
  if (host) return host;

  host = document.createElement("div");
  host.setAttribute("data-phase", "3b7w-r13-host");
  host.className = "phase3b7w-r13-host";

  // Clean single location: place the rates panel directly before the existing shipping select block.
  // If the select is not found yet, place it before the address block or at the top of the form body.
  const shippingSelect = findShippingSelect(container);
  const shippingBlock = directChildWithin(container, nearestBlock(shippingSelect));
  const addressControl = findControlNearLabel(container, ["alamat lengkap", "alamat pengiriman", "alamat", "address"], "textarea,input");
  const addressBlock = directChildWithin(container, nearestBlock(addressControl));
  insertBefore(shippingBlock || addressBlock, host, container);
  return host;
}

function removeStaleHosts(activeContainer: HTMLElement | null) {
  const hosts = Array.from(document.querySelectorAll("[data-phase='3b7w-r13-host'], [data-phase='3b7w-r3-rates-host'], [data-phase='3b7w-r2-rates-host']")) as HTMLElement[];
  for (const host of hosts) {
    if (!activeContainer || !activeContainer.contains(host)) host.remove();
  }
}

function extractSubtotalFromContainer(container: HTMLElement | null) {
  if (!container) return 0;
  const text = getElementText(container);
  const patterns = [
    /subtotal\s+produk\s*:?[\s\S]{0,45}?(rp\s*[0-9.]+)/i,
    /subtotal\s*:?[\s\S]{0,45}?(rp\s*[0-9.]+)/i,
    /total\s+produk\s*:?[\s\S]{0,45}?(rp\s*[0-9.]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = safeMoney(match?.[1]);
    if (value) return value;
  }

  const lines = text.split(/\n+/g).map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    if (/subtotal|total produk/i.test(lines[i])) {
      const same = safeMoney(lines[i]);
      const next = safeMoney(lines[i + 1]);
      if (same) return same;
      if (next) return next;
    }
  }
  return 0;
}

function normalizeCartRow(row: any, index: number): CartItemSnapshot | null {
  if (!row || typeof row !== "object") return null;
  if (row.selected === false || row.checked === false || row.is_selected === false) return null;
  const qty = Number(row.qty || row.quantity || row.jumlah || 1) || 1;
  const unit = safeMoney(row.unit_price ?? row.price ?? row.final_price ?? row.harga ?? row.product_price);
  const subtotal = safeMoney(row.subtotal ?? row.line_total ?? row.total ?? (qty * unit));
  if (!subtotal && !unit) return null;
  return {
    product_name: row.product_name || row.name || row.title || `Produk ${index + 1}`,
    qty,
    unit_price: unit || Math.round(subtotal / qty),
    subtotal: subtotal || qty * unit,
    weight_gram: Number(row.weight_gram || row.weight || row.package_weight_gram || 250) || 250,
    package_length_cm: row.package_length_cm || row.length_cm || null,
    package_width_cm: row.package_width_cm || row.width_cm || null,
    package_height_cm: row.package_height_cm || row.height_cm || null,
  };
}

function extractCartItemsFromStorage() {
  const candidates: CartItemSnapshot[][] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i) || "";
    if (key === STORAGE_KEY || /selected_rate|history|orders|profile|proof/i.test(key)) continue;
    if (!/cart|keranjang|basket|urbanoid/i.test(key)) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      const rows = Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : Array.isArray(value?.cart) ? value.cart : Array.isArray(value?.products) ? value.products : [];
      const normalized = rows.map((row: any, idx: number) => normalizeCartRow(row, idx)).filter(Boolean) as CartItemSnapshot[];
      if (normalized.length) candidates.push(normalized);
    } catch (_) {
      // ignore invalid storage rows
    }
  }
  if (!candidates.length) return [];
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

function calculateSubtotalFromItems(items: CartItemSnapshot[]) {
  const total = items.reduce((sum, item) => sum + safeMoney(item.subtotal ?? item.qty * item.unit_price), 0);
  return total > 0 && total <= MAX_REASONABLE_CHECKOUT_SUBTOTAL ? total : 0;
}

function selectedRateBundle(): SelectedRateBundle | null {
  try {
    const bundle = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as SelectedRateBundle | null;
    if (!bundle?.rate?.price) return null;
    const selectedAt = bundle.selected_at ? new Date(bundle.selected_at).getTime() : 0;
    if (selectedAt && Date.now() - selectedAt > SELECTED_RATE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return bundle;
  } catch (_) {
    return null;
  }
}

function inferOrderSubtotal(row: any, bundleSubtotal: number) {
  const explicitSubtotal = safeMoney(row?.subtotal_amount ?? row?.subtotal ?? row?.products_total ?? row?.product_total ?? row?.items_total);
  if (explicitSubtotal) return explicitSubtotal;
  const oldShipping = safeMoney(row?.shipping_cost ?? row?.ongkir ?? row?.delivery_fee);
  const oldTotal = safeMoney(row?.grand_total ?? row?.total_amount ?? row?.total ?? row?.amount_total);
  if (oldTotal && oldShipping && oldTotal > oldShipping) return oldTotal - oldShipping;
  return safeMoney(bundleSubtotal);
}

function patchRows(tableName: string, values: any) {
  const bundle = selectedRateBundle();
  const rate = bundle?.rate || null;
  if (!rate?.price) return values;

  const patchOne = (row: any) => {
    if (!row || typeof row !== "object") return row;
    if (tableName === "orders") {
      const subtotal = inferOrderSubtotal(row, Number(bundle?.subtotal || 0));
      return { ...row, ...phase3b7wRateToOrderPatch(rate, subtotal) };
    }
    if (tableName === "shipments") {
      return { ...row, ...phase3b7wRateToShipmentPatch(rate) };
    }
    return row;
  };
  return Array.isArray(values) ? values.map(patchOne) : patchOne(values);
}

function installSupabaseInsertPatch() {
  const clientAny = supabase as any;
  if (clientAny[PATCH_FLAG]) return;
  const originalFrom = clientAny.from.bind(supabase);
  clientAny.from = function patchedFrom(tableName: string) {
    const builder = originalFrom(tableName);
    if ((tableName === "orders" || tableName === "shipments") && builder?.insert && !builder[PATCH_FLAG]) {
      const originalInsert = builder.insert.bind(builder);
      builder.insert = function patchedInsert(values: any, options?: any) {
        return originalInsert(patchRows(tableName, values), options);
      };
      builder[PATCH_FLAG] = true;
    }
    return builder;
  };
  clientAny[PATCH_FLAG] = true;
}

function dispatchChange(element: HTMLElement) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, emit = true) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else (element as any).value = value;
  if (emit) dispatchChange(element);
}

function rateLabel(rate: Phase3B7WRateOption) {
  const courier = rate.courier_name || rate.courier_code || rate.courier_company || "Kurir";
  const service = rate.service_name || rate.service_code || rate.courier_type || "Layanan";
  return `${courier} / ${service}`.toUpperCase().replace(/\s+/g, " ").trim();
}

function rateSelectValue(rate: Phase3B7WRateOption) {
  return `BITESHIP::${rate.id}`;
}

function summaryCourierText(rate: Phase3B7WRateOption | null) {
  if (!rate) return "-";
  const courier = (rate.courier_name || rate.courier_code || rate.courier_company || "Kurir").toUpperCase();
  const service = (rate.service_name || rate.service_code || rate.courier_type || "Layanan").toUpperCase();
  return `${courier} / ${service}`.replace(/\s+/g, " ").trim();
}

function normalizeRateError(message: string) {
  if (/no sufficient balance|insufficient balance|top up your balance/i.test(message || "")) {
    return "Saldo testing Biteship belum cukup untuk memanggil Rates API. Top up/aktifkan saldo testing di dashboard Biteship, lalu buka ulang checkout.";
  }
  if (/origin|destination|area|postal|alamat|kode pos/i.test(message || "")) {
    return `Data alamat toko/buyer belum lengkap untuk Rates API: ${message}`;
  }
  return message || "Gagal menghitung ongkir ekspedisi.";
}

function saveSelectedRate(rate: Phase3B7WRateOption, subtotal: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    rate,
    subtotal,
    selected_at: new Date().toISOString(),
    phase: "3B.7W-R13",
  }));
}

function syncShippingSelect(container: HTMLElement | null, rates: Phase3B7WRateOption[], selected: Phase3B7WRateOption | null) {
  const select = findShippingSelect(container);
  if (!select || !rates.length) return;
  select.setAttribute("data-phase3b7w-r13-select-only", "true");

  const nextValue = selected ? rateSelectValue(selected) : rateSelectValue(rates[0]);
  const existingValues = Array.from(select.options).map((option) => option.value);
  const alreadySynced = existingValues.length === rates.length + 1 && rates.every((rate) => existingValues.includes(rateSelectValue(rate)));

  if (!alreadySynced) {
    while (select.options.length) select.remove(0);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "- Pilih Ekspedisi -";
    select.appendChild(placeholder);

    for (const rate of rates) {
      const option = document.createElement("option");
      option.value = rateSelectValue(rate);
      option.setAttribute("data-phase3b7w-rate", "true");
      option.textContent = `${rateLabel(rate)} — ${formatCurrency(rate.price)}${rate.duration ? ` (${rate.duration})` : ""}`;
      select.appendChild(option);
    }
  }

  if (select.value !== nextValue) {
    // Emit input/change so the original checkout React state also receives the Biteship option.
    // This fixes the case where the visible dropdown is selected, but the original submit guard
    // still thinks expedition is empty.
    setNativeValue(select, nextValue, true);
    window.setTimeout(() => {
      if (select.value !== nextValue) setNativeValue(select, nextValue, true);
      else dispatchChange(select);
    }, 30);
  }
}

function setTextValue(row: HTMLElement, labelEl: HTMLElement, value: string) {
  row.setAttribute("data-phase3b7w-r13-summary-row", "true");
  const candidates = Array.from(row.querySelectorAll("span, strong, b, small, div, p")) as HTMLElement[];
  const valueEl = candidates
    .filter((el) => el !== labelEl && !labelEl.contains(el) && !isBridgeElement(el))
    .reverse()
    .find((el) => (el.textContent || "").trim() && !/^subtotal|ekspedisi|ongkir|total$/i.test((el.textContent || "").trim()));
  if (valueEl) {
    valueEl.textContent = value;
    return;
  }
  const span = document.createElement("span");
  span.setAttribute("data-phase3b7w-r13-summary-value", "true");
  span.style.marginLeft = "auto";
  span.style.fontWeight = "800";
  span.textContent = value;
  row.appendChild(span);
}

function setSummaryRow(summary: HTMLElement, label: RegExp, value: string) {
  const labelEl = leafElements(summary).find((el) => label.test((el.textContent || "").trim())) || null;
  if (!labelEl) return false;
  const row = labelEl.closest("li, tr, p, div") as HTMLElement | null;
  if (!row || row === summary) return false;
  setTextValue(row, labelEl, value);
  return true;
}

function findSummaryContainer(container: HTMLElement | null) {
  if (!container) return null;
  const title = findTextElement(container, /^Ringkasan\s+Pesanan$/i) || findTextElement(container, /Ringkasan\s+Pesanan/i);
  if (!title) return null;

  let node: HTMLElement | null = title;
  for (let i = 0; i < 5 && node && node !== container; i += 1) {
    const text = getElementText(node);
    if (/Subtotal/i.test(text) && /Total/i.test(text)) return node;
    node = node.parentElement as HTMLElement | null;
  }
  return title.closest("section, article, .card, .panel, div") as HTMLElement | null;
}

function updateSummary(container: HTMLElement | null, rate: Phase3B7WRateOption | null, subtotal: number) {
  if (!container || !rate?.price || !subtotal) return;
  const summary = findSummaryContainer(container);
  if (!summary) return;
  summary.setAttribute("data-phase3b7w-r13-summary", "true");

  const courier = summaryCourierText(rate);
  const shipping = formatCurrency(rate.price);
  const total = formatCurrency(Number(subtotal || 0) + Number(rate.price || 0));

  setSummaryRow(summary, /^Ekspedisi$/i, courier);
  setSummaryRow(summary, /^Ongkir$/i, shipping);
  setSummaryRow(summary, /^Total$/i, total);

  // Keep any top checkout metadata honest if the original checkout still renders it.
  const topMeta = findTextElement(container, /item\s*[-·]\s*[0-9]+\s*gram\s*[-·]\s*Total\s*Rp/i);
  if (topMeta) topMeta.textContent = (topMeta.textContent || "").replace(/Total\s+Rp\s*[0-9.]+/i, `Total ${total}`);
}

function checkoutFingerprint(container: HTMLElement | null, subtotal: number, items: CartItemSnapshot[]) {
  return JSON.stringify({
    postal_code: readInputByLabel(container, ["kode pos", "postal"]),
    district: readInputByLabel(container, ["kecamatan", "district"]),
    city: readInputByLabel(container, ["kota", "kabupaten", "city"]),
    subtotal,
    items: items.map((item) => [item.product_name, item.qty, item.subtotal, item.weight_gram]).slice(0, 8),
  });
}


function selectedRateFromDropdown(container: HTMLElement | null, rates: Phase3B7WRateOption[]) {
  const select = findShippingSelect(container);
  const value = String(select?.value || "");
  if (!value.startsWith("BITESHIP::")) return null;
  return rates.find((rate) => rateSelectValue(rate) === value) || selectedRateBundle()?.rate || null;
}

function findProductDetailContainers() {
  const candidates = Array.from(document.querySelectorAll("[role='dialog'], .modal, .modal-content, .product-detail, .product-modal, section, article, main > div, body > div")) as HTMLElement[];
  return candidates.filter((node) => {
    if (!isVisible(node) || isBridgeElement(node)) return false;
    const text = getElementText(node);
    if (/Checkout\s+Pesanan|Ringkasan\s+Pesanan|Buat\s+Pesanan/i.test(text)) return false;
    return /Pilih\s+varian|Tambah\s+ke\s+Keranjang|Chat\s+Toko/i.test(text) && /Ekspedisi\s+Pengiriman/i.test(text);
  });
}

function ensureProductDetailExpeditionDoesNotBlock() {
  const containers = findProductDetailContainers();
  for (const detail of containers) {
    const select = findControlNearLabel(detail, ["Ekspedisi Pengiriman", "Ekspedisi"], "select") as HTMLSelectElement | null;
    if (select) {
      const firstValid = Array.from(select.options).find((option) => {
        const txt = (option.textContent || "").trim();
        return option.value && !/^[-\s]*Pilih/i.test(txt);
      });
      if (firstValid && (!select.value || /^[-\s]*Pilih/i.test(select.options[select.selectedIndex]?.textContent || ""))) {
        setNativeValue(select, firstValid.value, true);
      }
      select.setAttribute("data-phase3b7w-r14-product-expedition-auto", "true");

      const block = nearestBlock(select);
      if (block && !block.getAttribute("data-phase3b7w-r14-product-expedition-block")) {
        block.setAttribute("data-phase3b7w-r14-product-expedition-block", "true");
        block.style.display = "none";
        const note = document.createElement("div");
        note.className = "phase3b7w-r14-detail-expedition-note";
        note.setAttribute("data-phase3b7w-r14-detail-expedition-note", "true");
        note.textContent = "Ekspedisi dan ongkir aktual dipilih otomatis saat Checkout Pesanan.";
        block.parentElement?.insertBefore(note, block);
      }
    }

    for (const el of Array.from(detail.querySelectorAll("div, p, span, small, strong")) as HTMLElement[]) {
      if (/Pilih\s+ekspedisi\s+pengiriman\s+terlebih\s+dahulu/i.test(el.textContent || "")) {
        el.textContent = "Ekspedisi aktual dipilih saat Checkout Pesanan.";
        el.classList.add("phase3b7w-r14-detail-expedition-info");
      }
    }
  }
}

export function Phase3B7WCheckoutBridge() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [subtotal, setSubtotal] = useState(0);
  const [rates, setRates] = useState<Phase3B7WRateOption[]>([]);
  const [selected, setSelected] = useState<Phase3B7WRateOption | null>(() => selectedRateBundle()?.rate || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const lastFingerprintRef = useRef("");

  useEffect(() => { installSupabaseInsertPatch(); }, []);

  useEffect(() => {
    ensureProductDetailExpeditionDoesNotBlock();
    const timer = window.setInterval(ensureProductDetailExpeditionDoesNotBlock, 650);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextContainer = findCheckoutContainer();
      removeStaleHosts(nextContainer);
      setContainer(nextContainer);
      setHost(ensureRatesHost(nextContainer));

      if (!nextContainer) return;
      const items = extractCartItemsFromStorage();
      const fromContainer = extractSubtotalFromContainer(nextContainer);
      const fromItems = calculateSubtotalFromItems(items);
      setSubtotal(fromContainer || fromItems || 0);
    }, 550);
    return () => window.clearInterval(timer);
  }, []);

  function chooseRate(rate: Phase3B7WRateOption, nextSubtotal = subtotal, nextRates = rates) {
    const effectiveSubtotal = nextSubtotal || extractSubtotalFromContainer(container) || calculateSubtotalFromItems(extractCartItemsFromStorage());
    setSelected(rate);
    saveSelectedRate(rate, effectiveSubtotal);
    syncShippingSelect(container, nextRates.length ? nextRates : [rate], rate);
    updateSummary(container, rate, effectiveSubtotal);
  }

  async function loadRates(auto = true) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const activeContainer = container || findCheckoutContainer();
      if (!activeContainer) throw new Error("Panel ongkir hanya aktif pada form checkout.");
      const items = extractCartItemsFromStorage();
      const nextSubtotal = extractSubtotalFromContainer(activeContainer) || calculateSubtotalFromItems(items) || subtotal;
      if (!nextSubtotal) throw new Error("Subtotal checkout belum terbaca. Pastikan keranjang sudah berisi produk.");

      const destination = {
        address: readInputByLabel(activeContainer, ["alamat lengkap", "alamat", "address"]),
        postal_code: readInputByLabel(activeContainer, ["kode pos", "postal"]),
        district: readInputByLabel(activeContainer, ["kecamatan", "district"]),
        city: readInputByLabel(activeContainer, ["kota", "kabupaten", "city"]),
        province: readInputByLabel(activeContainer, ["provinsi", "province"]),
        phone: readInputByLabel(activeContainer, ["nomor kontak", "nomor hp", "whatsapp", "telepon", "phone"]),
      };

      const { data, error: fnError } = await supabase.functions.invoke("shipping-rates", {
        body: { destination, items, subtotal: nextSubtotal, couriers: "jne,sicepat,anteraja,jnt,pos,tiki" },
      });
      if (fnError) throw new Error(fnError.message || "Gagal menghubungi Edge Function shipping-rates.");
      if (!data?.success) throw new Error(data?.error || data?.message || "Gagal menghitung ongkir ekspedisi.");
      const nextRates = Array.isArray(data.rates) ? data.rates : [];
      if (!nextRates.length) throw new Error("Biteship tidak mengembalikan opsi ongkir untuk alamat/kurir ini.");

      const previous = selectedRateBundle()?.rate;
      const nextSelected = previous ? nextRates.find((rate: Phase3B7WRateOption) => rate.id === previous.id) || nextRates[0] : nextRates[0];
      setRates(nextRates);
      setSubtotal(nextSubtotal);
      chooseRate(nextSelected, nextSubtotal, nextRates);
    } catch (err) {
      setError(normalizeRateError(err instanceof Error ? err.message : String(err)));
      if (!auto) console.error("Phase 3B.7W-R13 rates error", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!container || !subtotal) return;
    const items = extractCartItemsFromStorage();
    const fingerprint = checkoutFingerprint(container, subtotal, items);
    if (lastFingerprintRef.current === fingerprint) return;
    lastFingerprintRef.current = fingerprint;
    const timer = window.setTimeout(() => { void loadRates(true); }, AUTO_RATE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [container, subtotal]);

  useEffect(() => {
    syncShippingSelect(container, rates, selected);
    updateSummary(container, selected, subtotal);
  }, [container, rates, selected, subtotal]);

  useEffect(() => {
    if (!container || !rates.length) return;
    const select = findShippingSelect(container);
    if (!select) return;

    function onChange() {
      const value = select.value || "";
      if (!value.startsWith("BITESHIP::")) return;
      const rate = rates.find((item) => rateSelectValue(item) === value);
      if (rate) chooseRate(rate, subtotal, rates);
    }

    select.addEventListener("change", onChange);
    select.addEventListener("input", onChange);
    return () => {
      select.removeEventListener("change", onChange);
      select.removeEventListener("input", onChange);
    };
  }, [container, rates, subtotal]);

  useEffect(() => {
    if (!container) return;
    function guardCheckout(event: Event) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest?.("button, a, input[type='submit']") as HTMLElement | null;
      const label = getElementText(button || target).trim();
      const isSubmit = event.type === "submit" || /buat\s+pesanan|checkout|bayar\s+sekarang|lanjutkan\s+pembayaran/i.test(label);
      if (!isSubmit) return;
      let bundle = selectedRateBundle();
      const dropdownRate = selectedRateFromDropdown(container, rates);
      if (!bundle?.rate?.price && dropdownRate?.price) {
        chooseRate(dropdownRate, subtotal, rates.length ? rates : [dropdownRate]);
        bundle = selectedRateBundle();
      }
      const select = findShippingSelect(container);
      const hasBiteshipSelection = Boolean(String(select?.value || "").startsWith("BITESHIP::"));
      if (bundle?.rate?.price || hasBiteshipSelection) return;
      event.preventDefault();
      event.stopPropagation();
      setError("Ongkir ekspedisi belum siap. Tutup lalu buka ulang checkout, atau tunggu sistem memuat ongkir otomatis.");
      void loadRates(false);
    }
    container.addEventListener("click", guardCheckout, true);
    container.addEventListener("submit", guardCheckout, true);
    return () => {
      container.removeEventListener("click", guardCheckout, true);
      container.removeEventListener("submit", guardCheckout, true);
    };
  }, [container, rates, subtotal]);

  if (!container || !host) return null;

  const total = Number(subtotal || 0) + Number(selected?.price || 0);

  return createPortal(
    <section className="phase3b7w-checkout-bridge phase3b7w-r13" data-phase="3b7w-rates-checkout-bridge" data-marker={R14_MARKER}>
      <div className="phase3b7w-bridge-head">
        <div>
          <strong><Truck size={15} /> Ongkir Ekspedisi</strong>
          <small>Ongkir aktual menyesuaikan layanan ekspedisi yang dipilih.</small>
        </div>
        <span className="phase3b7w-r13-auto-badge">{loading ? <Loader2 size={14} className="spin" /> : null} Otomatis</span>
      </div>

      {error && <p className="phase3b7w-bridge-error">{error}</p>}

      {rates.length > 0 && (
        <div className="phase3b7w-r4-select-only-note">
          <strong>Opsi ekspedisi sudah dimuat.</strong>
          <span>Pilih layanan melalui dropdown <b>Ekspedisi Pengiriman</b> pada form checkout.</span>
        </div>
      )}

      <div className="phase3b7w-r3-summary-grid">
        <div className="phase3b7w-r3-summary-card">
          <small>Subtotal produk</small>
          <strong>{subtotal ? formatCurrency(subtotal) : "Belum terbaca"}</strong>
        </div>
        <div className="phase3b7w-r3-summary-card">
          <small>Ongkir ekspedisi</small>
          <strong>{selected ? formatCurrency(selected.price) : "Belum dipilih"}</strong>
        </div>
        <div className="phase3b7w-r3-summary-card total">
          <small>Total bayar</small>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <small className="phase3b7w-r3-note">Ringkasan Pesanan dan data order memakai ekspedisi serta ongkir aktual yang dipilih.</small>
      {findCheckoutSubmitButton(container) ? null : <span style={{ display: "none" }} />}
    </section>,
    host,
  );
}


// PHASE_3B_8_R3_SINGLE_EXPEDITION_SOURCE
// Sumber tarif utama checkout adalah selected Biteship rate dari Rates API.
// Master Ekspedisi seller digunakan sebagai whitelist/fallback, bukan sumber harga utama checkout.


/* PHASE_3B_8_R5_CART_TOTAL_NOTE_CLEANUP
 * Phase 3B.8-R5 — Keranjang Belanja total normalization.
 * Scoped runtime helper: hanya aktif pada drawer yang berisi judul "Keranjang Belanja".
 * Tidak mengubah posisi drawer dan tidak menyentuh Checkout Pesanan.
 */
(() => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const w = window as any;
  if (w.__PHASE_3B_8_R5_CART_TOTAL_NOTE_CLEANUP__) return;
  w.__PHASE_3B_8_R5_CART_TOTAL_NOTE_CLEANUP__ = true;

  const NEW_NOTE = "Total Pembayaran dengan penyesuaian Ongkir dapat dilihat setelah lanjut Checkout.";
  const LEGACY_NOTE_PARTS = [
    "Ongkir fase ini memakai tarif dasar ekspedisi",
    "Jumlah belum termasuk Ongkir",
    "Ongkir dihitung otomatis saat Checkout Pesanan"
  ];

  const moneyRegex = /Rp\s*[0-9.]+/gi;

  function normalizeText(value: string | null | undefined): string {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function getText(el: Element | null): string {
    return normalizeText(el ? el.textContent : "");
  }

  function isElementVisible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function findCartRoot(): HTMLElement | null {
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,div,span,strong"))
      .filter((el) => normalizeText(el.textContent) === "Keranjang Belanja") as HTMLElement[];

    for (const heading of headings) {
      let cur: HTMLElement | null = heading;
      for (let i = 0; cur && i < 10; i += 1, cur = cur.parentElement) {
        const t = getText(cur);
        if (
          t.includes("Keranjang Belanja") &&
          t.includes("Checkout") &&
          (t.includes("Kosongkan") || t.includes("Tambah ke Keranjang") || t.includes("Chat Toko"))
        ) {
          const rect = cur.getBoundingClientRect();
          // Hindari memilih body/full app. Drawer biasanya relatif sempit.
          if (cur !== document.body && rect.width > 220 && rect.width < Math.min(window.innerWidth, 760)) {
            return cur;
          }
        }
      }
    }

    const candidates = Array.from(document.querySelectorAll("aside,section,div,[role='dialog']")) as HTMLElement[];
    return candidates.find((el) => {
      const t = getText(el);
      const rect = el.getBoundingClientRect();
      return (
        t.includes("Keranjang Belanja") &&
        t.includes("Checkout") &&
        (t.includes("Kosongkan") || t.includes("Chat Toko")) &&
        rect.width > 220 &&
        rect.width < Math.min(window.innerWidth, 760) &&
        el !== document.body
      );
    }) || null;
  }

  function findDeepestLegacySummary(root: HTMLElement): HTMLElement | null {
    const nodes = Array.from(root.querySelectorAll("div,section,footer,article")) as HTMLElement[];
    let best: HTMLElement | null = null;
    let bestLen = Number.POSITIVE_INFINITY;

    for (const el of nodes) {
      if (!isElementVisible(el)) continue;
      if (el.classList.contains("phase3b8-r5-cart-normal-summary")) continue;
      const t = getText(el);
      const hasLegacyNote = LEGACY_NOTE_PARTS.some((part) => t.includes(part));
      const hasOldRows = t.includes("Subtotal") && t.includes("Ekspedisi") && t.includes("Ongkir") && t.includes("Total");
      if (!(hasLegacyNote || hasOldRows)) continue;
      // Hindari memilih seluruh drawer; pilih blok terkecil yang masih memuat ringkasan.
      if (t.includes("Keranjang Belanja") && t.includes("Chat Toko tentang Keranjang") && t.length > 300) continue;
      if (t.length < bestLen) {
        best = el;
        bestLen = t.length;
      }
    }
    return best;
  }

  function firstMoneyAfter(text: string, label: string): string | null {
    const idx = text.indexOf(label);
    if (idx < 0) return null;
    const tail = text.slice(idx);
    const match = tail.match(moneyRegex);
    return match ? normalizeText(match[0]) : null;
  }

  function extractSubtotal(root: HTMLElement, legacy: HTMLElement | null): string {
    const sources = [
      legacy ? getText(legacy) : "",
      getText(root)
    ];

    for (const t of sources) {
      const bySubtotal = firstMoneyAfter(t, "Subtotal");
      if (bySubtotal) return bySubtotal;
    }

    // Fallback: cari harga produk pada kartu item. Ambil uang pertama yang muncul sebelum footer.
    const all = getText(root).match(moneyRegex);
    if (all && all.length) return normalizeText(all[0]);

    return "Rp 0";
  }

  function findButtonArea(root: HTMLElement): HTMLElement | null {
    const buttons = Array.from(root.querySelectorAll("button,a")) as HTMLElement[];
    const checkout = buttons.find((btn) => getText(btn) === "Checkout");
    if (!checkout) return null;
    let cur: HTMLElement | null = checkout;
    for (let i = 0; cur && i < 5; i += 1, cur = cur.parentElement) {
      const t = getText(cur);
      if (t.includes("Checkout") && (t.includes("Kosongkan") || t.includes("Tutup"))) return cur;
    }
    return checkout.parentElement;
  }

  function upsertCleanSummary(root: HTMLElement, total: string, legacy: HTMLElement | null) {
    let summary = root.querySelector(".phase3b8-r5-cart-normal-summary") as HTMLElement | null;
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "phase3b8-r5-cart-normal-summary";
      summary.setAttribute("data-phase", "3B.8-R5");
      summary.innerHTML = [
        '<div class="phase3b8-r5-cart-total-row">',
        '  <span>Total</span>',
        '  <strong data-phase3b8-r5-cart-total></strong>',
        '</div>',
        '<div class="phase3b8-r5-cart-note"></div>'
      ].join("");
    }

    const totalEl = summary.querySelector("[data-phase3b8-r5-cart-total]") as HTMLElement | null;
    const noteEl = summary.querySelector(".phase3b8-r5-cart-note") as HTMLElement | null;
    if (totalEl) totalEl.textContent = total;
    if (noteEl) noteEl.textContent = NEW_NOTE;

    const buttonArea = findButtonArea(root);
    if (buttonArea && buttonArea.parentElement) {
      if (summary.parentElement !== buttonArea.parentElement || summary.nextElementSibling !== buttonArea) {
        buttonArea.parentElement.insertBefore(summary, buttonArea);
      }
    } else if (legacy && legacy.parentElement) {
      legacy.parentElement.insertBefore(summary, legacy.nextSibling);
    } else if (!summary.parentElement) {
      root.appendChild(summary);
    }
  }

  function hideLegacy(root: HTMLElement, legacy: HTMLElement | null) {
    if (legacy) {
      legacy.setAttribute("data-phase3b8-r5-hidden", "legacy-cart-summary");
      legacy.style.display = "none";
    }

    // Sembunyikan baris teks "Ekspedisi:" pada kartu item keranjang yang berasal dari alur lama.
    const itemTextNodes = Array.from(root.querySelectorAll("div,p,span,small,strong")) as HTMLElement[];
    for (const el of itemTextNodes) {
      if (!isElementVisible(el)) continue;
      const t = getText(el);
      if (/^Ekspedisi\s*:/i.test(t)) {
        const block = el.closest("p,div,span") as HTMLElement | null;
        if (block) {
          block.setAttribute("data-phase3b8-r5-hidden", "legacy-item-expedition");
          block.style.display = "none";
        }
      }
    }
  }

  let pending = false;
  function normalizeCart() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      const root = findCartRoot();
      if (!root) return;
      const legacy = findDeepestLegacySummary(root);
      const total = extractSubtotal(root, legacy);
      hideLegacy(root, legacy);
      upsertCleanSummary(root, total, legacy);
    }, 80);
  }

  document.addEventListener("click", () => window.setTimeout(normalizeCart, 120), true);
  document.addEventListener("change", () => window.setTimeout(normalizeCart, 120), true);
  const observer = new MutationObserver(() => normalizeCart());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.setTimeout(normalizeCart, 250);
})();

