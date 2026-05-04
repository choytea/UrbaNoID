-- ============================================================
-- DIAGNOSTIC PHASE 3B.7
-- Cek apakah struktur payment confirmation sudah aktif.
-- ============================================================

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name in (
    'proof_url',
    'proof_storage_path',
    'proof_uploaded_at',
    'payer_name',
    'payer_bank',
    'transfer_amount',
    'transfer_date',
    'buyer_note',
    'seller_note',
    'rejection_reason',
    'reviewed_by',
    'reviewed_at'
  )
order by column_name;

select
  routine_name
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'buyer_confirm_payment',
    'seller_review_payment',
    'buyer_confirm_order_received'
  )
order by routine_name;

select
  id,
  name,
  public
from storage.buckets
where id = 'payment-proofs';