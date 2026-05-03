import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Heart,
  Info,
  LogIn,
  LogOut,
  MessageCircle,
  ShoppingBag,
  Store,
  Truck,
  Users
} from "lucide-react";
import { CART_UPDATED_EVENT, cartCount, requestOpenCart } from "../lib/cart";
import { supabase } from "../lib/supabase";
import { Profile, StoreProfile } from "../types";
import { StoreInfoModal } from "./StoreInfoModal";
import { StoreChatModal } from "./StoreChatModal";

type Props = {
  children: React.ReactNode;
  session: Session | null;
  profile: Profile | null;
};

type Route =
  | "buyer"
  | "buyer-login"
  | "buyer-register"
  | "buyer-profile"
  | "seller"
  | "seller-login"
  | "master"
  | "products"
  | "orders"
  | "shipping"
  | "store-profile"
  | "store-chat"
  | "users"
  | "login";

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
  const routes = [
    "buyer",
    "buyer-login",
    "buyer-register",
    "buyer-profile",
    "seller",
    "seller-login",
    "master",
    "products",
    "orders",
    "shipping",
    "store-profile",
    "store-chat",
    "users",
    "login",
  ];
  if (routes.includes(cleaned)) return cleaned as Route;
  return "buyer";
}

function buyerCatalogUrl() {
  return `${window.location.origin}${window.location.pathname}#/buyer`;
}

function isStaffProfile(profile: Profile | null) {
  const role = String(profile?.role || "").toUpperCase();
  return role === "ADMIN" || role === "SUPERADMIN" || role === "SELLER";
}

