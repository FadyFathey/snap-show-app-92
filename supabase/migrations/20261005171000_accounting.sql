CREATE TABLE public.app_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_members ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.app_members TO authenticated;
GRANT ALL ON public.app_members TO service_role;
CREATE POLICY "read own membership" ON public.app_members FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  order_number text NOT NULL,
  total_price numeric NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders select" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own orders insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own orders update" ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own orders delete" ON public.orders FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX orders_user_date ON public.orders(user_id, order_date);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own expenses select" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own expenses update" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own expenses delete" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX expenses_user_date ON public.expenses(user_id, expense_date);
ALTER TABLE public.orders
  ADD COLUMN status text NOT NULL DEFAULT 'new',
  ADD COLUMN shopify_order_id text UNIQUE,
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN cost_missing boolean NOT NULL DEFAULT false,
  ALTER COLUMN user_id DROP NOT NULL;
UPDATE public.orders SET status = 'shipped';
ALTER TABLE public.orders ADD CONSTRAINT orders_status_chk CHECK (status IN ('new','shipped','returned','cancelled'));

DROP POLICY IF EXISTS "own orders select" ON public.orders;
DROP POLICY IF EXISTS "own orders insert" ON public.orders;
DROP POLICY IF EXISTS "own orders update" ON public.orders;
DROP POLICY IF EXISTS "own orders delete" ON public.orders;
CREATE POLICY "team orders all" ON public.orders FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS "own expenses select" ON public.expenses;
DROP POLICY IF EXISTS "own expenses insert" ON public.expenses;
DROP POLICY IF EXISTS "own expenses update" ON public.expenses;
DROP POLICY IF EXISTS "own expenses delete" ON public.expenses;
CREATE POLICY "team expenses all" ON public.expenses FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid())));
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.expenses TO service_role;

CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL,
  notes text,
  shipping_loss numeric NOT NULL DEFAULT 0 CHECK (shipping_loss >= 0),
  product_loss numeric NOT NULL DEFAULT 0 CHECK (product_loss >= 0),
  restocked boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.returns TO authenticated;
GRANT ALL ON public.returns TO service_role;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team returns all" ON public.returns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.app_members WHERE user_id = (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.mark_returned(_order_id uuid, _return_date date, _reason text, _notes text, _shipping_loss numeric, _product_loss numeric, _restocked boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM returns WHERE order_id = _order_id) THEN RAISE EXCEPTION 'already returned'; END IF;
  INSERT INTO returns(order_id, return_date, reason, notes, shipping_loss, product_loss, restocked)
  VALUES (_order_id, _return_date, _reason, _notes, _shipping_loss, CASE WHEN _restocked THEN 0 ELSE _product_loss END, _restocked);
  UPDATE orders SET status = 'returned' WHERE id = _order_id;
END $$;

CREATE OR REPLACE FUNCTION public.undo_return(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  DELETE FROM returns WHERE order_id = _order_id;
  UPDATE orders SET status = 'shipped' WHERE id = _order_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_returned(uuid,date,text,text,numeric,numeric,boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.undo_return(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_returned(uuid,date,text,text,numeric,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_return(uuid) TO authenticated;
