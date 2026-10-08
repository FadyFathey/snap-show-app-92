-- Existing returns keep their original loss and zero collected shipping.
ALTER TABLE public.returns ADD COLUMN shipping_collected numeric NOT NULL DEFAULT 0
  CHECK (shipping_collected IN (0, 100));

CREATE FUNCTION public.mark_returned_collection(
  _order_id uuid, _return_date date, _reason text, _notes text,
  _shipping_loss numeric, _product_loss numeric, _restocked boolean,
  _shipping_collected numeric
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF _shipping_collected IS NULL OR _shipping_collected NOT IN (0,100)
    OR _shipping_loss IS NULL OR _shipping_loss < 0 OR _shipping_loss::text IN ('NaN','Infinity','-Infinity')
    OR _product_loss IS NULL OR _product_loss < 0 OR _product_loss::text IN ('NaN','Infinity','-Infinity')
    OR _return_date IS NULL OR _restocked IS NULL THEN
    RAISE EXCEPTION 'invalid return amounts';
  END IF;
  PERFORM 1 FROM orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF EXISTS (SELECT 1 FROM returns WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'already returned';
  END IF;
  INSERT INTO returns(order_id,return_date,reason,notes,shipping_loss,product_loss,restocked,shipping_collected)
  VALUES (_order_id,_return_date,_reason,_notes,_shipping_loss,
    CASE WHEN _restocked THEN 0 ELSE _product_loss END,_restocked,_shipping_collected);
  UPDATE orders SET status='returned' WHERE id=_order_id;
END $$;
REVOKE ALL ON FUNCTION public.mark_returned_collection(uuid,date,text,text,numeric,numeric,boolean,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_returned_collection(uuid,date,text,text,numeric,numeric,boolean,numeric) TO authenticated;
