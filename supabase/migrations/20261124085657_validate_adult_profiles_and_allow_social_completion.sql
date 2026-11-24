ALTER TABLE public.profiles DROP CONSTRAINT profiles_adult_only;
GRANT INSERT ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_profile_adult()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.birth_date IS NULL OR NEW.birth_date > (CURRENT_DATE - INTERVAL '18 years')::date THEN
    RAISE EXCEPTION 'É necessário ter 18 anos ou mais para criar um perfil.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_profile_adult_before_save
BEFORE INSERT OR UPDATE OF birth_date ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_adult();

CREATE POLICY profiles_insert_self ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supplied_birth_date date;
  supplied_name text;
  supplied_phone text;
  supplied_address text;
BEGIN
  supplied_birth_date := NULLIF(NEW.raw_user_meta_data ->> 'birth_date', '')::date;
  supplied_name := NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), '');
  supplied_phone := NULLIF(btrim(NEW.raw_user_meta_data ->> 'phone'), '');
  supplied_address := NULLIF(btrim(NEW.raw_user_meta_data ->> 'address'), '');

  IF supplied_birth_date IS NULL AND supplied_name IS NULL AND supplied_phone IS NULL AND supplied_address IS NULL THEN
    RETURN NEW;
  END IF;
  IF supplied_birth_date IS NULL OR supplied_birth_date > (CURRENT_DATE - INTERVAL '18 years')::date THEN
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

CREATE OR REPLACE FUNCTION public.place_bid(_listing_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  auction_row public.listings%ROWTYPE;
  minimum_amount numeric;
BEGIN
  IF current_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = current_user_id) THEN
    RAISE EXCEPTION 'Complete o seu perfil de maior de 18 anos antes de participar.';
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