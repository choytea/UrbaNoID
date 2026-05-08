export function formatCurrency(value: number) {
 return new Intl.NumberFormat("id-ID", {
 style: "currency",
 currency: "IDR",
 maximumFractionDigits: 0,
 }).format(value || 0);
}

export function safeArray<T>(value: T[] | null | undefined): T[] {
 return Array.isArray(value) ? value : [];
}
