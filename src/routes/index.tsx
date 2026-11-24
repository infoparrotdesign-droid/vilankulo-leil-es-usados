import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownUp,
  ArrowRight,
  BadgeCheck,
  Bike,
  Check,
  ChevronDown,
  Gavel,
  Heart,
  ImagePlus,
  Laptop,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdultCutoff, isAdultDateOfBirth, sanitizeImageName } from "@/lib/marketplace-rules";
import { getActiveListingPhotoUrls } from "@/lib/listing-photos.functions";
import bicyclePhoto from "@/assets/used-bicycle.jpg";
import phonePhoto from "@/assets/used-phone.jpg";
import chairPhoto from "@/assets/wooden-chair.jpg";

const APP_NAME = "VilaShop";
const imageBucket = "boladas-media";
const listingCategories = ["Eletrónicos", "Casa", "Moda", "Desporto", "Veículos", "Outros"] as const;
const categories = ["Todos", ...listingCategories] as const;
type Category = (typeof categories)[number];
type ListingType = "sale" | "auction";
type ListingCategory = (typeof listingCategories)[number];
type ListingCondition = "Como novo" | "Bom estado" | "Usado";

type SellerListing = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

type Listing = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: ListingCategory;
  item_condition: ListingCondition;
  listing_type: ListingType;
  price: number;
  highest_bid: number | null;
  photo_path: string | null;
  imageUrl: string | null;
  isSample?: boolean;
};

type MarketplaceListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  item_condition: string;
  listing_type: string;
  price: number;
  highest_bid: number | null;
  photo_path: string | null;
};

function isListingCategory(value: string): value is ListingCategory {
  return listingCategories.some((category) => category === value);
}

function isListingCondition(value: string): value is ListingCondition {
  return ["Como novo", "Bom estado", "Usado"].some((condition) => condition === value);
}

function isListingType(value: string): value is ListingType {
  return value === "sale" || value === "auction";
}

function toMarketplaceListing(row: MarketplaceListingRow, imageUrl: string | null): Listing | null {
  if (!isListingCategory(row.category) || !isListingCondition(row.item_condition) || !isListingType(row.listing_type)) {
    return null;
  }

  return {
    id: row.id,
    seller_id: row.seller_id,
    title: row.title,
    description: row.description,
    category: row.category,
    item_condition: row.item_condition,
    listing_type: row.listing_type,
    price: row.price,
    highest_bid: row.highest_bid,
    photo_path: row.photo_path,
    imageUrl,
  };
}

const sampleItems: Listing[] = [
  {
    id: "sample-bicycle",
    seller_id: "",
    title: "Bicicleta urbana",
    description: "Uma bicicleta confortável e prática para os passeios e o dia a dia em Vilankulo.",
    category: "Desporto",
    item_condition: "Bom estado",
    listing_type: "sale",
    price: 8500,
    highest_bid: null,
    photo_path: null,
    imageUrl: bicyclePhoto,
    isSample: true,
  },
  {
    id: "sample-phone",
    seller_id: "",
    title: "Telemóvel Android",
    description: "Telemóvel usado, em bom estado de conservação, pronto a encontrar um novo dono.",
    category: "Eletrónicos",
    item_condition: "Bom estado",
    listing_type: "auction",
    price: 4500,
    highest_bid: null,
    photo_path: null,
    imageUrl: phonePhoto,
    isSample: true,
  },
  {
    id: "sample-chair",
    seller_id: "",
    title: "Cadeira artesanal",
    description: "Cadeira de madeira com assento entrançado, feita para durar.",
    category: "Casa",
    item_condition: "Como novo",
    listing_type: "sale",
    price: 3200,
    highest_bid: null,
    photo_path: null,
    imageUrl: chairPhoto,
    isSample: true,
  },
];

const signupSchema = z.object({
  name: z.string().trim().min(2, "Escreva o seu nome.").max(100),
  email: z.string().trim().email("Indique um email válido.").max(255),
  phone: z.string().trim().min(5, "Indique um telefone válido.").max(30),
  address: z.string().trim().min(2, "Indique a sua morada.").max(300),
  birthDate: z.string().refine((value) => isAdultDateOfBirth(value), "É necessário ter 18 anos ou mais."),
  password: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres.").max(72),
});

const listingSchema = z.object({
  title: z.string().trim().min(3, "O título precisa de pelo menos 3 letras.").max(100),
  description: z.string().trim().min(10, "Conte um pouco mais sobre o artigo.").max(1200),
  category: z.enum(["Eletrónicos", "Casa", "Moda", "Desporto", "Veículos", "Outros"]),
  itemCondition: z.enum(["Como novo", "Bom estado", "Usado"]),
  listingType: z.enum(["sale", "auction"]),
  price: z.number().positive("Indique um preço válido."),
  photo: z.instanceof(File).refine((file) => Boolean(sanitizeImageName(file.name)), "Escolha uma foto JPG, PNG ou WebP."),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VilaShop — comunidade de compra e venda em Moçambique" },
      { name: "description", content: "Descubra artigos usados à venda e leilões em Vilankulo. Publique, encontre e negocie artigos entre pessoas da comunidade." },
      { property: "og:title", content: "VilaShop — comunidade de compra e venda em Moçambique" },
      { property: "og:description", content: "O mercado local de artigos usados, com compra, venda e leilões em Vilankulo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Serif+Display&display=swap" },
    ],
  }),
  component: Marketplace,
});

