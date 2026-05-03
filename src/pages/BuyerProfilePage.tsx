import { useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/utils";
import { OrderMessage, OrderRow, Profile, StoreProfile } from "../types";

type Props = {
  session: Session | null;
  profile: Profile | null;
  onProfileUpdated?: () => void;
};

export function BuyerProfilePage({ session, profile, onProfileUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<"profile" | "orders" | "chat" | "store">("profile");
  const [form, setForm] = useState({
    username: profile?.username || "",
    full_name: profile?.full_name || "",
    email: profile?.email || session?.user.email || "",
    phone: profile?.phone || "",
    address_line: profile?.address_line || "",
    district: profile?.district || "",
    city: profile?.city || "",
    province: profile?.province || "",
    postal_code: profile?.postal_code || "",
    avatar_url: profile?.avatar_url || "",
  });
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [followed, setFollowed] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!session) return;
    loadOrders();
    loadStore();
  }, [session]);

  useEffect(() => {
    setForm({
      username: profile?.username || "",
      full_name: profile?.full_name || "",
      email: profile?.email || session?.user.email || "",
      phone: profile?.phone || "",
      address_line: profile?.address_line || "",
      district: profile?.district || "",
      city: profile?.city || "",
      province: profile?.province || "",
      postal_code: profile?.postal_code || "",
      avatar_url: profile?.avatar_url || "",
    });
  }, [profile, session]);

  useEffect(() => {
    if (selectedOrder?.id) loadMessages(selectedOrder.id);
  }, [selectedOrder]);

  async function loadOrders() {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (!error) {
      const rows = (data || []) as OrderRow[];
      setOrders(rows);
      if (rows.length && !selectedOrder) setSelectedOrder(rows[0]);
    }
  }

  async function loadStore() {
    const { data: storeData } = await supabase
      .from("store_profiles")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (storeData) setStore(storeData as StoreProfile);

    const { data: follow } = await supabase
      .from("store_follows")
      .select("id")
      .eq("buyer_id", session?.user.id || "")
      .limit(1)
      .maybeSingle();

    setFollowed(!!follow);
  }

  async function loadMessages(orderId: string) {
    const { data } = await supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    setMessages((data || []) as OrderMessage[]);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;

    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      role: profile?.role || "BUYER",
      ...form,
      email: form.email || session.user.email,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    setMessage(error ? error.message : "Profil buyer berhasil diperbarui.");
    if (!error) onProfileUpdated?.();
  }

  async function uploadAvatar(file: File) {
    if (!session) return;
    setMessage("Mengunggah foto profil...");
    const cleanName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, "-");
    const path = `${session.user.id}/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, { upsert: true });
    if (uploadError) {
      setMessage(uploadError.message);
      return;
    }

    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    setForm(prev => ({ ...prev, avatar_url: data.publicUrl }));
    setMessage("Foto berhasil diunggah. Klik Simpan Profil untuk menyimpan URL foto.");
  }

  async function toggleFollow() {
    if (!session || !store) return;

    if (followed) {
      await supabase.from("store_follows").delete().eq("buyer_id", session.user.id).eq("store_id", store.id);
      setFollowed(false);
      return;
    }

    await supabase.from("store_follows").insert({ buyer_id: session.user.id, store_id: store.id });
    setFollowed(true);
  }

  async function sendMessage() {
    if (!session || !selectedOrder || !newMessage.trim()) return;

    const { error } = await supabase.from("order_messages").insert({
      order_id: selectedOrder.id,
      sender_id: session.user.id,
      sender_role: "BUYER",
      message: newMessage.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewMessage("");
    await loadMessages(selectedOrder.id);
  }

  const totalOrderValue = useMemo(() => orders.reduce((sum, order) => sum + Number(order.grand_total || order.total_amount || 0), 0), [orders]);

  if (!session) {
    return (
      <section className="panel">
        <h1>Profil Buyer</h1>
        <p>Silakan login/register buyer terlebih dahulu.</p>
        <a className="btn-primary inline-link-button" href="#/buyer-register">Registrasi / Login Buyer</a>
      </section>
    );
  }

  return (
    <section className="panel buyer-profile-panel">
      <div className="section-title">
        <div>
          <h1>Profil Buyer</h1>
          <p>Kelola data profil, alamat, pesanan, chat, dan status mengikuti toko.</p>
        </div>
        <a className="btn-secondary inline-link-button" href="#/buyer">Kembali ke Katalog</a>
      </div>

      <div className="profile-tab-row">
        <button className={activeTab === "profile" ? "active" : ""} onClick={() => setActiveTab("profile")}>Profil</button>
        <button className={activeTab === "orders" ? "active" : ""} onClick={() => setActiveTab("orders")}>Pesanan Saya</button>
        <button className={activeTab === "chat" ? "active" : ""} onClick={() => setActiveTab("chat")}>Chat Pesanan</button>
        <button className={activeTab === "store" ? "active" : ""} onClick={() => setActiveTab("store")}>Toko</button>
      </div>

      {message && <div className="success-box">{message}</div>}

      {activeTab === "profile" && (
        <form className="profile-form" onSubmit={saveProfile}>
          <div className="avatar-box">
            <img src={form.avatar_url || "https://placehold.co/140x140/111827/ffffff?text=Buyer"} alt="Profil buyer" />
            <label>
              Upload Foto Profil
              <input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) uploadAvatar(file); }} />
            </label>
          </div>
          <div className="checkout-grid">
            <label>Nama Lengkap<input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></label>
            <label>Username<input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
            <label>Email<input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" /></label>
            <label>Nomor HP<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="checkout-full">Alamat Lengkap<textarea value={form.address_line} onChange={e => setForm({ ...form, address_line: e.target.value })} rows={3} /></label>
            <label>Kecamatan<input value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} /></label>
            <label>Kota/Kabupaten<input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
            <label>Provinsi<input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} /></label>
            <label>Kode Pos<input value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} /></label>
          </div>
          <button className="btn-primary" type="submit">Simpan Profil</button>
        </form>
      )}

      {activeTab === "orders" && (
        <div className="buyer-orders-grid">
          <div className="metric-card"><span>Total Pesanan</span><strong>{orders.length}</strong></div>
          <div className="metric-card"><span>Total Belanja</span><strong>{formatCurrency(totalOrderValue)}</strong></div>
          <div className="table-wrap checkout-full">
            <table className="master-table orders-table">
              <thead><tr><th>No</th><th>Nomor Pesanan</th><th>Status</th><th>Pembayaran</th><th>Pengiriman</th><th>Total</th><th>Aksi</th></tr></thead>
              <tbody>
                {orders.map((order, index) => (
                  <tr key={order.id}>
                    <td>{index + 1}</td>
                    <td>{order.order_number}</td>
                    <td>{order.order_status}</td>
                    <td>{order.payment_status}</td>
                    <td>{order.shipping_status}</td>
                    <td>{formatCurrency(Number(order.grand_total || order.total_amount || 0))}</td>
                    <td><button onClick={() => { setSelectedOrder(order); setActiveTab("chat"); }}>Chat</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "chat" && (
        <div className="chat-layout">
          <aside>
            <h3>Pilih Pesanan</h3>
            {orders.map(order => (
              <button key={order.id} className={selectedOrder?.id === order.id ? "active" : ""} onClick={() => setSelectedOrder(order)}>{order.order_number}</button>
            ))}
          </aside>
          <section>
            <h3>Chat Pesanan {selectedOrder?.order_number || "-"}</h3>
            <div className="chat-box">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
                  <small>{msg.sender_role || "USER"} · {new Date(msg.created_at).toLocaleString("id-ID")}</small>
                  <span>{msg.message}</span>
                </div>
              ))}
              {messages.length === 0 && <div className="empty-state">Belum ada chat untuk pesanan ini.</div>}
            </div>
            <div className="chat-input-row">
              <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Tulis pesan ke seller..." />
              <button className="btn-primary" onClick={sendMessage} disabled={!selectedOrder}>Kirim</button>
            </div>
          </section>
        </div>
      )}

      {activeTab === "store" && (
        <div className="store-public-detail">
          <h2>{store?.store_name || "UrbaNoiD Official Store"}</h2>
          <p>{store?.description || "Profil toko belum diisi seller."}</p>
          <div className="store-info-grid">
            <span>WhatsApp: {store?.whatsapp || "-"}</span>
            <span>Email: {store?.email || "-"}</span>
            <span>Alamat: {[store?.address_line, store?.city, store?.province].filter(Boolean).join(", ") || "-"}</span>
          </div>
          <button className={followed ? "btn-secondary" : "btn-primary"} onClick={toggleFollow}>
            {followed ? "Berhenti Ikuti Toko" : "Ikuti Toko"}
          </button>
        </div>
      )}
    </section>
  );
}

export default BuyerProfilePage;
