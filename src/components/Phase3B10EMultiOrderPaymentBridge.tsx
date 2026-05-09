import { useEffect } from "react";

const QRIS_IMAGE_URL_3B10E = "/payments/urbanoid-qris.jpeg";
const QRIS_MERCHANT_NAME_3B10E = "URBANOID OFFICIAL STORE, FASHION";

type MultiOrderItem3B10E = {
  id: string;
  orderNo: string;
  amount: number;
  amountText: string;
  el: HTMLElement;
};

function textOf3B10E(el: Element | null | undefined): string {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRupiah3B10E(text: string): number {
  const match = String(text || "").match(/Rp\s*[\d.,]+/i);
  if (!match?.[0]) return 0;

  const digits = match[0].replace(/[^\d]/g, "");
  const value = Number(digits);

  return Number.isFinite(value) ? value : 0;
}

function formatRupiah3B10E(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function isBuyerOrdersPage3B10E(): boolean {
  const hash = window.location.hash.toLowerCase();
  const bodyText = textOf3B10E(document.body).toLowerCase();

  return (
    hash.includes("buyer-profile") ||
    hash.includes("pesanan") ||
    bodyText.includes("pesanan saya") ||
    bodyText.includes("pembayaran & konfirmasi")
  );
}

function isUnpaidOrderText3B10E(text: string): boolean {
  const lower = text.toLowerCase();

  const unpaid =
    lower.includes("belum dibayar") ||
    lower.includes("menunggu pembayaran") ||
    lower.includes("belum bayar");

  const blocked =
    lower.includes("dibayar") && !lower.includes("belum dibayar") ||
    lower.includes("selesai") ||
    lower.includes("dibatalkan") ||
    lower.includes("dikirim") ||
    lower.includes("diterima");

  return unpaid && !blocked;
}

function extractOrderNo3B10E(text: string): string {
  const match = text.match(/\bUO-\d{8,}-[A-Z0-9]+\b/i);
  return match?.[0]?.trim() || "";
}

function findOrderCards3B10E(): MultiOrderItem3B10E[] {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div, article, li, button"));

  const items: MultiOrderItem3B10E[] = [];
  const seen = new Set<string>();

  for (const el of candidates) {
    if (el.dataset.phase3b10eProcessed === "true") continue;

    const text = textOf3B10E(el);
    if (!text) continue;

    const orderNo = extractOrderNo3B10E(text);
    if (!orderNo) continue;

    if (!isUnpaidOrderText3B10E(text)) continue;

    const amount = parseRupiah3B10E(text);
    if (!amount) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 180 || rect.height < 70) continue;
    if (text.length > 700) continue;

    if (seen.has(orderNo)) continue;
    seen.add(orderNo);

    items.push({
      id: orderNo,
      orderNo,
      amount,
      amountText: formatRupiah3B10E(amount),
      el,
    });
  }

  return items;
}

function ensureToolbar3B10E() {
  if (!isBuyerOrdersPage3B10E()) {
    document.querySelectorAll("[data-phase3b10e-toolbar='true']").forEach((el) => el.remove());
    document.querySelectorAll("[data-phase3b10e-select-wrap='true']").forEach((el) => el.remove());
    return;
  }

  const cards = findOrderCards3B10E();

  if (!cards.length) {
    document.querySelectorAll("[data-phase3b10e-toolbar='true']").forEach((el) => el.remove());
    document.querySelectorAll("[data-phase3b10e-select-wrap='true']").forEach((el) => el.remove());
    return;
  }

  for (const item of cards) {
    if (item.el.querySelector("[data-phase3b10e-select-wrap='true']")) continue;

    item.el.dataset.phase3b10eProcessed = "true";
    item.el.style.position = item.el.style.position || "relative";

    const wrap = document.createElement("label");
    wrap.className = "phase3b10e-select-wrap";
    wrap.setAttribute("data-phase3b10e-select-wrap", "true");

    wrap.innerHTML = `
      <input type="checkbox" data-phase3b10e-order-check="true" data-order-no="${item.orderNo}" data-amount="${item.amount}" />
      <span>Bayar gabungan</span>
    `;

    item.el.insertBefore(wrap, item.el.firstChild);
  }

  let toolbar = document.querySelector<HTMLElement>("[data-phase3b10e-toolbar='true']");

  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "phase3b10e-toolbar";
    toolbar.setAttribute("data-phase3b10e-toolbar", "true");

    toolbar.innerHTML = `
      <div>
        <div class="phase3b10e-toolbar-title">Pembayaran Gabungan</div>
        <div class="phase3b10e-toolbar-subtitle">Pilih beberapa pesanan belum dibayar, lalu bayar sekaligus via QRIS/transfer.</div>
      </div>
      <div class="phase3b10e-toolbar-actions">
        <button type="button" class="phase3b10e-toolbar-button secondary" data-phase3b10e-clear="true">Bersihkan</button>
        <button type="button" class="phase3b10e-toolbar-button" data-phase3b10e-open="true">Bayar Sekaligus</button>
      </div>
    `;

    const anchor =
      Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,section,div"))
        .find((el) => /pesanan saya|pembayaran & konfirmasi|pesanan/i.test(textOf3B10E(el))) ||
      document.body.firstElementChild;

    if (anchor?.parentElement) {
      anchor.parentElement.insertBefore(toolbar, anchor.nextSibling);
    } else {
      document.body.prepend(toolbar);
    }
  }

  updateToolbarState3B10E();
}

