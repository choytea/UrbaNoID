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
  Home,
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
import { Profile, StoreChatContext, StoreProfile } from "../types";
import { StoreInfoModal } from "./StoreInfoModal";
import { StoreChatModal } from "./StoreChatModal";
import { Phase3B7WCheckoutBridge } from "./Phase3B7WCheckoutBridge";

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

const CHAT_BADGE_EVENT = "urbanoid-chat-badge-refresh";
const BUYER_PROFILE_TAB_EVENT = "urbanoid-buyer-profile-tab";

type BuyerProfileHeaderTab = "profile" | "orders" | "chat" | "store";

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

function profileInitial(profile: Profile | null) {
  const name = profile?.full_name || profile?.username || profile?.email || "B";
  return name.trim().charAt(0).toUpperCase() || "B";
}

function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function Layout({ children, session, profile }: Props) {
  const [route, setRoute] = useState<Route>(getRoute());
  const [masterOpen, setMasterOpen] = useState(getRoute() === "master");
  const [chatMenuOpen, setChatMenuOpen] = useState(getRoute() === "store-chat");
  const [cartBadge, setCartBadge] = useState(() => cartCount());
  const [sellerChatUnread, setSellerChatUnread] = useState(0);
  const [buyerChatUnread, setBuyerChatUnread] = useState(0);
  const [storeProfile, setStoreProfile] = useState<StoreProfile | null>(null);
  const [followed, setFollowed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<StoreChatContext | null>(null);

  const isStaff = isStaffProfile(profile);
  const isAdmin = isAdminProfile(profile);
  const sellerRoutes = ["seller", "products", "master", "orders", "shipping", "store-profile", "store-chat", "users"];
  const showSellerSidebar = Boolean(session && isStaff && sellerRoutes.includes(route));
  const showBuyerHeader = !showSellerSidebar && route !== "seller-login";
  const isBuyerSurfaceRoute = route === "buyer" || route === "buyer-profile";
  const showBuyerSessionActions = Boolean(showBuyerHeader && session && isBuyerSurfaceRoute);

  const topbarStyle = useMemo(() => {
    if (!showBuyerHeader || !storeProfile?.banner_url) return undefined;
    return {
      backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.93), rgba(15,23,42,.62)), url(${storeProfile.banner_url})`,
    } as React.CSSProperties;
  }, [showBuyerHeader, storeProfile?.banner_url]);

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

  async function loadChatBadges() {
    if (!session?.user.id) {
      setSellerChatUnread(0);
      setBuyerChatUnread(0);
      return;
    }

    if (isStaff) {
      const { data, error } = await supabase.rpc("store_chat_unread_for_seller");
      if (!error) setSellerChatUnread(Number(data || 0));
      setBuyerChatUnread(0);
      return;
    }

    const { data, error } = await supabase.rpc("store_chat_unread_for_buyer");
    if (!error) setBuyerChatUnread(Number(data || 0));
    setSellerChatUnread(0);
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
      if (nextRoute === "store-chat") setChatMenuOpen(true);
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

  useEffect(() => {
    void loadChatBadges();

    function refreshBadges() {
      void loadChatBadges();
    }

    window.addEventListener(CHAT_BADGE_EVENT, refreshBadges);
    const timer = window.setInterval(refreshBadges, 15000);

    return () => {
      window.removeEventListener(CHAT_BADGE_EVENT, refreshBadges);
      window.clearInterval(timer);
    };
  }, [session?.user.id, isStaff]);

  function openBuyerProfileTab(tab: BuyerProfileHeaderTab) {
    if (!session?.user.id) {
      localStorage.setItem("urbanoid_buyer_profile_tab", tab);
      window.location.hash = "/buyer-login";
      return;
    }

    localStorage.setItem("urbanoid_buyer_profile_tab", tab);
    window.dispatchEvent(new CustomEvent(BUYER_PROFILE_TAB_EVENT, { detail: tab }));
    window.location.hash = "/buyer-profile";
  }

  function openBuyerOrders() {
    openBuyerProfileTab("orders");
  }

  function openCartFromHeader() {
    if (getRoute() === "buyer") {
      requestOpenCart();
      return;
    }

    window.location.hash = "/buyer";
    window.setTimeout(() => requestOpenCart(), 350);
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

  function openChatFilter(filter: "ALL" | "UNREAD" | "OPEN" | "CLOSED") {
    localStorage.setItem("urbanoid_store_chat_filter", filter);
    setChatMenuOpen(true);

    if (getRoute() === "store-chat") {
      window.dispatchEvent(new CustomEvent("urbanoid-store-chat-filter", { detail: filter }));
    }
    window.location.hash = "/store-chat";
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

  function openStoreChat(context?: StoreChatContext | null) {
    if (!session?.user.id) {
      localStorage.setItem("urbanoid_buyer_profile_tab", "chat");
      window.location.hash = "/buyer-login";
      return;
    }
    setChatContext(context || null);
    setInfoOpen(false);
    setChatOpen(true);
  }

  useEffect(() => {
    function onOpenStoreChat(event: Event) {
      const detail = (event as CustomEvent<StoreChatContext>).detail || null;
      openStoreChat(detail);
    }

    window.addEventListener("urbanoid-open-store-chat", onOpenStoreChat as EventListener);
    return () => window.removeEventListener("urbanoid-open-store-chat", onOpenStoreChat as EventListener);
  }, [session?.user.id, isStaff, storeProfile?.id]);

  return (
    <div className="layout-clean-header layout-sidebar phase-3b-2-buyer-header phase-3b-3-buyer-polish phase-3b-4-chat-badge-accordion">
      <header className={`topbar clean-topbar auth-topbar ${showBuyerHeader ? "buyer-store-topbar" : ""}`} style={topbarStyle}>
        <a className="brand buyer-store-brand" href="#/buyer">
          {showBuyerHeader && storeProfile?.logo_url ? (
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
          {showBuyerHeader && (
            <>
              <a className="header-auth-btn buyer-home-header-btn" href="#/buyer">
                <Home size={17} /> Beranda
              </a>

              <button type="button" className="header-auth-btn" onClick={() => setInfoOpen(true)}>
                <Info size={17} /> Info Toko
              </button>

              <button type="button" className={`header-auth-btn ${followed ? "followed" : ""}`} onClick={toggleFollow}>
                <Heart size={17} /> {followed ? "Mengikuti" : "Ikuti Toko"}
              </button>

              <button type="button" className="header-auth-btn nav-badge-wrap" onClick={() => openStoreChat(null)}>
                <MessageCircle size={17} /> Chat Toko
                {buyerChatUnread > 0 && <span className="nav-badge">{badgeLabel(buyerChatUnread)}</span>}
              </button>

              {showBuyerSessionActions && (
                <button type="button" className="header-auth-btn buyer-orders-header-btn" onClick={openBuyerOrders}>
                  <ClipboardList size={17} /> Pesanan Saya
                </button>
              )}

              <button type="button" className="header-auth-btn buyer-cart-header-btn" onClick={openCartFromHeader}>
                <ShoppingBag size={17} /> Keranjang {cartBadge > 0 ? `(${cartBadge})` : ""}
              </button>
            </>
          )}

          {showBuyerSessionActions && (
            <button type="button" className="header-auth-btn profile-header-btn" onClick={() => openBuyerProfileTab("profile")}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name || "Profil Buyer"} />
              ) : (
                <span className="profile-header-initial">{profileInitial(profile)}</span>
              )}
              <span>Profil Buyer</span>
            </button>
          )}

          {!session && showBuyerHeader && (
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
          <aside className="seller-sidebar compact-seller-sidebar">
            <div className="sidebar-title">
              <strong>Menu Admin</strong>
              <span>Manajemen toko</span>
            </div>

            <nav className="sidebar-nav">
              <a className={route === "products" ? "active" : ""} href="#/products">
                <Boxes size={16} />
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
                <BookOpen size={16} />
                <span>Buka Master Data</span>
                {masterOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
                <ClipboardList size={16} />
                <span>Pesanan</span>
              </a>

              <button
                type="button"
                className={`sidebar-parent sidebar-chat-parent nav-badge-wrap ${route === "store-chat" ? "active" : ""}`}
                onClick={() => {
                  setChatMenuOpen(prev => !prev);
                  if (route !== "store-chat") window.location.hash = "/store-chat";
                }}
              >
                <MessageCircle size={16} />
                <span>Chat Toko</span>
                {sellerChatUnread > 0 && <span className="nav-badge sidebar-badge">{badgeLabel(sellerChatUnread)}</span>}
                {chatMenuOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>

              {chatMenuOpen && (
                <div className="sidebar-submenu chat-sidebar-submenu">
                  <button type="button" onClick={() => openChatFilter("ALL")}>Semua Chat</button>
                  <button type="button" onClick={() => openChatFilter("UNREAD")}>
                    Belum Dibaca {sellerChatUnread > 0 ? `(${sellerChatUnread})` : ""}
                  </button>
                  <button type="button" onClick={() => openChatFilter("OPEN")}>Open</button>
                  <button type="button" onClick={() => openChatFilter("CLOSED")}>Closed</button>
                </div>
              )}

              <a className={route === "shipping" ? "active" : ""} href="#/shipping">
                <Truck size={16} />
                <span>Ekspedisi</span>
              </a>

              <a className={route === "store-profile" ? "active" : ""} href="#/store-profile">
                <Store size={16} />
                <span>Profil Toko</span>
              </a>

              {isAdmin && (
                <a className={route === "users" ? "active" : ""} href="#/users">
                  <Users size={16} />
                  <span>Pengguna & Role</span>
                </a>
              )}

              <button type="button" onClick={openBuyerCatalogInNewTab}>
                <ExternalLink size={16} />
                <span>Preview Buyer Catalog</span>
              </button>
            </nav>
          </aside>

          <main className="app-shell">{children}</main>
        </div>
      ) : (
        <main className="app-shell">{children}</main>
      )}

      <Phase3B7WCheckoutBridge />

      <StoreInfoModal
        open={infoOpen}
        store={storeProfile}
        followed={followed}
        onClose={() => setInfoOpen(false)}
        onFollowToggle={toggleFollow}
        onOpenChat={() => openStoreChat(null)}
      />

      <StoreChatModal
        open={chatOpen}
        session={session}
        profile={profile}
        store={storeProfile}
        context={chatContext}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
