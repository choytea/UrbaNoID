import { useEffect } from "react";

function isMobileCheckoutOngkir3B10D() {
  return window.matchMedia("(max-width: 820px)").matches;
}

function textOf3B10D(el: Element | null | undefined): string {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function findCheckoutModal3B10D(): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, div, section, article"));

  const heading = nodes.find((el) => /^checkout pesanan/i.test(textOf3B10D(el)));

  if (!heading) return null;

  let current: HTMLElement | null = heading;

  for (let i = 0; i < 10 && current; i++) {
    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);

    const looksLikeModal =
      rect.width > 280 &&
      rect.height > 320 &&
      (style.position === "fixed" ||
        style.position === "absolute" ||
        style.borderRadius !== "0px" ||
        style.overflow === "hidden" ||
        style.overflowY === "auto");

    if (looksLikeModal) return current;

    current = current.parentElement;
  }

  return heading.closest("form") || heading.parentElement;
}

function findOriginalOngkirPanel3B10D(modal: HTMLElement | null): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("div, section, article"))
    .filter((el) => el.getAttribute("data-phase3b10d-mobile-ongkir-clone") !== "true")
    .filter((el) => {
      const text = textOf3B10D(el).toLowerCase();

      if (!text.includes("ongkir ekspedisi")) return false;

      const hasSummary =
        text.includes("subtotal produk") ||
        text.includes("total bayar") ||
        text.includes("opsi ekspedisi") ||
        text.includes("layanan ekspedisi");

      if (!hasSummary) return false;

      const rect = el.getBoundingClientRect();

      return rect.width >= 220 && rect.height >= 120;
    })
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const text = textOf3B10D(el);

      let score = 0;
      if (text.toLowerCase().includes("subtotal produk")) score += 4;
      if (text.toLowerCase().includes("total bayar")) score += 4;
      if (text.toLowerCase().includes("opsi ekspedisi")) score += 2;
      if (modal && modal.contains(el)) score -= 4;

      return { el, score, area: rect.width * rect.height, textLength: text.length };
    })
    .sort((a, b) => b.score - a.score || a.area - b.area || a.textLength - b.textLength);

  return candidates[0]?.el || null;
}

function findExpeditionAnchor3B10D(modal: HTMLElement): HTMLElement | null {
  const candidates = Array.from(modal.querySelectorAll<HTMLElement>("label, div, section, article"))
    .filter((el) => {
      const text = textOf3B10D(el).toLowerCase();
      if (!text.includes("ekspedisi pengiriman")) return false;

      const rect = el.getBoundingClientRect();
      return rect.width > 180 && rect.height < 180;
    })
    .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);

  if (candidates[0]) return candidates[0];

  const selects = Array.from(modal.querySelectorAll<HTMLSelectElement>("select"));
  const expeditionSelect = selects.find((select) => {
    const text = textOf3B10D(select).toLowerCase();
    return (
      text.includes("reguler") ||
      text.includes("jne") ||
      text.includes("tiki") ||
      text.includes("sicepat") ||
      text.includes("anteraja") ||
      text.includes("j&t")
    );
  });

  return expeditionSelect?.closest("label, div, section, article") as HTMLElement | null;
}

function cleanupInlineOngkir3B10D() {
  document.querySelectorAll<HTMLElement>("[data-phase3b10d-mobile-ongkir-clone='true']").forEach((el) => el.remove());

  document.querySelectorAll<HTMLElement>("[data-phase3b10d-mobile-ongkir-original='hidden']").forEach((el) => {
    el.removeAttribute("data-phase3b10d-mobile-ongkir-original");
    el.removeAttribute("aria-hidden");
  });
}

function syncMobileCheckoutOngkirInline3B10D() {
  const modal = findCheckoutModal3B10D();

  if (!modal || !isMobileCheckoutOngkir3B10D()) {
    cleanupInlineOngkir3B10D();
    return;
  }

  const original = findOriginalOngkirPanel3B10D(modal);

  if (!original) return;

  let clone = modal.querySelector<HTMLElement>("[data-phase3b10d-mobile-ongkir-clone='true']");

  if (!clone) {
    clone = document.createElement("div");
    clone.setAttribute("data-phase3b10d-mobile-ongkir-clone", "true");
    clone.className = `${original.className || ""} phase3b10d-mobile-ongkir-inline`.trim();

    const anchor = findExpeditionAnchor3B10D(modal);

    if (anchor) {
      anchor.insertAdjacentElement("afterend", clone);
    } else {
      modal.insertBefore(clone, modal.children[1] || modal.firstChild);
    }
  }

  clone.innerHTML = original.innerHTML;
  clone.className = `${original.className || ""} phase3b10d-mobile-ongkir-inline`.trim();

  original.setAttribute("data-phase3b10d-mobile-ongkir-original", "hidden");
  original.setAttribute("aria-hidden", "true");
}

export default function Phase3B10DMobileCheckoutOngkirInlineFix() {
  useEffect(() => {
    const run = () => {
      window.setTimeout(syncMobileCheckoutOngkirInline3B10D, 60);
      window.setTimeout(syncMobileCheckoutOngkirInline3B10D, 250);
      window.setTimeout(syncMobileCheckoutOngkirInline3B10D, 800);
    };

    run();

    const observer = new MutationObserver(run);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("resize", run);
    window.addEventListener("click", run, true);
    window.addEventListener("change", run, true);
    window.addEventListener("hashchange", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
      window.removeEventListener("click", run, true);
      window.removeEventListener("change", run, true);
      window.removeEventListener("hashchange", run);
      cleanupInlineOngkir3B10D();
    };
  }, []);

  return null;
}
