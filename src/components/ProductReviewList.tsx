import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = {
  productId?: string | null;
  limit?: number;
  className?: string;
};

type ReviewRow = {
  id?: string | null;
  product_id?: string | null;
  rating?: number | string | null;
  comment?: string | null;
  review_text?: string | null;
  buyer_name?: string | null;
  full_name?: string | null;
  username?: string | null;
  created_at?: string | null;
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

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function ProductReviewList({ productId, limit = 6, className = "" }: Props) {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadReviews() {
      if (!productId) {
        setReviews([]);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from("v_product_reviews_public")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!alive) return;

      if (error) {
        console.warn("Product reviews load failed:", error.message);
        setReviews([]);
        setLoading(false);
        return;
      }

      setReviews((data || []) as ReviewRow[]);
      setLoading(false);
    }

    loadReviews();

    return () => {
      alive = false;
    };
  }, [productId, limit]);

  if (!productId) return null;

  return (
    <section className={`phase3b10a3-review-list ${className}`.trim()}>
      <div className="phase3b10a3-review-list-head">
        <h3>Ulasan Produk</h3>
        <small>{loading ? "Memuat..." : `${reviews.length} ulasan terbaru`}</small>
      </div>

      {!loading && reviews.length === 0 && (
        <div className="phase3b10a3-review-empty">
          Belum ada ulasan untuk produk ini.
        </div>
      )}

      {reviews.map((review, index) => {
        const rating = numberValue(review.rating);
        const comment = String(review.comment || review.review_text || "").trim();
        const buyerName = String(review.buyer_name || review.full_name || review.username || "Buyer").trim();

        return (
          <article className="phase3b10a3-review-item" key={review.id || `${productId}-${index}`}>
            <div className="phase3b10a3-review-item-head">
              <strong>{buyerName}</strong>
              <span>{formatDate(review.created_at)}</span>
            </div>
            <div className="phase3b10a3-rating-stars">{starText(rating)}</div>
            {comment && <p>{comment}</p>}
          </article>
        );
      })}
    </section>
  );
}

export default ProductReviewList;