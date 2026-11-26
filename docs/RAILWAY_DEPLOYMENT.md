# Railway deployment

VilaShop is a TanStack Start application with server functions, so it must run as a Node/Nitro server (not as a static GitHub Pages site).

## Build and start

- Build: `bun run build`
- Build preset: `NITRO_PRESET=node_server`
- Start: `bun run start` (runs `node .output/server/index.mjs`)

The GitHub Actions quality workflow builds with the Node server preset and smoke-tests the generated server. It does not deploy or run database migrations.

## Railway service setup

1. Connect the GitHub repository `infoparrotdesign-droid/vilankulo-leil-es-usados`.
2. Select branch `vilashop/rebuild-foundation`.
3. Set the build variable `NITRO_PRESET=node_server`.
4. Set these service variables using the existing external Supabase project's public configuration:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Use `bun run build` as the build command and `bun run start` as the start command. Railpack can detect Bun from `bun.lock`.
6. Generate a Railway public domain and verify the homepage, login, profile completion and admin access.

The Supabase publishable key is intended for browser use. Never add a Supabase secret/service-role key to client variables or commit secrets to GitHub.

## Safety

- This deployment setup does not connect a new database.
- It does not run Supabase migrations or modify database records.
- The current Lovable preview is separate and is not automatically synchronized by this deployment.
