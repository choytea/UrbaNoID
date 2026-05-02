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

function getRoute(): Route {
  const hash = window.location.hash.replace("#/", "").split("?")[0];
  if (["seller", "master", "products", "orders", "login", "buyer"].includes(hash)) return hash as Route;
  return "buyer";
}

export default function App() {
  const [route, setRoute] = useState<Route>(getRoute());
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(true);

  const isStaff = useMemo(() => profile?.role === "ADMIN" || profile?.role === "SELLER", [profile]);

  async function loadProfile(userId?: string) {
    if (!userId) {
      setProfile(null);
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
      return;
    }

    setProfile(data as Profile | null);
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
      loadProfile(newSession?.user.id);
    });

    return () => {
      window.removeEventListener("hashchange", onHashChange);
      listener.subscription.unsubscribe();
    };
  }, []);

  if (booting) {
    return <div className="boot-screen">Memuat UrbaNoiD...</div>;
  }

  if (route === "login") {
    return (
      <Layout session={session} profile={profile}>
        <LoginPage onDone={() => (window.location.hash = profile?.role === "ADMIN" || profile?.role === "SELLER" ? "/seller" : "/buyer")} />
      </Layout>
    );
  }

  if (route === "seller" || route === "master" || route === "products") {
    if (!session) {
      return (
        <Layout session={session} profile={profile}>
          <LoginPage onDone={() => (window.location.hash = "/seller")} />
        </Layout>
      );
    }

    if (!isStaff) {
      return (
        <Layout session={session} profile={profile}>
          <div className="panel">
            <h1>Akses seller ditolak</h1>
            <p>Akun ini belum memiliki role ADMIN atau SELLER.</p>
            <button onClick={() => (window.location.hash = "/buyer")}>Kembali ke Buyer</button>
          </div>
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



