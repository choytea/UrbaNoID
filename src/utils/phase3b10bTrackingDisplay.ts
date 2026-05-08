export function toText3B10B(value: unknown): string {
 if (value === null || value === undefined) return "";

 if (typeof value === "string") return value.trim();

 try {
 return JSON.stringify(value);
 } catch {
 return String(value).trim();
 }
}

function tryParseJson3B10B(text: string): unknown {
 const raw = text.trim();

 if (!raw) return raw;

 if (!raw.startsWith("{") && !raw.startsWith("[")) return raw;

 try {
 return JSON.parse(raw);
 } catch {
 return raw;
 }
}

function collectMessageText3B10B(value: unknown, depth = 0, output: string[] = []): string[] {
 if (depth > 5 || value === null || value === undefined) return output;

 if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
 const text = String(value).trim();
 if (text) output.push(text);
 return output;
 }

 if (Array.isArray(value)) {
 for (const item of value) collectMessageText3B10B(item, depth + 1, output);
 return output;
 }

 if (typeof value === "object") {
 const record = value as Record<string, unknown>;

 const priorityKeys = [
 "message",
 "error",
 "detail",
 "details",
 "technical_message",
 "biteship_error",
 "tracking_error",
 "booking_status",
 "tracking_status",
 "status",
 ];

 for (const key of priorityKeys) {
 if (key in record) collectMessageText3B10B(record[key], depth + 1, output);
 }

 for (const key of Object.keys(record)) {
 if (!priorityKeys.includes(key)) {
 collectMessageText3B10B(record[key], depth + 1, output);
 }
 }
 }

 return output;
}

export function isRawTrackingError3B10B(value: unknown): boolean {
 const text = toText3B10B(value);

 if (!text) return false;

 return [
 /\/v1\/trackings\//i,
 /\/v1\/orders\//i,
 /couriers\/biteship/i,
 /cannot process authorization/i,
 /failed to retrieve tracking number/i,
 /order not found/i,
 /edge function returned a non-2xx status code/i,
 /functions.*non-2xx/i,
 /biteship tracking failed/i,
 ].some((pattern) => pattern.test(text));
}

export function formatTrackingStatus3B10B(value: unknown): string {
 const raw = toText3B10B(value);

 if (!raw) return "";

 if (/^biteship tracking failed$/i.test(raw)) {
 return "Tracking belum berhasil diperbarui";
 }

 if (/^biteship tracking success$/i.test(raw)) {
 return "Tracking berhasil diperbarui";
 }

 if (/tracking failed/i.test(raw)) {
 return "Tracking belum berhasil diperbarui";
 }

 if (/tracking success|tracking ok/i.test(raw)) {
 return "Tracking berhasil diperbarui";
 }

 return raw;
}

export function formatTrackingError3B10B(value: unknown): string {
 const directText = toText3B10B(value);

 if (!directText) return "";

 const parsed = tryParseJson3B10B(directText);
 const messages = collectMessageText3B10B(parsed);
 const combined = messages.length ? messages.join(" | ") : directText;
 const raw = combined.replace(/\s+/g, " ").trim();
 const lower = raw.toLowerCase();

 if (!raw) return "";

 if (
 /\/v1\/trackings\//i.test(raw) ||
 /\/v1\/orders\//i.test(raw) ||
 /couriers\/biteship/i.test(raw) ||
 /cannot process authorization/i.test(raw) ||
 /failed to retrieve tracking number/i.test(raw) ||
 /order not found/i.test(raw)
 ) {
 return "Tracking belum dapat diperbarui. Untuk pesanan lama/manual, pastikan nomor resi dan kurir aktual sudah benar, misalnya JNE, TIKI, J&T, SiCepat, atau AnterAja. Jika resi baru dibuat, tracking biasanya aktif setelah kurir memproses paket.";
 }

 if (/edge function returned a non-2xx status code|functions.*non-2xx/i.test(raw)) {
 return "Tracking belum dapat diperbarui. Sistem pengiriman sedang menolak permintaan tracking atau data order belum lengkap.";
 }

 if (/waybill|resi|awb|tracking number/i.test(raw)) {
 if (/not found|failed|invalid|empty|kosong|tidak/i.test(raw)) {
 return "Nomor resi belum tersedia atau belum dikenali oleh sistem kurir.";
 }
 }

 if (/courier|kurir|company|code/i.test(raw)) {
 if (/not found|failed|invalid|empty|kosong|tidak|authorization/i.test(raw)) {
 return "Kode kurir belum valid untuk tracking. Lengkapi kurir aktual seperti JNE, TIKI, J&T, SiCepat, atau AnterAja.";
 }
 }

 if (/unauthorized|authorization|forbidden|api key|token/i.test(raw)) {
 return "Tracking belum dapat diproses karena akses Biteship atau kode kurir tidak valid.";
 }

 if (/timeout|network|fetch/i.test(lower)) {
 return "Koneksi ke layanan tracking sedang bermasalah. Coba beberapa saat lagi.";
 }

 if (/rate limit|too many/i.test(lower)) {
 return "Layanan tracking sedang membatasi permintaan. Coba beberapa saat lagi.";
 }

 if (/biteship tracking failed/i.test(raw)) {
 return "Tracking belum berhasil diperbarui.";
 }

 return raw;
}
