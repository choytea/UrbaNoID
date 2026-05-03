import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Profile, StoreChat, StoreChatMessage } from "../types";

type ProfileMap = Record<string, Profile>;

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("id-ID");
}

export function StoreChatAdminPage() {
  const [chats, setChats] = useState<StoreChat[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<StoreChat | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

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

    setLoading(false);
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
  }

  useEffect(() => {
    void loadChats();
  }, []);

  useEffect(() => {
    if (selectedChat?.id) void loadMessages(selectedChat.id);
  }, [selectedChat?.id]);

  useEffect(() => {
    if (!selectedChat?.id) return;
    const timer = window.setInterval(() => loadMessages(selectedChat.id), 5000);
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
    if (!q) return chats;
    return chats.filter(chat => {
      const buyer = profiles[chat.buyer_id];
      return [chat.subject, chat.status, chat.last_message, buyer?.full_name, buyer?.username, buyer?.email, buyer?.phone]
        .some(value => String(value || "").toLowerCase().includes(q));
    });
  }, [chats, profiles, query]);

  const selectedBuyer = selectedChat ? profiles[selectedChat.buyer_id] : null;

  return (
    <section className="panel store-chat-admin-panel">
      <div className="section-title">
        <div>
          <h1>Chat Toko</h1>
          <p>Live chat langsung antara buyer dan admin/seller toko.</p>
        </div>
        <button onClick={loadChats}>Refresh</button>
      </div>

      <div className="orders-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari buyer, email, status, isi pesan..." />
        <select value="ALL" disabled><option>Semua Chat</option></select>
      </div>

      {notice && <div className="error-box">{notice}</div>}
      {loading && <p>Memuat chat toko...</p>}

      <div className="orders-workspace store-chat-workspace">
        <div className="orders-list">
          {filteredChats.map(chat => {
            const buyer = profiles[chat.buyer_id];
            return (
              <button key={chat.id} className={selectedChat?.id === chat.id ? "order-list-card active" : "order-list-card"} onClick={() => setSelectedChat(chat)}>
                <strong>{buyer?.full_name || buyer?.username || buyer?.email || "Buyer"}</strong>
                <span>{chat.subject || "Chat Toko"}</span>
                <em>{chat.status || "OPEN"}</em>
                <small>{chat.last_message || "Belum ada pesan"}</small>
                <small>{formatDate(chat.last_message_at || chat.created_at)}</small>
              </button>
            );
          })}
          {!loading && filteredChats.length === 0 && <div className="empty-state">Belum ada chat toko.</div>}
        </div>

        <div className="order-detail-pane store-chat-detail-pane">
          {!selectedChat ? (
            <div className="empty-state">Pilih chat untuk melihat percakapan.</div>
          ) : (
            <>
              <div className="order-detail-head">
                <div>
                  <h2>{selectedBuyer?.full_name || selectedBuyer?.username || selectedBuyer?.email || "Buyer"}</h2>
                  <p>{selectedBuyer?.email || "-"} · {selectedBuyer?.phone || "-"}</p>
                </div>
                <div className="button-row">
                  {selectedChat.status === "CLOSED" ? (
                    <button onClick={reopenChat}>Buka Lagi</button>
                  ) : (
                    <button onClick={closeChat}>Tutup Chat</button>
                  )}
                </div>
              </div>

              <div className="store-chat-box admin-store-chat-box">
                {messages.map(msg => (
                  <div key={msg.id} className={`store-chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
                    <small>{msg.sender_role || "USER"} · {formatDate(msg.created_at)}</small>
                    <span>{msg.message}</span>
                  </div>
                ))}
                {messages.length === 0 && <div className="empty-state">Belum ada pesan.</div>}
              </div>

              <div className="store-chat-input">
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
