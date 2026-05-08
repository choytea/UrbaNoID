import { StoreProfile } from "../types";

type Props = {
 open: boolean;
 store: StoreProfile | null;
 followed: boolean;
 onClose: () => void;
 onFollowToggle: () => void;
 onOpenChat: () => void;
};

function line(...values: Array<string | null | undefined>) {
 return values.filter(Boolean).join(", ");
}

export function StoreInfoModal({ open, store, followed, onClose, onFollowToggle, onOpenChat }: Props) {
 if (!open) return null;

 return (
 <div className="modal-backdrop store-info-backdrop" onMouseDown={event => {
 if (event.target === event.currentTarget) onClose();
 }}>
 <div className="store-info-modal" onMouseDown={event => event.stopPropagation()}>
 <button className="modal-close" onClick={onClose}>×</button>

 {store?.banner_url && <img className="store-info-banner" src={store.banner_url} alt={store.store_name} />}

 <div className="store-info-main">
 <img className="store-info-logo" src={store?.logo_url || "https://placehold.co/160x160/111827/ffffff?text=UO"} alt={store?.store_name || "UrbaNoiD"} />
 <div>
 <h2>{store?.store_name || "UrbaNoiD Official Store"}</h2>
 <p>{store?.tagline || "Identity in Motion · Premium Urban Apparel"}</p>
 <small>{line(store?.district, store?.city, store?.province) || "Lokasi toko belum diisi"}</small>
 </div>
 </div>

 <div className="store-info-body">
 <h3>Deskripsi Toko</h3>
 <p>{store?.description || "Deskripsi toko belum diisi oleh admin toko."}</p>

 <h3>Kontak</h3>
 <div className="store-contact-grid">
 <span>WhatsApp: <strong>{store?.whatsapp || "-"}</strong></span>
 <span>Email: <strong>{store?.email || "-"}</strong></span>
 <span>Telepon: <strong>{store?.phone || "-"}</strong></span>
 <span>Alamat: <strong>{line(store?.address_line, store?.city, store?.province, store?.postal_code) || "-"}</strong></span>
 </div>
 </div>

 <div className="store-info-actions">
 <button className={followed ? "btn-secondary" : "btn-primary"} onClick={onFollowToggle}>
 {followed ? "Mengikuti Toko" : "Ikuti Toko"}
 </button>
 <button className="btn-primary" onClick={onOpenChat}>Chat Toko</button>
 <button onClick={onClose}>Tutup</button>
 </div>
 </div>
 </div>
 );
}
