import { createClient } from "npm:@supabase/supabase-js@2.119.0";

type DuePhoto = { id: string; photo_path: string | null };

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const expectedToken = Deno.env.get("VILASHOP_CLEANUP_TOKEN");
  const suppliedToken = request.headers.get("x-vilashop-cleanup-token") ?? "";
  if (!expectedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Storage cleanup is not configured" }, { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: duePhotos, error: queueError } = await admin
    .from("listings")
    .select("id,photo_path")
    .lte("photos_delete_after", new Date().toISOString())
    .is("photos_deleted_at", null)
    .limit(100);

  if (queueError) {
    return Response.json({ error: "Could not read photo cleanup queue" }, { status: 500 });
  }

  const queue = (duePhotos ?? []) as DuePhoto[];
  let deleted = 0;
  let failed = 0;

  for (const listing of queue) {
    if (listing.photo_path) {
      const { error: storageError } = await admin.storage
        .from("boladas-media")
        .remove([listing.photo_path]);
      if (storageError) {
        failed += 1;
        continue;
      }
    }

    const { error: updateError } = await admin
      .from("listings")
      .update({ photo_path: null, photos_deleted_at: new Date().toISOString() })
      .eq("id", listing.id)
      .lte("photos_delete_after", new Date().toISOString())
      .is("photos_deleted_at", null);

    if (updateError) failed += 1;
    else deleted += 1;
  }

  return Response.json(
    { processed: queue.length, photosDeleted: deleted, failed, historyPreserved: true },
    { headers: { "Cache-Control": "no-store" } },
  );
});
