import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { BookOpen, Boxes, ChevronDown, ChevronRight, ClipboardList, ExternalLink, LogIn, LogOut, ShoppingBag } from "lucide-react";
import { supabase } from "../lib/supabase";
import { Profile } from "../types";

type Props = {
  children: React.ReactNode;
  session: Session | null;
  profile: Profile | null;
};

type Route = "buyer" | "seller" | "master" | "products" | "orders" | "login";

const masterMenuItems = [
  { key: "showcases", label: "Etalase" },
  { key: "categories", label: "Kategori" },
  { key: "materials", label: "Bahan" },
  { key: "colors", label: "Warna" },
  { key: "sizes", label: "Ukuran & Pola" },
  { key: "product_models", label: "Model Produk" },
];

function getRoute(): Route {
  const cleaned = window.location.hash.replace("#/", "").split("?")[0];
  if (["seller", "master", "products", "orders", "login", "buyer"].includes(cleaned)) return cleaned as Route;
  return "buyer";
}

function buyerCatalogUrl() {
  return `${window.location.origin}${window.location.pathname}#/buyer`;
}

export function Layout({ children, session }: Props) {
  const [route, setRoute] = useState<Route>(getRoute());
  const [masterOpen, setMasterOpen] = useState(getRoute() === "master");

  const showSellerSidebar = ["seller", "products", "master", "orders"].includes(route);

  useEffect(() => {
    function onHashChange() {
      const nextRoute = getRoute();
      setRoute(nextRoute);
      if (nextRoute === "master") setMasterOpen(true);
    }

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.hash = "/buyer";
  }

  function openBuyerCatalogInNewTab() {
    window.open(buyerCatalogUrl(), "_blank", "noopener,noreferrer");
  }

  function openMasterTab(tabKey: string) {
    localStorage.setItem("urbanoid_master_active_tab", tabKey);
    setMasterOpen(true);

    if (getRoute() === "master") {
      window.dispatchEvent(new CustomEvent("urbanoid-master-tab", { detail: tabKey }));
    }

    window.location.hash = "/master";
  }

  return (
    <div className="layout-clean-header layout-sidebar phase-2d-11">
      <header className="topbar clean-topbar auth-topbar">
        <a className="brand" href="#/buyer">
          <div className="brand-mark">UO</div>
          <div>
            <strong>UrbaNoiD Official Store</strong>
            <span>Identity in Motion · Premium Urban Apparel</span>
          </div>
        </a>

        <div className="header-auth-actions">
          {session ? (
            <button type="button" className="header-auth-btn" onClick={logout}>
              <LogOut size={17} />
              Logout
            </button>
          ) : (
            <a className="header-auth-btn" href="#/login">
              <LogIn size={17} />
              Login
            </a>
          )}
        </div>
      </header>

      {showSellerSidebar ? (
        <div className="main-with-sidebar">
          <aside className="seller-sidebar">
            <div className="sidebar-title">
              <strong>Menu Seller</strong>
              <span>Manajemen toko</span>
            </div>

            <nav className="sidebar-nav">
              <a className={route === "products" ? "active" : ""} href="#/products">
                <Boxes size={17} />
                <span>Buka Product Matrix</span>
              </a>

              <button
                type="button"
                className={`sidebar-parent ${route === "master" ? "active" : ""}`}
                onClick={() => {
                  setMasterOpen(prev => !prev);
                  if (route !== "master") window.location.hash = "/master";
                }}
              >
                <BookOpen size={17} />
                <span>Buka Master Data</span>
                {masterOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {masterOpen && (
                <div className="sidebar-submenu">
                  {masterMenuItems.map(item => (
                    <button key={item.key} type="button" onClick={() => openMasterTab(item.key)}>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              <a className={route === "orders" ? "active" : ""} href="#/orders">
                <ClipboardList size={17} />
                <span>Pesanan</span>
              </a>

              <button type="button" onClick={openBuyerCatalogInNewTab}>
                <ExternalLink size={17} />
                <span>Preview Buyer Catalog</span>
              </button>
            </nav>
          </aside>

          <main className="app-shell">{children}</main>
        </div>
      ) : (
        <main className="app-shell">{children}</main>
      )}

      <a className="floating-cart" href="#/buyer" title="Keranjang belum aktif pada starter ini">
        <ShoppingBag size={20} />
      </a>
    </div>
  );
}
