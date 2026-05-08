import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Profile } from "./types";
import { Layout } from "./components/Layout";
import { BuyerCatalog } from "./pages/BuyerCatalog";
import { BuyerAuthPage } from "./pages/BuyerAuthPage";
import BuyerProfilePage from "./pages/BuyerProfilePage";
import BuyerAddressPage from "./pages/BuyerAddressPage";
import { SellerDashboard } from "./pages/SellerDashboard";
import SellerLoginPage from "./pages/SellerLoginPage";
import MasterDataPage from "./pages/MasterDataPage";
import { ProductMatrixPage } from "./pages/ProductMatrixPage";
import OrdersPage from "./pages/OrdersPage";
import ShippingPage from "./pages/ShippingPage";
import StockPage from "./pages/StockPage";
import StoreProfilePage from "./pages/StoreProfilePage";
import StoreChatAdminPage from "./pages/StoreChatAdminPage";
import UsersPage from "./pages/UsersPage";

type Route =
  | "buyer"
  | "buyer-login"
  | "buyer-register"
  | "buyer-profile"
  | "buyer-addresses"
  | "seller"
  | "seller-login"
  | "master"
  | "products"
  | "stock"
  | "orders"
  | "shipping"
  | "store-profile"
  | "store-chat"
  | "users"
  | "login";

const STAFF_ROUTES: Route[] = ["seller", "master", "products", "stock", "orders", "shipping", "store-profile", "store-chat"];
const ADMIN_ROUTES: Route[] = ["users"];
const AUTH_BUYER_ROUTES: Route[] = ["buyer-profile", "buyer-addresses"];

function getRoute(): Route {
  const hash = window.location.hash.replace("#/", "").split("?")[0];
  const routes = [
    "buyer",
    "buyer-login",
    "buyer-register",
    "buyer-profile",
    "buyer-addresses",
    "seller",
    "seller-login",
    "master",
    "products",
    "stock",
    "orders",
    "shipping",
    "store-profile",
    "store-chat",
    "users",
    "login",
  ];
  if (routes.includes(hash)) return hash as Route;
  return "buyer";
}

function isStaffProfile(profile: Profile | null) {
  const role = String(profile?.role || "").toUpperCase();
  return role === "ADMIN" || role === "SUPERADMIN" || role === "SELLER";
}

function isAdminProfile(profile: Profile | null) {
  const role = String(profile?.role || "").toUpperCase();
  return role === "ADMIN" || role === "SUPERADMIN";
}

function protectedRoutePath(route: Route) {
  return `/${route}`;
}

function LoadingPanel({ text = "Memuat UrbaNoiD..." }: { text?: string }) {
  return <div className="boot-screen">{text}</div>;
}

