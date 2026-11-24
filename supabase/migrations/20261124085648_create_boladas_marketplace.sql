CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (char_length(phone) BETWEEN 5 AND 30),
  address text NOT NULL CHECK (char_length(address) BETWEEN 2 AND 300),
  birth_date date NOT NULL,
  avatar_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_adult_only CHECK (birth_date <= (current_date - interval '18 years')::date)
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, phone, address, avatar_path) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_read_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  supplied_birth_date date;
  supplied_name text;
  supplied_phone text;
  supplied_address text;
BEGIN
  supplied_birth_date := (NEW.raw_user_meta_data ->> 'birth_date')::date;
  supplied_name := btrim(NEW.raw_user_meta_data ->> 'full_name');
  supplied_phone := btrim(NEW.raw_user_meta_data ->> 'phone');
  supplied_address := btrim(NEW.raw_user_meta_data ->> 'address');
  IF supplied_birth_date IS NULL OR supplied_birth_date > (current_date - interval '18 years')::date THEN
    RAISE EXCEPTION 'A inscrição está disponível apenas para maiores de 18 anos.';
  END IF;
  IF supplied_name IS NULL OR char_length(supplied_name) NOT BETWEEN 1 AND 100
     OR supplied_phone IS NULL OR char_length(supplied_phone) NOT BETWEEN 5 AND 30
     OR supplied_address IS NULL OR char_length(supplied_address) NOT BETWEEN 2 AND 300 THEN
    RAISE EXCEPTION 'Preencha corretamente os dados obrigatórios do perfil.';
  END IF;
  INSERT INTO public.profiles (id, display_name, phone, address, birth_date)
  VALUES (NEW.id, supplied_name, supplied_phone, supplied_address, supplied_birth_date);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 1200),
  category text NOT NULL CHECK (category IN ('Eletrónicos', 'Casa', 'Moda', 'Desporto', 'Veículos', 'Outros')),
  item_condition text NOT NULL CHECK (item_condition IN ('Como novo', 'Bom estado', 'Usado')),
  listing_type text NOT NULL CHECK (listing_type IN ('sale', 'auction')),
  price numeric(12,2) NOT NULL CHECK (price > 0),
  highest_bid numeric(12,2) CHECK (highest_bid IS NULL OR highest_bid >= price),
  auction_ends_at timestamptz,
  photo_path text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'withdrawn', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auction_requires_end_time CHECK ((listing_type = 'auction' AND auction_ends_at IS NOT NULL) OR (listing_type = 'sale' AND auction_ends_at IS NULL))
);
GRANT SELECT ON public.listings TO anon, authenticated;
GRANT INSERT (seller_id, title, description, category, item_condition, listing_type, price, auction_ends_at, photo_path) ON public.listings TO authenticated;
GRANT UPDATE (title, description, category, item_condition, price, auction_ends_at, photo_path) ON public.listings TO authenticated;
GRANT DELETE ON public.listings TO authenticated;
GRANT ALL ON public.listings TO service_role;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY listings_public_active ON public.listings FOR SELECT TO anon, authenticated USING (status = 'active');
CREATE POLICY listings_seller_read_own ON public.listings FOR SELECT TO authenticated USING (seller_id = auth.uid());
CREATE POLICY listings_authenticated_create ON public.listings FOR INSERT TO authenticated WITH CHECK (seller_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid()));
CREATE POLICY listings_seller_update_own ON public.listings FOR UPDATE TO authenticated USING (seller_id = auth.uid() AND status = 'active') WITH CHECK (seller_id = auth.uid() AND status = 'active');
CREATE POLICY listings_seller_delete_own ON public.listings FOR DELETE TO authenticated USING (seller_id = auth.uid());

CREATE TABLE public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  bidder_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bids TO authenticated;
GRANT ALL ON public.bids TO service_role;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY bidders_read_own_bids ON public.bids FOR SELECT TO authenticated USING (bidder_id = auth.uid());

CREATE OR REPLACE FUNCTION public.place_bid(_listing_id uuid, _amount numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_user_id uuid := auth.uid();
  auction_row public.listings%ROWTYPE;
  minimum_amount numeric;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Inicie sessão para participar do leilão.';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Indique um valor válido para o lance.';
  END IF;
  SELECT * INTO auction_row FROM public.listings WHERE id = _listing_id FOR UPDATE;
  IF NOT FOUND OR auction_row.status <> 'active' OR auction_row.listing_type <> 'auction'
     OR auction_row.auction_ends_at <= now() THEN
    RAISE EXCEPTION 'Este leilão já não está disponível.';
  END IF;
  IF auction_row.seller_id = current_user_id THEN
    RAISE EXCEPTION 'Não pode licitar no seu próprio anúncio.';
  END IF;
  minimum_amount := COALESCE(auction_row.highest_bid, auction_row.price);
  IF (auction_row.highest_bid IS NULL AND _amount < minimum_amount)
     OR (auction_row.highest_bid IS NOT NULL AND _amount <= minimum_amount) THEN
    RAISE EXCEPTION 'O lance deve cobrir o valor atual.';
  END IF;
  INSERT INTO public.bids (listing_id, bidder_id, amount) VALUES (_listing_id, current_user_id, _amount);
  UPDATE public.listings SET highest_bid = _amount WHERE id = _listing_id;
  RETURN _amount;
END;
$$;
REVOKE ALL ON FUNCTION public.place_bid(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_bid(uuid, numeric) TO authenticated;

CREATE POLICY marketplace_photos_read_active ON storage.objects FOR SELECT TO anon, authenticated USING (
  bucket_id = 'boladas-media' AND EXISTS (
    SELECT 1 FROM public.listings
    WHERE listings.photo_path = storage.objects.name AND listings.status = 'active'
  )
);
CREATE POLICY marketplace_photos_upload_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'boladas-media' AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY marketplace_photos_update_own ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'boladas-media' AND (storage.foldername(name))[1] = auth.uid()::text
) WITH CHECK (bucket_id = 'boladas-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY marketplace_photos_delete_own ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'boladas-media' AND (storage.foldername(name))[1] = auth.uid()::text
);