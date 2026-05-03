import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Profile } from "./types";
import { Layout } from "./components/Layout";
import { BuyerCatalog } from "./pages/BuyerCatalog";
import { SellerDashboard } from "./pages/SellerDashboard";
import { LoginPage } from "./pages/LoginPage";
import MasterDataPage from "./pages/MasterDataPage";
import { ProductMatrixPage } from "./pages/ProductMatrixPage";
import OrdersPage from "./pages/OrdersPage";

type Route = "buyer" | "seller" | "master" | "products" | "orders" | "login";

const ADMIN_ROUTES: Route[] = ["seller", "master", "products", "orders"];

function getRoute(): Route {
  const hash = window.location.hash.replace("#/", "").split("?")[0];
  if (["seller", "master", "products", "orders", "login", "buyer"].includes(hash)) return hash as Route;
  return "buyer";
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
        <div className="security-icon">🔒</div>
        <div>
          <h1>Akses Admin Dibatasi</h1>
          <p>
            Halaman Seller, Master Data, Product Matrix, dan Pesanan hanya dapat dibuka
            oleh akun dengan role <strong>ADMIN</strong>.
          </p>
          <p className="security-note">
            Jika akun ini seharusnya menjadi admin, ubah role pada tabel <strong>profiles</strong> di Supabase.
          </p>
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

  const isAdmin = useMemo(() => isAdminProfile(profile), [profile]);
  const isProtectedRoute = ADMIN_ROUTES.includes(route);

  async function loadProfile(userId?: string) {
    setProfileLoading(true);

    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfile(data as Profile | null);
    setProfileLoading(false);
  }

  function handleLoginDone(targetPath?: string) {
    window.location.hash = targetPath || "/seller";
  }

  useEffect(() => {
    function onHashChange() {
      setRoute(getRoute());
    }

    window.addEventListener("hashchange", onHashChange);

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      void loadProfile(newSession?.user.id);
    });

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    return <LoadingPanel />;
  }

  if (route === "login") {
    return (
      <Layout session={session} profile={profile}>
        <LoginPage onDone={handleLoginDone} redirectPath="/seller" />
      </Layout>
    );
  }

  if (isProtectedRoute) {
    const targetPath = protectedRoutePath(route);

    if (!session) {
      return (
        <Layout session={session} profile={profile}>
          <LoginPage onDone={handleLoginDone} redirectPath={targetPath} />
        </Layout>
      );
    }

    if (profileLoading) {
      return (
        <Layout session={session} profile={profile}>
          <LoadingPanel text="Memeriksa akses admin..." />
        </Layout>
      );
    }

    if (!isAdmin) {
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
      {route === "orders" && <OrdersPage />}
      {route === "buyer" && <BuyerCatalog />}
    </Layout>
  );
}