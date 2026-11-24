import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getActiveListingPhotoUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ listingIds: z.array(z.string().uuid()).max(48) }).parse(input),
  )
  .handler(async ({ data }) => {
    const listingIds = [...new Set(data.listingIds)];
    if (listingIds.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: listings, error } = await supabaseAdmin
      .from("listings")
      .select("id, photo_path, listing_type, status")
      .in("id", listingIds)
      .in("status", ["active", "ended"]);

    if (error) throw new Error("Não foi possível carregar as fotografias dos anúncios.");

    const photos = (listings ?? []).flatMap((listing) =>
      listing.photo_path && (listing.status === "active" || (listing.status === "ended" && listing.listing_type === "auction")) ? [{ listingId: listing.id, path: listing.photo_path }] : [],
    );
    if (photos.length === 0) return [];

    const { data: signedPhotos, error: signingError } = await supabaseAdmin
      .storage
      .from("boladas-media")
      .createSignedUrls(photos.map((photo) => photo.path), 3600);

    if (signingError) throw new Error("Não foi possível carregar as fotografias dos anúncios.");

    return photos.flatMap((photo, index) => {
      const signedUrl = signedPhotos?.[index]?.signedUrl;
      return signedUrl ? [{ listingId: photo.listingId, signedUrl }] : [];
    });
  });