import { useEffect } from "react";

function textOf3B10D(el: Element | null | undefined): string {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function findCheckoutModal3B10D(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, div, section, article"))
    .filter((el) => /^checkout pesanan/i.test(textOf3B10D(el)));

  const heading = headings[0];
  if (!heading) return null;

  let current: HTMLElement | null = heading;

  for (let i = 0; i < 12 && current; i++) {
    const rect = current.getBoundingClientRect();
    const style = window.getComputedStyle(current);

    const looksLikeModal =
      rect.width > 280 &&
      rect.height > 320 &&
      (style.position === "fixed" ||
        style.position === "absolute" ||
        style.borderRadius !== "0px" ||
        style.overflow === "hidden" ||
        style.overflowY === "auto" ||
        style.overflowY === "scroll");

    if (looksLikeModal) return current;

    current = current.parentElement;
  }

  return heading.parentElement;
}

function findCheckoutSummary3B10D(modal: HTMLElement): HTMLElement | null {
  const candidates = Array.from(modal.querySelectorAll<HTMLElement>("section, article, div"))
    .filter((el) => {
      const text = textOf3B10D(el).toLowerCase();

      if (!text.includes("ringkasan pesanan")) return false;
      if (!text.includes("subtotal")) return false;
      if (!text.includes("ongkir")) return false;
      if (!text.includes("total")) return false;

      const rect = el.getBoundingClientRect();
      return rect.width > 240 && rect.height > 80;
    })
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.height - br.height || ar.width - br.width;
    });

  return candidates[0] || null;
}

function applyCheckoutOngkirSummaryNote3B10D() {
  const modal = findCheckoutModal3B10D();
  const checkoutOpen = Boolean(modal);

  document.body.classList.toggle("phase3b10d-checkout-open", checkoutOpen);

  if (!modal) {
    document
      .querySelectorAll<HTMLElement>("[data-phase3b10d-checkout-ongkir-summary-note='true']")
      .forEach((el) => el.remove());
    return;
  }

  const summary = findCheckoutSummary3B10D(modal);
  if (!summary) return;

  let note = summary.querySelector<HTMLElement>("[data-phase3b10d-checkout-ongkir-summary-note='true']");

  if (!note) {
    note = document.createElement("div");
    note.setAttribute("data-phase3b10d-checkout-ongkir-summary-note", "true");
    note.className = "phase3b10d-checkout-ongkir-summary-note";
    summary.appendChild(note);
  }

  note.textContent = "Info: Ongkir otomatis mengikuti layanan Ekspedisi Pengiriman yang dipilih.";
}

export default function Phase3B10DCheckoutOngkirSummaryNoteFix() {
  useEffect(() => {
    const run = () => {
      window.setTimeout(applyCheckoutOngkirSummaryNote3B10D, 50);
      window.setTimeout(applyCheckoutOngkirSummaryNote3B10D, 250);
      window.setTimeout(applyCheckoutOngkirSummaryNote3B10D, 700);
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
      document.body.classList.remove("phase3b10d-checkout-open");
      document
        .querySelectorAll<HTMLElement>("[data-phase3b10d-checkout-ongkir-summary-note='true']")
        .forEach((el) => el.remove());
    };
  }, []);

  return null;
}
