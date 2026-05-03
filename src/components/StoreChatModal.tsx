import { useEffect, useRef, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { Profile, StoreChat, StoreChatMessage, StoreProfile } from "../types";

type Props = {
  open: boolean;
  session: Session | null;
  profile: Profile | null;
  store: StoreProfile | null;
  onClose: () => void;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("id-ID");
}

export function StoreChatModal({ open, session, profile, store, onClose }: Props) {
  const [chat, setChat] = useState<StoreChat | null>(null);
  const [messages, setMessages] = useState<StoreChatMessage[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function ensureChat() {
    if (!session?.user.id || !store?.id) return null;

    const { data: existing, error: selectError } = await supabase
      .from("store_chats")
      .select("*")
      .eq("store_id", store.id)
      .eq("buyer_id", session.user.id)
      .maybeSingle();

    if (selectError) {
      setNotice(selectError.message);
      return null;
    }

    if (existing) {
      setChat(existing as StoreChat);
      return existing as StoreChat;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("store_chats")
      .insert({
        store_id: store.id,
        buyer_id: session.user.id,
        subject: `Chat ${profile?.full_name || profile?.username || session.user.email || "Buyer"}`,
        status: "OPEN",
        last_message: null,
        last_message_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      setNotice(insertError.message);
      return null;
    }

    setChat(inserted as StoreChat);
    return inserted as StoreChat;
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
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  async function boot() {
    setNotice("");
    const activeChat = await ensureChat();
    if (activeChat?.id) await loadMessages(activeChat.id);
  }

  useEffect(() => {
    if (!open) return;
    if (!session) return;
    void boot();
  }, [open, session?.user.id, store?.id]);

  useEffect(() => {
    if (!open || !chat?.id) return;
    const timer = window.setInterval(() => loadMessages(chat.id), 5000);
    return () => window.clearInterval(timer);
  }, [open, chat?.id]);

  async function sendMessage() {
    if (!session?.user.id) {
      window.location.hash = "/buyer-register";
      onClose();
      return;
    }

    const body = text.trim();
    if (!body) return;

    let activeChat = chat;
    if (!activeChat) activeChat = await ensureChat();
    if (!activeChat?.id) return;

    const { error } = await supabase.from("store_chat_messages").insert({
      chat_id: activeChat.id,
      sender_id: session.user.id,
      sender_role: "BUYER",
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
    }).eq("id", activeChat.id);

    setText("");
    await loadMessages(activeChat.id);
  }

  if (!open) return null;

  if (!session) {
    return (
      <div className="modal-backdrop store-chat-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}>
        <div className="store-chat-modal store-chat-login" onMouseDown={event => event.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>×</button>
          <h2>Chat Toko</h2>
          <p>Silakan registrasi/login buyer terlebih dahulu untuk menggunakan live chat toko.</p>
          <button className="btn-primary" onClick={() => { onClose(); window.location.hash = "/buyer-register"; }}>
            Registrasi / Login Buyer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop store-chat-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="store-chat-modal" onMouseDown={event => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <div className="store-chat-head">
          <img src={store?.logo_url || "https://placehold.co/96x96/111827/ffffff?text=UO"} alt={store?.store_name || "Toko"} />
          <div>
            <h2>Chat Toko</h2>
            <p>{store?.store_name || "UrbaNoiD Official Store"}</p>
          </div>
        </div>

        {notice && <div className="error-box">{notice}</div>}

        <div className="store-chat-box">
          {messages.map(msg => (
            <div key={msg.id} className={`store-chat-bubble ${msg.sender_role === "BUYER" ? "buyer" : "seller"}`}>
              <small>{msg.sender_role || "USER"} · {formatDate(msg.created_at)}</small>
              <span>{msg.message}</span>
            </div>
          ))}
          {messages.length === 0 && <div className="empty-state">Belum ada pesan. Mulai chat dengan toko.</div>}
          <div ref={bottomRef} />
        </div>

        <div className="store-chat-input">
          <input value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void sendMessage(); }} placeholder="Tulis pesan untuk toko..." />
          <button className="btn-primary" onClick={sendMessage}>Kirim</button>
        </div>
      </div>
    </div>
  );
}