function Marketplace() {
  const router = useRouter();
  const getPhotoUrls = useServerFn(getActiveListingPhotoUrls);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [liveListings, setLiveListings] = useState<Listing[]>([]);
  const [myListings, setMyListings] = useState<SellerListing[]>([]);
  const [showMyListings, setShowMyListings] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("Todos");
  const [activeType, setActiveType] = useState<"all" | ListingType>("all");
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "price">("recent");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;

    async function loadSession(user: User | null) {
      if (!current) return;
      setSessionUser(user);
      if (!user) {
        setProfileReady(false);
        return;
      }
      const { data, error } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (!current) return;
      if (error) {
        toast.error("Não foi possível abrir o seu perfil.");
        setProfileReady(false);
      } else if (data) {
        setProfileReady(true);
      } else {
        setProfileReady(false);
        setShowRegister(true);
        toast.info("Complete os seus dados para utilizar o VilaShop.");
      }
    }

    void supabase.auth.getUser().then(({ data }) => loadSession(data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void loadSession(session?.user ?? null);
        router.invalidate();
      }
    });
    return () => {
      current = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    let current = true;
    void (async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, seller_id, title, description, category, item_condition, listing_type, price, highest_bid, photo_path, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(48);

      if (!current) return;
      if (error) {
        console.error("Could not load public listings", error);
        setLiveListings([]);
        return;
      }
      const rows = data ?? [];
      const photoListingIds = rows.flatMap((row) => row.photo_path ? [row.id] : []);
      const photos = photoListingIds.length
        ? await getPhotoUrls({ data: { listingIds: photoListingIds } })
        : [];
      if (!current) return;
      const signedUrls = new Map(photos.map((photo) => [photo.listingId, photo.signedUrl]));
      setLiveListings(rows.flatMap((row) => {
        const listing = toMarketplaceListing(row, signedUrls.get(row.id) ?? null);
        return listing ? [listing] : [];
      }));
    })();
    return () => {
      current = false;
    };
  }, []);

  const sellerId = sessionUser?.id;
  useEffect(() => {
    let current = true;
    if (!sellerId) {
      setMyListings([]);
      return;
    }
    void supabase
      .from("listings")
      .select("id, title, status, created_at")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!current) return;
        if (error) {
          console.error("Could not load seller listings", error);
          return;
        }
        setMyListings(data ?? []);
      });
    return () => { current = false; };
  }, [sellerId]);

  const visibleListings = useMemo(() => {
    const items = liveListings.length > 0 ? liveListings : sampleItems;
    return items
      .filter((item) => activeCategory === "Todos" || item.category === activeCategory)
      .filter((item) => activeType === "all" || item.listing_type === activeType)
      .filter((item) => !query || `${item.title} ${item.description} ${item.category}`.toLocaleLowerCase("pt-MZ").includes(query.toLocaleLowerCase("pt-MZ")))
      .sort((a, b) => sortBy === "price" ? a.price - b.price : 0);
  }, [activeCategory, activeType, liveListings, query, sortBy]);

  function openCreateListing() {
    if (!sessionUser || !profileReady) {
      setShowRegister(true);
      toast.info("Crie uma conta para publicar o seu artigo.");
      return;
    }
    setShowCreate(true);
  }

  async function submitSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      birthDate: formData.get("birthDate"),
      password: formData.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados indicados.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: parsed.data.name,
          phone: parsed.data.phone,
          address: parsed.data.address,
          birth_date: parsed.data.birthDate,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("18") ? "Só é possível criar uma conta a partir dos 18 anos." : "Não foi possível criar a conta. Verifique o email e tente novamente.");
    } else if (data.session) {
      setShowRegister(false);
      toast.success("A sua conta está pronta.");
    } else {
      setShowRegister(false);
      setShowLogin(true);
      toast.success("Enviámos um link para confirmar o seu email. Depois, entre na sua conta.");
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const emailSchema = z.string().trim().email();
    const password = formData.get("password");
    const email = emailSchema.safeParse(formData.get("email"));
    if (!email.success || typeof password !== "string" || password.length === 0) {
      toast.error("Indique o seu email e a palavra-passe.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.data, password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar. Confirme o email e a palavra-passe.");
    } else {
      setShowLogin(false);
      toast.success("Bem-vindo de volta.");
    }
  }

  async function completeSocialProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionUser) return;
    const formData = new FormData(event.currentTarget);
    const name = z.string().trim().min(2).max(100).safeParse(formData.get("name"));
    const phone = z.string().trim().min(5).max(30).safeParse(formData.get("phone"));
    const address = z.string().trim().min(2).max(300).safeParse(formData.get("address"));
    const birthDate = z.string().refine((value) => isAdultDateOfBirth(value)).safeParse(formData.get("birthDate"));
    if (!name.success || !phone.success || !address.success || !birthDate.success) {
      toast.error("Preencha os seus dados e confirme que tem 18 anos ou mais.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("profiles").insert({
      id: sessionUser.id,
      display_name: name.data,
      phone: phone.data,
      address: address.data,
      birth_date: birthDate.data,
    });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível guardar os dados. Verifique a data de nascimento e tente novamente.");
      return;
    }
    setProfileReady(true);
    setShowRegister(false);
    toast.success("Perfil pronto. Bem-vindo ao VilaShop.");
  }

  async function signinWith(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) toast.error("Não foi possível abrir o acesso. Tente novamente mais tarde.");
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Não foi possível sair da conta.");
    else {
      setSessionUser(null);
      setProfileReady(false);
      toast.success("Saiu da sua conta.");
    }
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionUser) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const price = Number(data.get("price"));
    const photo = data.get("photo");
    const parsed = listingSchema.safeParse({
      title: data.get("title"),
      description: data.get("description"),
      category: data.get("category"),
      itemCondition: data.get("itemCondition"),
      listingType: data.get("listingType"),
      price,
      photo,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Verifique os dados do artigo.");
      return;
    }
    setBusy(true);
    const safeExtension = sanitizeImageName(parsed.data.photo.name);
    const filePath = `${sessionUser.id}/listings/${crypto.randomUUID()}.${safeExtension}`;
    const { error: uploadError } = await supabase.storage.from(imageBucket).upload(filePath, parsed.data.photo, {
      contentType: parsed.data.photo.type,
      upsert: false,
    });
    if (uploadError) {
      setBusy(false);
      toast.error("Não foi possível guardar a foto. Escolha outra imagem.");
      return;
    }

    const auctionEndsAt = parsed.data.listingType === "auction"
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data: submitted, error } = await supabase.from("listings").insert({
      seller_id: sessionUser.id,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      item_condition: parsed.data.itemCondition,
      listing_type: parsed.data.listingType,
      price: parsed.data.price,
      auction_ends_at: auctionEndsAt,
      photo_path: filePath,
    }).select("id, title, status, created_at").single();
    setBusy(false);
    if (error) {
      await supabase.storage.from(imageBucket).remove([filePath]);
      toast.error("Não foi possível publicar o artigo. Verifique os campos e tente novamente.");
      return;
    }
    setShowCreate(false);
    form.reset();
    if (submitted) setMyListings((current) => [submitted, ...current.filter((item) => item.id !== submitted.id)]);
    toast.success("Anúncio publicado com sucesso.");
    const { data: refreshed, error: refreshError } = await supabase
      .from("listings")
      .select("id, seller_id, title, description, category, item_condition, listing_type, price, highest_bid, photo_path")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(48);
    if (refreshError) return;
    const refreshedRows = refreshed ?? [];
    const photoListingIds = refreshedRows.flatMap((item) => item.photo_path ? [item.id] : []);
    const signedPhotos = photoListingIds.length
      ? await getPhotoUrls({ data: { listingIds: photoListingIds } })
      : [];
    const urlMap = new Map(signedPhotos.map((photo) => [photo.listingId, photo.signedUrl]));
    setLiveListings(refreshedRows.flatMap((item) => {
      const listing = toMarketplaceListing(item, urlMap.get(item.id) ?? null);
      return listing ? [listing] : [];
    }));
    setActiveCategory("Todos");
    setActiveType("all");
    setQuery("");
    document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" });
  }

  async function showSellerContact(listing: Listing) {
    if (!sessionUser || !profileReady) {
      setSelectedListing(null);
      setShowLogin(true);
      toast.info("Entre na sua conta para contactar o vendedor.");
      return;
    }
    if (listing.isSample) {
      toast.info("Este artigo serve apenas de exemplo. Os contactos aparecem nos anúncios publicados.");
      return;
    }
    const { data, error } = await supabase.rpc("get_seller_contact", { _listing_id: listing.id });
    if (error || !data?.[0]?.phone) toast.error("O contacto não está disponível para este artigo.");
    else window.location.href = `tel:${encodeURIComponent(data[0].phone)}`;
  }

  async function submitBid(event: FormEvent<HTMLFormElement>, listing: Listing) {
    event.preventDefault();
    if (!sessionUser || !profileReady) {
      setShowLogin(true);
      toast.info("Entre na sua conta para fazer um lance.");
      return;
    }
    if (listing.isSample) {
      toast.info("Este leilão serve apenas de exemplo.");
      return;
    }
    const amountInput = new FormData(event.currentTarget).get("amount");
    const amount = z.coerce.number().positive().safeParse(amountInput);
    if (!amount.success) {
      toast.error("Indique um lance válido.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("place_bid", { _listing_id: listing.id, _amount: amount.data });
    setBusy(false);
    if (error) toast.error(error.message.includes("cover") ? "O lance precisa ser superior ao valor atual." : "Não foi possível aceitar esse lance.");
    else {
      toast.success("O seu lance foi registado.");
      setSelectedListing(null);
      const { data: updated } = await supabase
        .from("listings")
        .select("id, seller_id, title, description, category, item_condition, listing_type, price, highest_bid, photo_path")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(48);
      if (updated) setLiveListings(updated.flatMap((item) => {
        const listing = toMarketplaceListing(item, liveListings.find((old) => old.id === item.id)?.imageUrl ?? null);
        return listing ? [listing] : [];
      }));
    }
  }

  const usesSamples = liveListings.length === 0;
  const currentBid = selectedListing?.highest_bid ?? selectedListing?.price ?? 0;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="market-topline"><MapPin size={15} aria-hidden="true" /> Uma comunidade de compra e venda feita em Moçambique</div>
      <header className="market-header">
        <div className="market-shell market-header-content">
          <a href="#inicio" className="market-logo" aria-label="VilaShop — início">
            <span className="market-logo-mark" aria-hidden="true"><ShoppingBag size={21} /></span>
            <span>VILASHOP<span className="market-logo-period">.</span></span>
          </a>
          <nav className="market-primary-nav" aria-label="Navegação principal">
            <a href="#artigos">Explorar</a>
            <button type="button" onClick={() => { setActiveType("auction"); document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" }); }}>Leilões</button>
            <a href="#comunidade">Comunidade</a>
          </nav>
          <div className="market-header-actions">
            {sessionUser && profileReady ? (
              <>
                <Button type="button" variant="ghost" className="market-account" onClick={() => setShowMyListings(true)}>Os meus anúncios</Button>
                {sessionUser.email?.toLowerCase() === "adminvilashop@gmail.com" && <Link to="/admin" className="market-account">Administração</Link>}
                <Button type="button" variant="ghost" className="market-account" onClick={() => void signOut()} aria-label="Sair da conta">
                  <UserRound size={17} /> <span>{sessionUser.user_metadata["full_name"]?.toString().split(" ")[0] || "A minha conta"}</span>
                </Button>
                <Button type="button" onClick={openCreateListing} className="market-list-button"><ImagePlus size={16} /> Anunciar</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" className="market-login-button" onClick={() => setShowLogin(true)}>Entrar</Button>
                <Button type="button" variant="outline" className="market-mobile-ad" onClick={openCreateListing}><ImagePlus size={17} /><span className="sr-only">Anunciar</span></Button>
                <Button type="button" onClick={() => setShowRegister(true)} className="market-register-button">Criar conta</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section id="inicio" className="market-intro">
        <div className="market-shell market-intro-inner">
          <div className="market-location-pill"><span className="market-status-dot" /> O mercado da nossa comunidade</div>
          <h1>Descobre. Conecta-te.<br className="market-mobile-break" /> Compra e <span>vende.</span></h1>
          <p>Um lugar para pessoas e lojas da nossa comunidade descobrirem oportunidades, partilharem artigos e fazerem bons negócios.</p>
          <div className="market-search-bar">
            <Search size={19} aria-hidden="true" />
            <Input
              aria-label="Pesquisar artigos"
              type="search"
              placeholder="O que procuras hoje?"
              value={query}
              onChange={(event) => { setQuery(event.target.value); document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" }); }}
              className="market-search-input"
            />
            <Button type="button" onClick={() => document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" })} className="market-search-submit"><span>Pesquisar</span><ArrowRight size={17} /></Button>
          </div>
          <div className="market-search-hints"><span>Sugestões:</span>{["Telemóvel", "Bicicleta", "Móveis"].map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuery(suggestion)}>{suggestion}</button>)}</div>
        </div>
      </section>

      <section className="market-benefit-strip" aria-label="Benefícios">
        <div className="market-shell market-benefits-grid">
          <div className="market-benefit"><span className="market-benefit-icon market-benefit-coral"><MapPin size={19} /></span><span><strong>Da nossa região</strong><small>Inhambane e arredores</small></span></div>
          <div className="market-benefit"><span className="market-benefit-icon market-benefit-mint"><ShieldCheck size={20} /></span><span><strong>Pessoas e lojas</strong><small>Particulares e empresas</small></span></div>
          <div className="market-benefit"><span className="market-benefit-icon market-benefit-blue"><Gavel size={19} /></span><span><strong>Várias oportunidades</strong><small>Venda directa e leilões</small></span></div>
        </div>
      </section>

      <section className="market-shell market-category-section" aria-labelledby="category-title">
        <div className="market-section-heading"><div><span className="market-eyebrow">Comece por descobrir</span><h2 id="category-title">O que procura hoje?</h2></div><button type="button" className="market-see-all" onClick={() => { setActiveCategory("Todos"); document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" }); }}>Ver todos <ArrowRight size={15} /></button></div>
        <div className="market-category-grid">
          {[
            { name: "Eletrónicos", caption: "Telemóveis, som e mais", icon: <Smartphone size={20} />, className: "market-category-coral" },
            { name: "Casa", caption: "Móveis e decoração", icon: <Package size={20} />, className: "market-category-sand" },
            { name: "Moda", caption: "Roupa e acessórios", icon: <Sparkles size={20} />, className: "market-category-mint" },
            { name: "Desporto", caption: "Movimento e aventura", icon: <Bike size={21} />, className: "market-category-blue" },
            { name: "Veículos", caption: "Bicicletas e motores", icon: <ArrowDownUp size={20} />, className: "market-category-violet" },
            { name: "Outros", caption: "Mais boas descobertas", icon: <Laptop size={20} />, className: "market-category-yellow" },
          ].map((category) => (
            <button type="button" key={category.name} className={`market-category-link ${activeCategory === category.name ? "is-active" : ""}`} onClick={() => { setActiveCategory(category.name as Category); document.getElementById("artigos")?.scrollIntoView({ behavior: "smooth" }); }}>
              <span className={`market-category-icon ${category.className}`}>{category.icon}</span>
              <span className="market-category-copy"><strong>{category.name}</strong><small>{category.caption}</small></span>
              <ArrowRight size={16} className="market-category-arrow" />
            </button>
          ))}
        </div>
      </section>

      <section id="artigos" className="market-shell market-listings-section">
        <div className="market-section-heading market-listings-heading">
          <div><span className="market-eyebrow"><span className="market-small-dot" /> À sua volta</span><h2>Novidades da comunidade</h2><p>Artigos publicados para encontrar novos donos em Inhambane.</p></div>
          <Button type="button" onClick={openCreateListing} className="market-outline-listing"><ImagePlus size={17} /> Publicar um artigo</Button>
        </div>
        <div className="market-filter-row">
          <div className="market-filter-group" aria-label="Tipo de anúncio">
            {[{ id: "all", label: "Todos" }, { id: "sale", label: "À venda" }, { id: "auction", label: "Leilões" }].map((filter) => <Button key={filter.id} type="button" variant={activeType === filter.id ? "default" : "ghost"} size="sm" className={`market-filter-pill ${activeType === filter.id ? "is-selected" : ""}`} onClick={() => setActiveType(filter.id as "all" | ListingType)}>{filter.id === "auction" && <Gavel size={14} />}{filter.label}</Button>)}
          </div>
          <label className="market-sort-label" htmlFor="sort-listings"><ArrowDownUp size={15} /><span>Ordenar:</span><select id="sort-listings" value={sortBy} onChange={(event) => setSortBy(event.target.value as "recent" | "price")} className="market-sort-select"><option value="recent">Recentes</option><option value="price">Menor preço</option></select><ChevronDown size={14} /></label>
        </div>
        <div className="market-category-chips" aria-label="Categorias">
          {categories.map((category) => <Button key={category} type="button" variant="ghost" size="sm" onClick={() => setActiveCategory(category)} className={`market-chip ${activeCategory === category ? "is-current" : ""}`}>{category}</Button>)}
        </div>
        {visibleListings.length > 0 ? (
          <div className="market-listing-grid">
            {visibleListings.map((listing) => <ListingCard key={listing.id} listing={listing} onOpen={() => setSelectedListing(listing)} />)}
          </div>
        ) : (
          <div className="market-empty-results"><span className="market-empty-icon"><Search size={23} /></span><h3>Não encontrámos esse artigo</h3><p>Experimente outra pesquisa ou escolha uma categoria diferente.</p><Button type="button" variant="outline" onClick={() => { setQuery(""); setActiveCategory("Todos"); setActiveType("all"); }}>Limpar filtros</Button></div>
        )}
        {usesSamples && <p className="market-demo-note"><Sparkles size={15} /> Exemplos de como podem aparecer os primeiros anúncios.</p>}
      </section>

      <section id="comunidade" className="market-community-section">
        <div className="market-shell">
          <div className="market-community-heading">
            <span className="market-eyebrow">Mais do que comprar e vender</span>
            <h2>O melhor do mercado é a comunidade.</h2>
            <p>O VilaShop aproxima pessoas, pequenos negócios e boas oportunidades, começando pela Província de Inhambane.</p>
          </div>
          <div className="market-community-grid">
            <article className="market-community-card"><span className="market-community-number">01</span><h3>Pessoas e lojas</h3><p>Descubra vendedores particulares e empresas da sua região.</p></article>
            <article className="market-community-card"><span className="market-community-number">02</span><h3>Oportunidades para todos</h3><p>Encontre artigos à venda e acompanhe leilões com propostas transparentes.</p></article>
            <article className="market-community-card"><span className="market-community-number">03</span><h3>Negócios com confiança</h3><p>Uma experiência construída com regras claras, apoio e responsabilidade.</p></article>
          </div>
        </div>
      </section>

      <section className="market-seller-band">
        <div className="market-shell market-seller-inner">
          <div className="market-seller-copy"><span className="market-seller-eyebrow">Tem algo para vender?</span><h2>Esse artigo merece<br /> um novo dono.</h2><p>Partilhe o que já não precisa e descubra quem procura exactamente isso.</p><Button type="button" onClick={openCreateListing} className="market-seller-cta">Anunciar um artigo <ArrowRight size={17} /></Button></div>
          <div className="market-seller-illustration" aria-hidden="true"><span className="market-seller-orbit market-seller-orbit-one" /><span className="market-seller-orbit market-seller-orbit-two" /><span className="market-seller-box"><Package size={64} strokeWidth={1.3} /></span><span className="market-seller-sticker"><Check size={20} /></span><span className="market-seller-stars"><Sparkles size={23} /></span></div>
        </div>
      </section>

      <footer className="market-footer">
        <div className="market-shell market-footer-main"><a href="#inicio" className="market-logo market-footer-logo"><span className="market-logo-mark" aria-hidden="true"><ShoppingBag size={19} /></span><span>VILASHOP<span className="market-logo-period">.</span></span></a><p>Descobre. Conecta-te. Compra e vende.</p><div className="market-footer-place"><MapPin size={15} /> Província de Inhambane, Moçambique</div></div>
        <div className="market-shell market-footer-bottom"><span>© {new Date().getFullYear()} VilaShop</span><span>Só para maiores de 18 anos</span><span className="market-adult-mark"><BadgeCheck size={14} /> Uma comunidade para maiores de 18 anos</span></div>
      </footer>

      <AuthDialogs
        currentUser={sessionUser}
        showLogin={showLogin}
        setShowLogin={setShowLogin}
        showRegister={showRegister}
        setShowRegister={setShowRegister}
        busy={busy}
        onSignup={submitSignup}
        onLogin={submitLogin}
        onCompleteProfile={completeSocialProfile}
        onSocial={signinWith}
        adultCutoff={getAdultCutoff()}
      />

      <Dialog open={showMyListings} onOpenChange={setShowMyListings}>
        <DialogContent className="market-dialog-content">
          <DialogHeader className="market-form-header">
            <span className="market-form-kicker">A sua actividade</span>
            <DialogTitle>Os meus anúncios</DialogTitle>
            <DialogDescription>Acompanhe aqui o estado dos seus anúncios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {myListings.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não tem anúncios.</p> : myListings.map((item) => (
              <div key={item.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.title}</strong>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{listingStatusLabel(item.status)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Publicado em {new Date(item.created_at).toLocaleString("pt-MZ")}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="market-dialog-content">
          <DialogHeader className="market-form-header"><span className="market-form-kicker">Venda ou leilão</span><DialogTitle>Publique um artigo</DialogTitle><DialogDescription>Partilhe algo em bom estado com a comunidade de Vilankulo.</DialogDescription></DialogHeader>
          <form className="market-form" onSubmit={(event) => void submitListing(event)}>
            <div className="market-form-grid">
              <FormField label="Nome do artigo" htmlFor="listing-title"><Input id="listing-title" name="title" placeholder="Ex.: Bicicleta urbana" required minLength={3} maxLength={100} /></FormField>
              <FormField label="Categoria" htmlFor="listing-category"><select id="listing-category" name="category" className="market-form-select" defaultValue="Eletrónicos"><option>Eletrónicos</option><option>Casa</option><option>Moda</option><option>Desporto</option><option>Veículos</option><option>Outros</option></select></FormField>
            </div>
            <FormField label="Descrição" htmlFor="listing-description"><textarea id="listing-description" name="description" className="market-textarea" placeholder="Estado, tamanho, detalhes importantes…" required minLength={10} maxLength={1200} rows={3} /></FormField>
            <div className="market-form-grid">
              <FormField label="Estado" htmlFor="listing-condition"><select id="listing-condition" name="itemCondition" className="market-form-select" defaultValue="Bom estado"><option>Como novo</option><option>Bom estado</option><option>Usado</option></select></FormField>
              <FormField label="Preço em meticais" htmlFor="listing-price"><Input id="listing-price" type="number" name="price" placeholder="Ex.: 5 000" required min="1" step="0.01" /></FormField>
            </div>
            <fieldset className="market-listing-type"><legend>Como quer vender?</legend><label className="market-radio-line"><input type="radio" name="listingType" value="sale" defaultChecked /><span><strong>Preço fixo</strong><small>Mostre o valor que pretende.</small></span></label><label className="market-radio-line"><input type="radio" name="listingType" value="auction" /><span><strong>Leilão</strong><small>Receba propostas durante 3 dias.</small></span><Gavel size={17} /></label></fieldset>
            <FormField label="Foto do artigo" htmlFor="listing-photo"><div className="market-upload-line"><ImagePlus size={18} /><span>Uma foto clara ajuda o artigo a destacar-se.</span></div><Input id="listing-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Escolher foto do artigo" /></FormField>
            <div className="market-private-note"><ShieldCheck size={16} /><span>Use fotos suas. O seu endereço e telefone não ficam visíveis no anúncio.</span></div>
            <Button type="submit" disabled={busy} className="market-form-submit">{busy ? "A publicar…" : "Publicar anúncio"}<ArrowRight size={17} /></Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedListing)} onOpenChange={(open) => { if (!open) setSelectedListing(null); }}>
        <DialogContent className="market-dialog-content market-product-dialog">
          {selectedListing && <>
            {selectedListing.imageUrl && <img src={selectedListing.imageUrl} alt={selectedListing.title} className="market-detail-image" width={816} height={816} />}
            <DialogHeader className="market-form-header"><div className="market-product-flags"><span className={`market-item-tag ${selectedListing.listing_type === "auction" ? "tag-auction" : "tag-sale"}`}>{selectedListing.listing_type === "auction" ? <><Gavel size={12} /> Leilão</> : "À venda"}</span>{selectedListing.isSample && <span className="market-sample-label">Exemplo</span>}</div><DialogTitle>{selectedListing.title}</DialogTitle><DialogDescription>{selectedListing.description}</DialogDescription></DialogHeader>
            <div className="market-detail-price"><span>{selectedListing.listing_type === "auction" ? "Valor actual" : "Preço"}</span><strong>{formatPrice(selectedListing.highest_bid ?? selectedListing.price)}</strong><small><MapPin size={13} /> Vilankulo</small></div>
            <div className="market-condition-row"><span>Estado</span><strong>{selectedListing.item_condition}</strong></div>
            {selectedListing.listing_type === "auction" ? (
              <form className="market-form market-bid-form" onSubmit={(event) => void submitBid(event, selectedListing)}><FormField label="A sua oferta (meticais)" htmlFor="bid-amount"><Input id="bid-amount" type="number" name="amount" min={selectedListing.highest_bid ? selectedListing.highest_bid + 1 : selectedListing.price} placeholder="Introduza o seu lance" required step="0.01" /></FormField><p>O seu lance deve superar {formatPrice(currentBid)}.</p><Button type="submit" disabled={busy} className="market-form-submit"><Gavel size={16} />{busy ? "A enviar…" : "Fazer um lance"}</Button></form>
            ) : <Button type="button" className="market-form-submit market-contact-button" onClick={() => void showSellerContact(selectedListing)}><ShoppingBag size={16} /> Contactar o vendedor</Button>}
          </>}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ListingCard({ listing, onOpen }: { listing: Listing; onOpen: () => void }) {
  return (
    <article className="market-listing-card">
      <button type="button" className="market-card-open" onClick={onOpen} aria-label={`Ver anúncio: ${listing.title}`}>
        <span className="market-card-photo-wrap">
          {listing.imageUrl ? <img src={listing.imageUrl} alt={listing.title} className="market-card-photo" loading="lazy" width={816} height={816} /> : <span className="market-missing-photo"><ImagePlus size={28} /></span>}
          <span className={`market-item-tag ${listing.listing_type === "auction" ? "tag-auction" : "tag-sale"}`}>{listing.listing_type === "auction" ? <><Gavel size={12} /> Leilão</> : "À venda"}</span>
          {listing.isSample && <span className="market-sample-label">Exemplo</span>}
          <span className="market-card-heart" aria-hidden="true"><Heart size={16} /></span>
        </span>
        <span className="market-card-copy"><span className="market-card-category">{listing.category}</span><span className="market-card-title">{listing.title}</span><span className="market-card-price">{formatPrice(listing.highest_bid ?? listing.price)}{listing.listing_type === "auction" && <small> lance inicial</small>}</span><span className="market-card-location"><MapPin size={13} /> Vilankulo <span>·</span> {listing.item_condition}</span></span>
      </button>
    </article>
  );
}

function AuthDialogs({
  currentUser,
  showLogin,
  setShowLogin,
  showRegister,
  setShowRegister,
  busy,
  onSignup,
  onLogin,
  onCompleteProfile,
  onSocial,
  adultCutoff,
}: {
  currentUser: User | null;
  showLogin: boolean;
  setShowLogin: (value: boolean) => void;
  showRegister: boolean;
  setShowRegister: (value: boolean) => void;
  busy: boolean;
  onSignup: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onCompleteProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSocial: (provider: "google" | "lovable") => void;
  adultCutoff: string;
}) {
  const needsProfile = Boolean(currentUser);
  return (
    <>
      <Dialog open={showLogin} onOpenChange={setShowLogin}>
        <DialogContent className="market-dialog-content">
          <DialogHeader className="market-form-header"><span className="market-form-kicker">Que bom ver-te</span><DialogTitle>Entre no VilaShop</DialogTitle><DialogDescription>A sua conta aproxima-o da comunidade de Vilankulo.</DialogDescription></DialogHeader>
          <form className="market-form" onSubmit={(event) => void onLogin(event)}>
            <FormField label="Email" htmlFor="login-email"><Input id="login-email" name="email" type="email" autoComplete="email" placeholder="nome@email.com" required maxLength={255} /></FormField>
            <FormField label="Palavra-passe" htmlFor="login-password"><Input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="A sua palavra-passe" required maxLength={72} /></FormField>
            <Button type="submit" disabled={busy} className="market-form-submit">{busy ? "A entrar…" : "Entrar"}<ArrowRight size={17} /></Button>
            <div className="market-auth-divider"><span>ou entre com</span></div>
            <div className="market-social-buttons"><Button type="button" variant="outline" className="market-social-button" onClick={() => onSocial("google")}><GoogleMark /> Continuar com Google</Button><Button type="button" variant="outline" className="market-social-button" onClick={() => onSocial("lovable")}><Sparkles size={16} /> Continuar com Lovable</Button></div>
            <p className="market-switch-auth">Ainda não tem conta? <button type="button" onClick={() => { setShowLogin(false); setShowRegister(true); }}>Criar conta</button></p>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegister} onOpenChange={(open) => { if (!needsProfile) setShowRegister(open); }}>
        <DialogContent className="market-dialog-content market-register-dialog">
          {needsProfile ? (
            <><DialogHeader className="market-form-header"><span className="market-form-kicker">Só falta um passo</span><DialogTitle>Complete o seu perfil</DialogTitle><DialogDescription>O VilaShop é uma comunidade para pessoas com 18 anos ou mais. Os seus dados ficam privados.</DialogDescription></DialogHeader>
              <form className="market-form" onSubmit={(event) => void onCompleteProfile(event)}>
                <FormField label="Nome" htmlFor="profile-name"><Input id="profile-name" name="name" autoComplete="name" defaultValue={currentUser?.user_metadata["full_name"]?.toString() ?? ""} required minLength={2} maxLength={100} /></FormField>
                <FormField label="Telefone" htmlFor="profile-phone"><Input id="profile-phone" name="phone" type="tel" autoComplete="tel" placeholder="+258 …" required minLength={5} maxLength={30} /></FormField>
                <FormField label="Morada em Vilankulo" htmlFor="profile-address"><Input id="profile-address" name="address" autoComplete="street-address" placeholder="Bairro ou zona" required minLength={2} maxLength={300} /></FormField>
                <FormField label="Data de nascimento" htmlFor="profile-birth-date"><Input id="profile-birth-date" name="birthDate" type="date" max={adultCutoff} required /></FormField>
                <Button type="submit" disabled={busy} className="market-form-submit">{busy ? "A guardar…" : "Guardar e continuar"}<ArrowRight size={17} /></Button>
              </form>
            </>
          ) : (
            <><DialogHeader className="market-form-header"><span className="market-form-kicker">Junte-se a Vilankulo</span><DialogTitle>Crie a sua conta</DialogTitle><DialogDescription>Vamos ligar boas descobertas às pessoas da comunidade.</DialogDescription></DialogHeader>
              <form className="market-form" onSubmit={(event) => void onSignup(event)}>
                <FormField label="Nome completo" htmlFor="register-name"><Input id="register-name" name="name" type="text" autoComplete="name" placeholder="O seu nome" required minLength={2} maxLength={100} /></FormField>
                <div className="market-form-grid"><FormField label="Email" htmlFor="register-email"><Input id="register-email" name="email" type="email" autoComplete="email" placeholder="nome@email.com" required maxLength={255} /></FormField><FormField label="Telefone" htmlFor="register-phone"><Input id="register-phone" name="phone" type="tel" autoComplete="tel" placeholder="+258 …" required minLength={5} maxLength={30} /></FormField></div>
                <FormField label="Morada em Vilankulo" htmlFor="register-address"><Input id="register-address" name="address" autoComplete="street-address" placeholder="Bairro ou zona" required minLength={2} maxLength={300} /></FormField>
                <div className="market-form-grid"><FormField label="Data de nascimento · 18+" htmlFor="register-birthday"><Input id="register-birthday" name="birthDate" type="date" max={adultCutoff} required /></FormField><FormField label="Palavra-passe" htmlFor="register-password"><Input id="register-password" name="password" type="password" autoComplete="new-password" placeholder="Pelo menos 8 caracteres" required minLength={8} maxLength={72} /></FormField></div>
                <p className="market-privacy-hint"><ShieldCheck size={15} /> A sua morada e data de nascimento nunca aparecem nos anúncios.</p>
                <Button type="submit" disabled={busy} className="market-form-submit">{busy ? "A criar a conta…" : "Criar conta gratuita"}<ArrowRight size={17} /></Button>
                <div className="market-auth-divider"><span>ou registe-se com</span></div>
                <div className="market-social-buttons"><Button type="button" variant="outline" className="market-social-button" onClick={() => onSocial("google")}><GoogleMark /> Continuar com Google</Button><Button type="button" variant="outline" className="market-social-button" onClick={() => onSocial("lovable")}><Sparkles size={16} /> Continuar com Lovable</Button></div>
                <p className="market-age-note"><ShieldCheck size={14} /> Ao continuar, confirma que tem pelo menos 18 anos.</p>
                <p className="market-switch-auth">Já tem conta? <button type="button" onClick={() => { setShowRegister(false); setShowLogin(true); }}>Entrar</button></p>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="market-form-field"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}

function listingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_review: "Em observação",
    active: "Publicado",
    sold: "Vendido",
    withdrawn: "Retirado",
    ended: "Terminado",
    rejected: "Rejeitado",
    suspended: "Suspenso",
  };
  return labels[status] ?? status;
}

function formatPrice(price: number): string {
  return `${new Intl.NumberFormat("pt-MZ", { maximumFractionDigits: 0 }).format(price)} MT`;
}