import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Smartphone, X, ExternalLink, RotateCcw } from "lucide-react";

type DevicePreset3B10D = {
  id: string;
  label: string;
  width: number;
  height: number;
};

const DEVICE_PRESETS_3B10D: DevicePreset3B10D[] = [
  { id: "iphone", label: "iPhone 390 x 844", width: 390, height: 844 },
  { id: "android", label: "Android 360 x 800", width: 360, height: 800 },
  { id: "small", label: "Small HP 320 x 740", width: 320, height: 740 },
  { id: "large", label: "Large HP 430 x 932", width: 430, height: 932 },
];

const PREVIEW_PAGES_3B10D = [
  { label: "Beranda / Katalog Buyer", hash: "#/buyer" },
  { label: "Profil Buyer", hash: "#/buyer-profile" },
  { label: "Atur Alamat", hash: "#/buyer-addresses" },
];

function textOf3B10D(el: Element | null | undefined): string {
  return String((el as HTMLElement | null)?.innerText || el?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isSellerSide3B10D(): boolean {
  const hash = window.location.hash.toLowerCase();
  const bodyText = textOf3B10D(document.body).toLowerCase();

  if (
    hash.includes("seller") ||
    hash.includes("orders") ||
    hash.includes("finance") ||
    hash.includes("stock") ||
    hash.includes("store-profile") ||
    hash.includes("shipping") ||
    hash.includes("store-chat") ||
    hash.includes("master") ||
    hash.includes("product") ||
    hash.includes("users")
  ) {
    return true;
  }

  return (
    bodyText.includes("menu admin") ||
    bodyText.includes("manajemen toko") ||
    bodyText.includes("buka product matrix") ||
    bodyText.includes("preview buyer catalog") ||
    bodyText.includes("profil toko") ||
    bodyText.includes("pengguna & role")
  );
}

function buildPreviewUrl3B10D(hash: string, refreshKey: number) {
  const base = `${window.location.origin}${window.location.pathname}`;
  const cleanHash = hash || "#/buyer";
  return `${base}${cleanHash}?previewHp=1&ts=${refreshKey}`;
}

function findPreviewBuyerCatalogButton3B10D(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a, div"))
    .filter((el) => {
      const text = textOf3B10D(el).toLowerCase();
      return text.includes("preview buyer catalog") || text.includes("preview buyer katalog");
    })
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.height - br.height || ar.width - br.width;
    });

  return candidates[0] || null;
}

function ensureSidebarSlot3B10D(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>("[data-phase3b10d-preview-hp-sidebar-slot='true']");
  if (existing) return existing;

  const anchor = findPreviewBuyerCatalogButton3B10D();
  if (!anchor) return null;

  const slot = document.createElement("div");
  slot.setAttribute("data-phase3b10d-preview-hp-sidebar-slot", "true");
  slot.className = "phase3b10d-preview-hp-sidebar-slot";

  const wrapper =
    anchor.closest("button, a") ||
    anchor.closest("li, div") ||
    anchor;

  wrapper.insertAdjacentElement("afterend", slot);

  return slot;
}

export default function Phase3B10DSellerMobileBuyerPreview() {
  const [visibleOnSeller, setVisibleOnSeller] = useState(false);
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("iphone");
  const [pageHash, setPageHash] = useState("#/buyer");
  const [refreshKey, setRefreshKey] = useState(() => Date.now());

  const device = useMemo(() => {
    return DEVICE_PRESETS_3B10D.find((item) => item.id === deviceId) || DEVICE_PRESETS_3B10D[0];
  }, [deviceId]);

  const previewUrl = useMemo(() => {
    return buildPreviewUrl3B10D(pageHash, refreshKey);
  }, [pageHash, refreshKey]);

  useEffect(() => {
    const check = () => {
      const seller = isSellerSide3B10D();
      setVisibleOnSeller(seller);

      if (seller) {
        setSidebarSlot(ensureSidebarSlot3B10D());
      } else {
        setSidebarSlot(null);
      }
    };

    const run = () => {
      window.setTimeout(check, 80);
      window.setTimeout(check, 350);
      window.setTimeout(check, 900);
    };

    run();

    const observer = new MutationObserver(run);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("hashchange", run);
    window.addEventListener("focus", run);
    window.addEventListener("resize", run);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("resize", run);
    };
  }, []);

  if (!visibleOnSeller) return null;

  const triggerButton = (
    <button
      type="button"
      className="phase3b10d-seller-mobile-preview-button phase3b10d-seller-mobile-preview-sidebar-button"
      onClick={() => setOpen(true)}
      title="Preview tampilan buyer versi HP"
    >
      <Smartphone size={17} />
      Preview HP Buyer
    </button>
  );

  return (
    <>
      {sidebarSlot ? createPortal(triggerButton, sidebarSlot) : triggerButton}

      {open ? (
        <div className="phase3b10d-seller-mobile-preview-overlay" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="phase3b10d-seller-mobile-preview-panel">
            <div className="phase3b10d-seller-mobile-preview-header">
              <div>
                <h2>Preview HP Buyer</h2>
                <p>Uji tampilan aplikasi buyer dalam frame HP tanpa meninggalkan halaman seller.</p>
              </div>

              <button type="button" className="phase3b10d-seller-mobile-preview-close" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="phase3b10d-seller-mobile-preview-toolbar">
              <label>
                Halaman
                <select value={pageHash} onChange={(event) => setPageHash(event.target.value)}>
                  {PREVIEW_PAGES_3B10D.map((page) => (
                    <option value={page.hash} key={page.hash}>
                      {page.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Ukuran HP
                <select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>
                  {DEVICE_PRESETS_3B10D.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" onClick={() => setRefreshKey(Date.now())}>
                <RotateCcw size={15} />
                Refresh Preview
              </button>

              <button type="button" onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink size={15} />
                Buka Tab
              </button>
            </div>

            <div className="phase3b10d-seller-mobile-preview-stage">
              <div
                className="phase3b10d-seller-mobile-preview-phone"
                style={{
                  width: `${device.width}px`,
                  height: `${device.height}px`,
                }}
              >
                <div className="phase3b10d-seller-mobile-preview-speaker" />
                <iframe
                  title="Preview HP Buyer"
                  src={previewUrl}
                  className="phase3b10d-seller-mobile-preview-iframe"
                />
              </div>
            </div>

            <div className="phase3b10d-seller-mobile-preview-note">
              Catatan: untuk uji checkout penuh, gunakan tombol <b>Buka Tab</b> lalu login sebagai buyer jika diperlukan.
              Frame ini terutama untuk mengecek layout HP, header, katalog, keranjang, checkout, dan scroll.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