function getSelectedOrders3B10E(): MultiOrderItem3B10E[] {
  const checks = Array.from(document.querySelectorAll<HTMLInputElement>("[data-phase3b10e-order-check='true']:checked"));

  return checks.map((check) => {
    const orderNo = check.dataset.orderNo || "";
    const amount = Number(check.dataset.amount || 0);

    return {
      id: orderNo,
      orderNo,
      amount,
      amountText: formatRupiah3B10E(amount),
      el: check.closest<HTMLElement>("div,article,li,button") || document.body,
    };
  }).filter((item) => item.orderNo && item.amount > 0);
}

function updateToolbarState3B10E() {
  const toolbar = document.querySelector<HTMLElement>("[data-phase3b10e-toolbar='true']");
  if (!toolbar) return;

  const selected = getSelectedOrders3B10E();
  const total = selected.reduce((sum, item) => sum + item.amount, 0);

  const title = toolbar.querySelector<HTMLElement>(".phase3b10e-toolbar-subtitle");
  if (title) {
    title.textContent = selected.length
      ? `${selected.length} pesanan dipilih - Total ${formatRupiah3B10E(total)}`
      : "Pilih beberapa pesanan belum dibayar, lalu bayar sekaligus via QRIS/transfer.";
  }

  const openBtn = toolbar.querySelector<HTMLButtonElement>("[data-phase3b10e-open='true']");
  if (openBtn) {
    openBtn.disabled = selected.length < 2;
    openBtn.textContent = selected.length >= 2 ? `Bayar ${selected.length} Pesanan` : "Bayar Sekaligus";
  }
}

function closeBatchModal3B10E() {
  document.querySelectorAll("[data-phase3b10e-modal='true']").forEach((el) => el.remove());
}