function AdminAccessDenied() {
  async function logoutAndReturnBuyer() {
    await supabase.auth.signOut();
    window.location.hash = "/buyer";
  }

  return (
    <section className="panel access-denied-panel">
      <div className="security-card">
        <div className="security-icon">ðŸ”’</div>
        <div>
          <h1>Akses Dibatasi</h1>
          <p>Halaman ini hanya dapat dibuka oleh akun dengan role yang sesuai.</p>
          <p className="security-note">Hubungi admin toko jika akun ini seharusnya memiliki akses.</p>
          <div className="security-actions">
            <button onClick={() => (window.location.hash = "/buyer")}>Kembali ke Buyer</button>
            <button className="danger solid-danger" onClick={logoutAndReturnBuyer}>Logout</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const isStaff = useMemo(() => isStaffProfile(profile), [profile]);
  const isAdmin = useMemo(() => isAdminProfile(profile), [profile]);
  const isStaffRoute = STAFF_ROUTES.includes(route);
  const isAdminRoute = ADMIN_ROUTES.includes(route);
  const isBuyerAuthRoute = AUTH_BUYER_ROUTES.includes(route);

  async function ensureProfile(currentSession: Session | null) {
    const user = currentSession?.user;
    if (!user?.id) return null;

    const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) {
      console.error(error);
      return null;
    }
    if (data) return data as Profile;

    const metadata = user.user_metadata || {};
    const fallback = {
      id: user.id,
      role: metadata.role || "BUYER",
      username: metadata.username || String(user.email || "buyer").split("@")[0],
      full_name: metadata.full_name || metadata.name || String(user.email || "Buyer").split("@")[0],
      email: user.email,
      phone: metadata.phone || null,
      avatar_url: metadata.avatar_url || null,
      address_line: metadata.address_line || null,
      district: metadata.district || null,
      city: metadata.city || null,
      province: metadata.province || null,
      postal_code: metadata.postal_code || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: inserted, error: upsertError } = await supabase.from("profiles").upsert(fallback, { onConflict: "id" }).select("*").maybeSingle();
    if (upsertError) {
      console.error(upsertError);
      return null;
    }
    return inserted as Profile | null;
  }

  async function loadProfile(currentSession?: Session | null) {
    setProfileLoading(true);
    if (!currentSession?.user.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    const loadedProfile = await ensureProfile(currentSession);
    setProfile(loadedProfile);
    setProfileLoading(false);
  }

  function handleLoginDone(targetPath?: string) {
    window.location.hash = targetPath || "/buyer";
  }

  useEffect(() => {
    function onHashChange() { setRoute(getRoute()); }
    window.addEventListener("hashchange", onHashChange);

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void loadProfile(newSession);
    });

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (booting) return <LoadingPanel />;

  if (route === "login" || route === "buyer-login") {
    return (
      <Layout session={session} profile={profile}>
        <BuyerAuthPage mode="login" onDone={handleLoginDone} />
      </Layout>
    );
  }

  if (route === "buyer-register") {
    return (
      <Layout session={session} profile={profile}>
        <BuyerAuthPage mode="register" onDone={handleLoginDone} />
      </Layout>
    );
  }

  if (route === "seller-login") {
    return (
      <Layout session={session} profile={profile}>
        <SellerLoginPage onDone={handleLoginDone} redirectPath="/seller" />
      </Layout>
    );
  }

  if (isStaffRoute || isAdminRoute || isBuyerAuthRoute) {
    const targetPath = protectedRoutePath(route);

    if (!session) {
      return (
        <Layout session={session} profile={profile}>
          {isStaffRoute || isAdminRoute ? (
            <SellerLoginPage onDone={handleLoginDone} redirectPath={targetPath} />
          ) : (
            <BuyerAuthPage mode="login" onDone={handleLoginDone} />
          )}
        </Layout>
      );
    }

    if (profileLoading) {
      return (
        <Layout session={session} profile={profile}>
          <LoadingPanel text="Memeriksa akses..." />
        </Layout>
      );
    }

    if ((isStaffRoute && !isStaff) || (isAdminRoute && !isAdmin)) {
      return (
        <Layout session={session} profile={profile}>
          <AdminAccessDenied />
        </Layout>
      );
    }
  }

  return (
    <Layout session={session} profile={profile}>
      {route === "seller" && <SellerDashboard />}
      {route === "master" && <MasterDataPage />}
      {route === "products" && <ProductMatrixPage />}
        {route === "stock" && <StockPage />}
      {route === "orders" && <OrdersPage />}
      {route === "shipping" && <ShippingPage />}
      {route === "store-profile" && <StoreProfilePage />}
      {route === "store-chat" && <StoreChatAdminPage />}
      {route === "users" && <UsersPage />}
      {route === "buyer-profile" && <BuyerProfilePage session={session} profile={profile} onProfileUpdated={() => loadProfile(session)} />}
        {route === "buyer-addresses" && <BuyerAddressPage session={session} profile={profile} />}
      {route === "buyer" && <BuyerCatalog session={session} profile={profile} />}
    </Layout>
  );
}