function isAdminProfile(profile: Profile | null) {
  const role = String(profile?.role || "").toUpperCase();
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function Layout({ children, session, profile }: Props) {
  const [route, setRoute] = useState<Route>(getRoute());
  const [masterOpen, setMasterOpen] = useState(getRoute() === "master");
  const [cartBadge, setCartBadge] = useState(() => cartCount());
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [followed, setFollowed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const isStaff = isStaffProfile(profile);
  const isAdmin = isAdminProfile(profile);
  const sellerRoutes = ["seller", "products", "master", "orders", "shipping", "store-profile", "store-chat", "users"];
  const showSellerSidebar = Boolean(session && isStaff && sellerRoutes.includes(route));
  const isBuyerSurface = !showSellerSidebar;

  const topbarStyle = useMemo(() => {
    if (!isBuyerSurface || !storeProfile?.banner_url) return undefined;
    return {
      backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.92), rgba(15,23,42,.68)), url(${storeProfile.banner_url})`,
    } as React.CSSProperties;
  }, [isBuyerSurface, storeProfile?.banner_url]);

  async function loadStoreProfile() {
    const { data } = await supabase
      .from("store_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) setStoreProfile(data as StoreProfile);
  }

  async function loadFollow(storeId?: string | null) {
    if (!session?.user.id || !storeId || isStaff) {
      setFollowed(false);
      return;
    }

    const { data } = await supabase
      .from("store_follows")
      .select("id")
      .eq("buyer_id", session.user.id)
      .eq("store_id", storeId)
      .maybeSingle();

    setFollowed(!!data);
  }

  useEffect(() => {
    void loadStoreProfile();
  }, []);

  useEffect(() => {
    void loadFollow(storeProfile?.id);
  }, [session?.user.id, storeProfile?.id, isStaff]);

  useEffect(() => {
    function onHashChange() {
      const nextRoute = getRoute();
      setRoute(nextRoute);
      if (nextRoute === "master") setMasterOpen(true);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    function onCartUpdated() { setCartBadge(cartCount()); }
    window.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
    window.addEventListener("storage", onCartUpdated);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
      window.removeEventListener("storage", onCartUpdated);
    };
  }, []);

  function handleFloatingCart(event: React.MouseEvent<HTMLAnchorElement>) {
    if (getRoute() === "buyer") {
      event.preventDefault();
      requestOpenCart();
    }
  }

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

  async function toggleFollow() {
    if (!storeProfile?.id) return;

    if (!session?.user.id || isStaff) {
      window.location.hash = "/buyer-register";
      return;
    }

    if (followed) {
      await supabase.from("store_follows").delete().eq("buyer_id", session.user.id).eq("store_id", storeProfile.id);
      setFollowed(false);
      return;
    }

    await supabase.from("store_follows").insert({ buyer_id: session.user.id, store_id: storeProfile.id });
    setFollowed(true);
  }

  function openStoreChat() {
    if (!session?.user.id || isStaff) {
      window.location.hash = "/buyer-register";
      return;
    }
    setInfoOpen(false);
    setChatOpen(true);
  }

  return (
    <div className="layout-clean-header layout-sidebar phase-3b-2-buyer-header">
      <header className={`topbar clean-topbar auth-topbar ${isBuyerSurface ? "buyer-store-topbar" : ""}`} style={topbarStyle}>
        <a className="brand buyer-store-brand" href="#/buyer">
          {isBuyerSurface && storeProfile?.logo_url ? (
            <img className="brand-logo-img" src={storeProfile.logo_url} alt={storeProfile.store_name || "UrbaNoiD"} />
          ) : (
            <div className="brand-mark">UO</div>
          )}
          <div>
            <strong>{storeProfile?.store_name || "UrbaNoiD Official Store"}</strong>
            <span>{storeProfile?.tagline || "Identity in Motion · Premium Urban Apparel"}</span>
          </div>
        </a>

        <div className="header-auth-actions buyer-header-actions">
          {isBuyerSurface && (
            <>
              <button type="button" className="header-auth-btn" onClick={() => setInfoOpen(true)}>
                <Info size={17} /> Info Toko
              </button>

              <button type="button" className={`header-auth-btn ${followed ? "followed" : ""}`} onClick={toggleFollow}>
                <Heart size={17} /> {followed ? "Mengikuti" : "Ikuti Toko"}
              </button>

              <button type="button" className="header-auth-btn" onClick={openStoreChat}>
                <MessageCircle size={17} /> Chat Toko
              </button>
            </>
          )}

          {session && !isStaff && <a className="header-auth-btn" href="#/buyer-profile">Profil Buyer</a>}

          {!session && isBuyerSurface && (
            <a className="header-auth-btn" href="#/buyer-login"><LogIn size={17} /> Login Buyer</a>
          )}

          {session && (
            <button type="button" className="header-auth-btn" onClick={logout}>
              <LogOut size={17} />
              Logout
            </button>
          )}
        </div>
      </header>

      {showSellerSidebar ? (
        <div className="main-with-sidebar">
          <aside className="seller-sidebar">
            <div className="sidebar-title">
              <strong>Menu Admin</strong>
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

              <a className={route === "store-chat" ? "active" : ""} href="#/store-chat">
                <MessageCircle size={17} />
                <span>Chat Toko</span>
              </a>

              <a className={route === "shipping" ? "active" : ""} href="#/shipping">
                <Truck size={17} />
                <span>Ekspedisi</span>
              </a>

              <a className={route === "store-profile" ? "active" : ""} href="#/store-profile">
                <Store size={17} />
                <span>Profil Toko</span>
              </a>

              {isAdmin && (
                <a className={route === "users" ? "active" : ""} href="#/users">
                  <Users size={17} />
                  <span>Pengguna & Role</span>
                </a>
              )}

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

      <a className="floating-cart" href="#/buyer" title="Buka keranjang" onClick={handleFloatingCart}>
        <ShoppingBag size={20} />
        {cartBadge > 0 && <span className="floating-cart-count">{cartBadge}</span>}
      </a>

      <StoreInfoModal
        open={infoOpen}
        store={storeProfile}
        followed={followed}
        onClose={() => setInfoOpen(false)}
        onFollowToggle={toggleFollow}
        onOpenChat={openStoreChat}
      />

      <StoreChatModal
        open={chatOpen}
        session={session}
        profile={profile}
        store={storeProfile}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
