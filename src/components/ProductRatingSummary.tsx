import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
 productId?: string | null;
 compact?: boolean;
 className?: string;
};

type SummaryRow = {
 product_id?: string | null;
 average_rating?: number | string | null;
 avg_rating?: number | string | null;
 rating_avg?: number | string | null;
 rating?: number | string | null;
 review_count?: number | string | null;
 total_reviews?: number | string | null;
 rating_count?: number | string | null;
 count?: number | string | null;
};

function numberValue(value: unknown) {
 const parsed = Number(value);
 return Number.isFinite(parsed) ? parsed : 0;
}

function starText(rating: number) {
 const full = String.fromCharCode(9733);
 const empty = String.fromCharCode(9734);
 const rounded = Math.max(0, Math.min(5, Math.round(rating)));
 return full.repeat(rounded) + empty.repeat(5 - rounded);
}

export function ProductRatingSummary({ productId, compact = false, className = "" }: Props) {
 const [summary, setSummary] = useState<SummaryRow | null>(null);

 useEffect(() => {
 let alive = true;

 async function loadSummary() {
 if (!productId) {
 setSummary(null);
 return;
 }

 const { data, error } = await supabase
 .from("v_product_review_summary")
 .select("*")
 .eq("product_id", productId)
 .maybeSingle();

 if (!alive) return;

 if (error) {
 console.warn("Product review summary load failed:", error.message);
 setSummary(null);
 return;
 }

 setSummary((data || null) as SummaryRow | null);
 }

 loadSummary();

 return () => {
 alive = false;
 };
 }, [productId]);

 const normalized = useMemo(() => {
 const avg = numberValue(
 summary?.average_rating ??
 summary?.avg_rating ??
 summary?.rating_avg ??
 summary?.rating
 );

 const count = Math.round(numberValue(
 summary?.review_count ??
 summary?.total_reviews ??
 summary?.rating_count ??
 summary?.count
 ));

 return { avg, count };
 }, [summary]);

 if (!productId || !summary || normalized.count <= 0) {
 return null;
 }

 return (
 <div className={`phase3b10a3-rating-summary ${compact ? "compact" : ""} ${className}`.trim()}>
 <span className="phase3b10a3-rating-stars" aria-label={`Rating ${normalized.avg.toFixed(1)} dari 5`}>
 {starText(normalized.avg)}
 </span>
 <strong>{normalized.avg.toFixed(1)}</strong>
 <small>{normalized.count} ulasan</small>
 </div>
 );
}

export default ProductRatingSummary;