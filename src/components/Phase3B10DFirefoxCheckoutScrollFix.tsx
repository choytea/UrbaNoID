import { useEffect } from "react";

function isFirefox3B10D() {
  return /firefox/i.test(navigator.userAgent || "");
}

function textOf3B10D(el: Element | null | undefined): string {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function findCheckoutModalCard3B10D(): HTMLElement | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, div, section"))
    .filter((el) => /checkout pesanan/i.test(textOf3B10D(el)));

  for (const heading of headings) {
    let current: HTMLElement | null = heading;

    for (let i = 0; i < 8 && current; i++) {
      const rect = current.getBoundingClientRect();
      const style = window.getComputedStyle(current);

      const looksLikeModal =
        rect.width > 420 &&
        rect.height > 320 &&
        (style.position === "fixed" ||
          style.position === "absolute" ||
          style.overflow === "hidden" ||
          style.borderRadius !== "0px");

      if (looksLikeModal) return current;

      current = current.parentElement;
    }
  }

  return null;
}

function findCheckoutScrollBody3B10D(modal: HTMLElement): HTMLElement {
  const form = modal.querySelector<HTMLElement>("form");
  if (form) return form;

  const candidates = Array.from(modal.children) as HTMLElement[];

  const largest = candidates
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter((item) => item.rect.height > 180)
    .sort((a, b) => b.rect.height - a.rect.height)[0];

  return largest?.el || modal;
}

function applyFirefoxCheckoutScrollFix3B10D() {
  if (!isFirefox3B10D()) return;

  const modal = findCheckoutModalCard3B10D();

  document
    .querySelectorAll<HTMLElement>("[data-phase3b10d-firefox-checkout-modal='true']")
    .forEach((el) => {
      if (el !== modal) el.removeAttribute("data-phase3b10d-firefox-checkout-modal");
    });

  document
    .querySelectorAll<HTMLElement>("[data-phase3b10d-firefox-checkout-scrollbody='true']")
    .forEach((el) => el.removeAttribute("data-phase3b10d-firefox-checkout-scrollbody"));

  if (!modal) {
    document.body.classList.remove("phase3b10d-firefox-checkout-open");
    return;
  }

  const scrollBody = findCheckoutScrollBody3B10D(modal);

  document.body.classList.add("phase3b10d-firefox-checkout-open");
  modal.setAttribute("data-phase3b10d-firefox-checkout-modal", "true");
  scrollBody.setAttribute("data-phase3b10d-firefox-checkout-scrollbody", "true");

  const overlay = modal.parentElement;
  if (overlay) {
    overlay.setAttribute("data-phase3b10d-firefox-checkout-overlay", "true");
  }
}

export default function Phase3B10DFirefoxCheckoutScrollFix() {
  useEffect(() => {
    if (!isFirefox3B10D()) return;

    const run = () => {
      window.setTimeout(applyFirefoxCheckoutScrollFix3B10D, 50);
      window.setTimeout(applyFirefoxCheckoutScrollFix3B10D, 250);
      window.setTimeout(applyFirefoxCheckoutScrollFix3B10D, 800);
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
    window.addEventListener("hashchange", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", run);
      window.removeEventListener("click", run, true);
      window.removeEventListener("hashchange", run);
      document.body.classList.remove("phase3b10d-firefox-checkout-open");
    };
  }, []);

  return null;
}