function openBatchModal3B10E() {
  const selected = getSelectedOrders3B10E();

  if (selected.length < 2) {
    alert("Pilih minimal 2 pesanan belum dibayar untuk Bayar Sekaligus.");
    return;
  }

  const total = selected.reduce((sum, item) => sum + item.amount, 0);
  const batchNo = `PAY-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  closeBatchModal3B10E();

  const overlay = document.createElement("div");
  overlay.className = "phase3b10e-modal-overlay";
  overlay.setAttribute("data-phase3b10e-modal", "true");

  const orderRows = selected.map((item) => `
    <div class="phase3b10e-order-row">
      <div>
        <div class="phase3b10e-order-no">${item.orderNo}</div>
        <div class="phase3b10e-order-note">Pesanan belum dibayar</div>
      </div>
      <div class="phase3b10e-order-amount">${item.amountText}</div>
    </div>
  `).join("");

  overlay.innerHTML = `
    <div class="phase3b10e-modal-card" role="dialog" aria-modal="true" aria-label="Pembayaran Gabungan">
      <button type="button" class="phase3b10e-modal-close" data-phase3b10e-close="true">x</button>

      <div class="phase3b10e-modal-title">Pembayaran Gabungan</div>
      <div class="phase3b10e-modal-subtitle">ID Pembayaran: ${batchNo}</div>

      <div class="phase3b10e-summary-grid">
        <div>
          <div class="phase3b10e-summary-label">Jumlah Pesanan</div>
          <div class="phase3b10e-summary-value">${selected.length}</div>
        </div>
        <div>
          <div class="phase3b10e-summary-label">Total Pembayaran</div>
          <div class="phase3b10e-summary-value">${formatRupiah3B10E(total)}</div>
        </div>
      </div>

      <div class="phase3b10e-qris-box">
        <img src="${QRIS_IMAGE_URL_3B10E}" alt="QRIS ${QRIS_MERCHANT_NAME_3B10E}" class="phase3b10e-qris-image" />
        <div class="phase3b10e-qris-info">
          <div class="phase3b10e-qris-title">${QRIS_MERCHANT_NAME_3B10E}</div>
          <div class="phase3b10e-qris-total">${formatRupiah3B10E(total)}</div>
          <div class="phase3b10e-qris-note">
            Scan QRIS ini, lalu masukkan nominal sesuai total pembayaran gabungan. Simpan ID Pembayaran ${batchNo} sebagai catatan pembayaran.
          </div>
          <button type="button" class="phase3b10e-download" data-phase3b10e-download-qris="true">Download QRIS</button>
        </div>
      </div>

      <div class="phase3b10e-order-list">
        ${orderRows}
      </div>

      <div class="phase3b10e-warning">
        Tahap R1 masih berupa ringkasan pembayaran gabungan. Upload bukti pembayaran gabungan dan konfirmasi seller akan ditambahkan pada R2/R3. Untuk sementara, upload bukti pada salah satu pesanan dan cantumkan ID pesanan lain di catatan pembayaran.
      </div>

      <div class="phase3b10e-modal-actions">
        <button type="button" class="phase3b10e-action secondary" data-phase3b10e-close="true">Tutup</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    if (target === overlay || target?.getAttribute("data-phase3b10e-close") === "true") {
      closeBatchModal3B10E();
      return;
    }

    if (target?.getAttribute("data-phase3b10e-download-qris") === "true") {
      const link = document.createElement("a");
      link.href = QRIS_IMAGE_URL_3B10E;
      link.download = "urbanoid-qris.jpeg";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  });

  document.body.appendChild(overlay);
}

function bindEvents3B10E() {
  const marker = "__phase3b10eBound";
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;

  document.addEventListener("change", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.getAttribute("data-phase3b10e-order-check") === "true") {
      updateToolbarState3B10E();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.("button") as HTMLElement | null;
    if (!button) return;

    if (button.getAttribute("data-phase3b10e-open") === "true") {
      event.preventDefault();
      openBatchModal3B10E();
      return;
    }

    if (button.getAttribute("data-phase3b10e-clear") === "true") {
      event.preventDefault();
      document.querySelectorAll<HTMLInputElement>("[data-phase3b10e-order-check='true']").forEach((check) => {
        check.checked = false;
      });
      updateToolbarState3B10E();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeBatchModal3B10E();
    }
  });
}

export default function Phase3B10EMultiOrderPaymentBridge() {
  useEffect(() => {
    bindEvents3B10E();

    const run = () => ensureToolbar3B10E();

    run();

    const observer = new MutationObserver(() => {
      window.setTimeout(run, 150);
      window.setTimeout(run, 600);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const onRoute = () => window.setTimeout(run, 250);

    window.addEventListener("hashchange", onRoute);
    window.addEventListener("focus", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onRoute);
      window.removeEventListener("focus", run);
    };
  }, []);

  return null;
}
