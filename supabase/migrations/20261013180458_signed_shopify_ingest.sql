-- A machine-only capability for Shopify ingestion, not a general service-role key.
-- Its NOLOGIN owner remains subject to RLS and can only insert Shopify rows
-- or change their status. The signing secret is provisioned separately.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='shopify_ingestor') THEN
    CREATE ROLE shopify_ingestor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB
      NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
GRANT shopify_ingestor TO postgres;
CREATE SCHEMA IF NOT EXISTS shopify_private;
REVOKE ALL ON SCHEMA shopify_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS shopify_private.ingest_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  signing_secret text NOT NULL CHECK (length(signing_secret)>=64)
);
ALTER TABLE shopify_private.ingest_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shopify_private.ingest_config FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA shopify_private, public, extensions TO shopify_ingestor;
GRANT SELECT ON shopify_private.ingest_config TO shopify_ingestor;
CREATE POLICY "ingestor reads signing key" ON shopify_private.ingest_config
  FOR SELECT TO shopify_ingestor USING (true);
GRANT SELECT(id,shopify_order_id,source,user_id,status) ON public.orders TO shopify_ingestor;
GRANT INSERT(order_date,order_number,total_price,cost,cost_missing,status,shopify_order_id,source,user_id)
  ON public.orders TO shopify_ingestor;
GRANT UPDATE(status) ON public.orders TO shopify_ingestor;
CREATE POLICY "ingestor selects Shopify rows" ON public.orders FOR SELECT TO shopify_ingestor
  USING (source='shopify' AND user_id IS NULL);
CREATE POLICY "ingestor inserts Shopify rows" ON public.orders FOR INSERT TO shopify_ingestor
  WITH CHECK (source='shopify' AND user_id IS NULL);
CREATE POLICY "ingestor cancels Shopify rows" ON public.orders FOR UPDATE TO shopify_ingestor
  USING (source='shopify' AND user_id IS NULL)
  WITH CHECK (source='shopify' AND user_id IS NULL AND status='cancelled');

CREATE FUNCTION shopify_private.ingest_order(_payload text,_signature text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  secret text; envelope jsonb; action text; item jsonb; amount numeric; item_cost numeric;
  changed integer; issued_at bigint;
BEGIN
  -- This is a signed non-user machine request, never a logged-in browser RPC.
  IF nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub','') IS NOT NULL
    OR _payload IS NULL OR octet_length(_payload)>16384
    OR _signature IS NULL OR _signature !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid ingestion signature' USING ERRCODE='28000';
  END IF;
  SELECT signing_secret INTO secret FROM shopify_private.ingest_config WHERE singleton;
  IF secret IS NULL OR extensions.hmac(convert_to(_payload,'UTF8'),convert_to(secret,'UTF8'),'sha256')
    <> decode(_signature,'hex') THEN
    RAISE EXCEPTION 'invalid ingestion signature' USING ERRCODE='28000';
  END IF;
  envelope:=_payload::jsonb;
  issued_at:=(envelope->>'issued_at')::bigint;
  IF issued_at IS NULL OR abs(extract(epoch FROM clock_timestamp())-issued_at)>300 THEN
    RAISE EXCEPTION 'expired ingestion request' USING ERRCODE='28000';
  END IF;
  action:=envelope->>'action';
  IF action='check' THEN RETURN 'ok'; END IF;
  IF action IS NULL OR action NOT IN ('create','cancel') THEN RAISE EXCEPTION 'unsupported ingestion action'; END IF;
  item:=envelope->'order';
  IF item->>'shopify_order_id' IS NULL OR item->>'shopify_order_id' !~ '^[0-9]{1,30}$' THEN
    RAISE EXCEPTION 'invalid Shopify order id';
  END IF;
  IF action='cancel' THEN
    UPDATE public.orders SET status='cancelled'
      WHERE shopify_order_id=item->>'shopify_order_id' AND source='shopify' AND user_id IS NULL;
    RETURN 'ok';
  END IF;
  amount:=(item->>'total_price')::numeric; item_cost:=(item->>'cost')::numeric;
  IF amount IS NULL OR item_cost IS NULL OR amount<0 OR item_cost<0
    OR amount::text IN ('NaN','Infinity','-Infinity') OR item_cost::text IN ('NaN','Infinity','-Infinity')
    OR item->>'order_date' IS NULL OR item->>'order_number' IS NULL
    OR length(item->>'order_number') NOT BETWEEN 1 AND 100 OR item->>'cost_missing' IS NULL THEN
    RAISE EXCEPTION 'invalid ingestion order';
  END IF;
  INSERT INTO public.orders(order_date,order_number,total_price,cost,cost_missing,status,shopify_order_id,source,user_id)
  VALUES ((item->>'order_date')::date,item->>'order_number',amount,item_cost,
    (item->>'cost_missing')::boolean,'new',item->>'shopify_order_id','shopify',NULL)
  ON CONFLICT(shopify_order_id) DO NOTHING;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN CASE WHEN changed=0 THEN 'duplicate ignored' ELSE 'ok' END;
END $$;
GRANT CREATE ON SCHEMA shopify_private TO shopify_ingestor;
ALTER FUNCTION shopify_private.ingest_order(text,text) OWNER TO shopify_ingestor;
REVOKE CREATE ON SCHEMA shopify_private FROM shopify_ingestor;
REVOKE ALL ON FUNCTION shopify_private.ingest_order(text,text) FROM PUBLIC, authenticated;
GRANT USAGE ON SCHEMA shopify_private TO anon;
GRANT EXECUTE ON FUNCTION shopify_private.ingest_order(text,text) TO anon;
-- Public entry point has no elevated privileges; validation lives in the private schema.
CREATE FUNCTION public.ingest_shopify_order(_payload text,_signature text)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT shopify_private.ingest_order(_payload,_signature);
$$;
REVOKE ALL ON FUNCTION public.ingest_shopify_order(text,text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_shopify_order(text,text) TO anon;
NOTIFY pgrst,'reload schema';
