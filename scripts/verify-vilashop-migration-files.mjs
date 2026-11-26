import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "drizzle", "migrations");
const expectedTags = [
  "0000_create_boladas_marketplace",
  "0001_enable_private_profile_photos_and_seller_contact",
  "0002_validate_adult_profiles_and_allow_social_completion",
  "0003_six_hour_listing_observation_and_admin_moderation",
  "0004_private_listing_photo_review_access",
  "0005_rls_policy_performance_and_fk_indexes",
  "0006_sale_delivery_confirmation_and_photo_retention",
  "0007_separate_admin_and_notification_emails",
];

const missing = [];
for (const tag of expectedTags) {
  const file = join(migrationDir, `${tag}.sql`);
  if (!existsSync(file) || readFileSync(file, "utf8").trim().length === 0) {
    missing.push(`${tag}.sql`);
  }
}

const journalPath = join(migrationDir, "meta", "_journal.json");
const snapshotPaths = [0, 1, 2].map((n) =>
  join(migrationDir, "meta", `${String(n).padStart(4, "0")}_snapshot.json`),
);
for (const file of [journalPath, ...snapshotPaths]) {
  if (!existsSync(file)) missing.push(file.replace(process.cwd() + "/", ""));
}

if (existsSync(journalPath)) {
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const actualTags = (journal.entries ?? []).map((entry) => entry.tag);
  if (JSON.stringify(actualTags) !== JSON.stringify(expectedTags)) {
    console.error("Drizzle journal does not match the expected ordered migration list.");
    console.error({ expectedTags, actualTags });
    process.exitCode = 1;
  }
}

if (missing.length) {
  console.error("VilaShop source archive is incomplete. Missing/empty files:");
  for (const file of missing) console.error(` - ${file}`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log("VilaShop source integrity OK: 8 SQL migration files + 4 Drizzle metadata files present.");
}
