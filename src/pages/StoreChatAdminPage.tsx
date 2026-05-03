import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Profile, StoreChat, StoreChatMessage } from "../types";

type ProfileMap = Record<string, Profile>;
type UnreadMap = Record<string, number>;
type ChatFilter = "ALL" | "UNREAD" | "OPEN" | "CLOSED";

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
}

function getInitialFilter(): ChatFilter {
  const saved = localStorage.getItem("urbanoid_store_chat_filter");
  return saved === "UNREAD" || saved === "OPEN" || saved === "CLOSED" ? saved : "ALL";
}

export function StoreChatAdminPage() {
  const [chats, setChats] = useState<StoreChat[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [unreadByChat, setUnreadByChat] = useState<UnreadMap>({});
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<StoreChat | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ChatFilter>(getInitialFilter);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUnreadMap() {
    const { data } = await supabase
      .from("store_chat_messages")
      .select("id, chat_id")
      .eq("sender_role", "BUYER")
      .eq("is_read", false);

    const map: UnreadMap = {};
    (data || []).forEach((row: any) => {
      map[row.chat_id] = (map[row.chat_id] || 0) + 1;
    });
    setUnreadByChat(map);
  }

  async function loadChats() {
    setLoading(true);
    setNotice("");

    const { data, error } = await supabase
      .from("store_chats")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (error) {
      setNotice(error.message);
      setLoading(false);
      return;
    }

    const rows = (data || []) as StoreChat[];
    setChats(rows);
    if (rows.length && !selectedChat) setSelectedChat(rows[0]);

    const buyerIds = Array.from(new Set(rows.map(row => row.buyer_id).filter(Boolean)));
    if (buyerIds.length) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("*")
        .in("id", buyerIds);

      const map: ProfileMap = {};
      (profileRows || []).forEach(row => {
        map[(row as Profile).id] = row as Profile;
      });
      setProfiles(map);
    }

    await loadUnreadMap();
    setLoading(false);
  }

  async function markSelectedRead(chatId: string) {
    await supabase.rpc("mark_store_chat_read_for_seller", { p_chat_id: chatId });
    window.dispatchEvent(new CustomEvent("urbanoid-chat-badge-refresh"));
    await loadUnreadMap();
  }

  async function loadMessages(chatId: string) {
    const { data, error } = await supabase
      .from("store_chat_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      setNotice(error.message);
      return;
    }

    setMessages((data || []) as StoreChatMessage[]);
    await markSelectedRead(chatId);
  }

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    function onFilter(event: Event) {
      const detail = (event as CustomEvent<ChatFilter>).detail || "ALL";
      setStatusFilter(detail);
    }

    window.addEventListener("urbanoid-store-chat-filter", onFilter as EventListener);
    return () => window.removeEventListener("urbanoid-store-chat-filter", onFilter as EventListener);
  }, []);

  useEffect(() => {
    localStorage.setItem("urbanoid_store_chat_filter", statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    if (selectedChat?.id) void loadMessages(selectedChat.id);
  }, [selectedChat?.id]);

  useEffect(() => {
    if (!selectedChat?.id) return;
    const timer = window.setInterval(() => {
      loadMessages(selectedChat.id);
      loadChats();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [selectedChat?.id]);

  async function sendMessage() {
    const body = newMessage.trim();
    if (!selectedChat || !body) return;

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("store_chat_messages").insert({
      chat_id: selectedChat.id,
      sender_id: userData.user?.id || null,
      sender_role: "SELLER",
      message: body,
    });

    if (error) {
      setNotice(error.message);
      return;
    }

    await supabase.from("store_chats").update({
      last_message: body,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", selectedChat.id);

    setNewMessage("");
    await loadMessages(selectedChat.id);
    await loadChats();
    window.dispatchEvent(new CustomEvent("urbanoid-chat-badge-refresh"));
  }

  async function closeChat() {
    if (!selectedChat) return;
    await supabase.from("store_chats").update({ status: "CLOSED", updated_at: new Date().toISOString() }).eq("id", selectedChat.id);
    await loadChats();
    setSelectedChat(prev => prev ? { ...prev, status: "CLOSED" } : prev);
  }

  async function reopenChat() {
    if (!selectedChat) return;
    await supabase.from("store_chats").update({ status: "OPEN", updated_at: new Date().toISOString() }).eq("id", selectedChat.id);
    await loadChats();
    setSelectedChat(prev => prev ? { ...prev, status: "OPEN" } : prev);
  }

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();

    return chats.filter(chat => {
      const buyer = profiles[chat.buyer_id];
      const unread = Number(unreadByChat[chat.id] || 0);
      const matchFilter =
        statusFilter === "ALL" ||
        (statusFilter === "UNREAD" && unread > 0) ||
        (statusFilter === "OPEN" && chat.status !== "CLOSED") ||
        (statusFilter === "CLOSED" && chat.status === "CLOSED");

      if (!matchFilter) return false;
      if (!q) return true;

      return [chat.subject, chat.status, chat.last_message, chat.product_name, chat.sku_variant, buyer?.full_name, buyer?.username, buyer?.email, buyer?.phone]
        .some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [chats, profiles, query, statusFilter, unreadByChat]);

  const selectedBuyer = selectedChat ? profiles[selectedChat.buyer_id] : null;
  const totalUnread = Object.values(unreadByChat).reduce((sum, value) => sum + value, 0);

  return (
    <section className="panel store-chat-admin-panel phase-3b-4-store-chat-admin">
      <div className="section-title compact-section-title">
        <div>
          <h1>Chat Toko</h1>
          <p>Live chat langsung antara buyer dan admin/seller toko.</p>
        </div>
        <button onClick={loadChats}>Refresh</button>
      </div>

      <div className="orders-toolbar chat-admin-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari buyer, email, status, produk, isi pesan..." />
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as ChatFilter)}>
          <option value="ALL">Semua Chat</option>
          <option value="UNREAD">Belum Dibaca ({totalUnread})</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {notice && <div className="error-box">{notice}</div>}
      {loading && <p>Memuat chat toko...</p>}

      <div className="orders-workspace store-chat-workspace compact-chat-workspace">
        <div className="orders-list chat-accordion-list">
          {filteredChats.map(chat => {
            const buyer = profiles[chat.buyer_id];
            const unread = Number(unreadByChat[chat.id] || 0);
            const isActive = selectedChat?.id === chat.id;
            return (
              <button key={chat.id} className={isActive ? "order-list-card chat-list-card active" : "order-list-card chat-list-card"} onClick={() => setSelectedChat(chat)}>
                <div className="chat-list-headline">
                  <strong>{buyer?.full_name || buyer?.username || buyer?.email || "Buyer"}</strong>
                  {unread > 0 && <span className="nav-badge inline-chat-badge">{unread > 99 ? "99+" : unread}</span>}
                </div>
                <span>{chat.subject || "Chat Toko"}</span>
                {chat.product_name && <small>Produk: {chat.product_name}</small>}
                {chat.sku_variant && <small>SKU: {chat.sku_variant}</small>}
                <em>{chat.status || "OPEN"}</em>
                <small>{chat.last_message || "Belum ada pesan"}</small>
                <small>{formatDate(chat.last_message_at || chat.created_at)}</small>
              </button>
            );
          })}
          {!loading && filteredChats.length === 0 && <div className="empty-state">Belum ada chat toko pada filter ini.</div>}
        </div>

        <div className="order-detail-pane store-chat-detail-pane">
          {!selectedChat ? (
            <div className="empty-state">Pilih chat untuk melihat percakapan.</div>
          ) : (
            <>
              <div className="order-detail-head compact-order-detail-head">
                <div>
                  <h2>{selectedBuyer?.full_name || selectedBuyer?.username || selectedBuyer?.email || "Buyer"}</h2>
                  <p>{selectedBuyer?.email || "-"} · {selectedBuyer?.phone || "-"}</p>
                  {selectedChat.product_name && (
                    <div className="chat-product-context compact-chat-product-context">
                      <strong>{selectedChat.product_name}</strong>
                      <span>{[selectedChat.color_name, selectedChat.size_name, selectedChat.pattern_type].filter(Boolean).join(" / ") || "-"}</span>
                      <small>{selectedChat.sku_variant || selectedChat.sku_product || "-"}</small>
                    </div>
                  )}
                </div>
                <div className="button-row">
                  {selectedChat.status === "CLOSED" ? (
                    <button onClick={reopenChat}>Buka Lagi</button>
                  ) : (
                    <button onClick={closeChat}>Tutup Chat</button>
                  )}
                </div>
              </div>

              <div className="store-chat-box admin-store-chat-box compact-admin-store-chat-box">
                {messages.map(msg => (
                  <div key={msg.id} className={`store-chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
                    <small>{msg.sender_role || "USER"} · {formatDate(msg.created_at)}</small>
                    <span>{msg.message}</span>
                  </div>
                ))}
                {messages.length === 0 && <div className="empty-state">Belum ada pesan.</div>}
              </div>

              <div className="store-chat-input compact-store-chat-input">
                <input value={newMessage} onChange={event => setNewMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void sendMessage(); }} placeholder="Tulis balasan ke buyer..." />
                <button className="btn-primary" onClick={sendMessage}>Kirim</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default StoreChatAdminPage;
