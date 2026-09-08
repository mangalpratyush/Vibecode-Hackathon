import { MongoClient } from "mongodb";

/**
 * Prepare the MongoDB database PARAM uses when MONGODB_URI is set.
 *
 * There is no seed DATA to insert — PARAM has no reference collections, and a
 * bundle only exists because someone uploaded one. What this does is create the
 * collections and their indexes up front, so the first upload on a fresh
 * database is not also the first write that has to build an index.
 *
 * Safe to run repeatedly.
 *
 *   node scripts/seed-mongo.mjs
 */

const URI = process.env.MONGODB_URI;
const DB = process.env.MONGODB_DB || "param";

if (!URI) {
  console.error(
    "MONGODB_URI is not set.\n\n" +
      "PARAM runs perfectly well without it — bundles are then kept in memory and\n" +
      "lost when the server restarts, and the app header says so. Set MONGODB_URI in\n" +
      ".env.local only if you want them to persist."
  );
  process.exitCode = 1;
}

async function main() {
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB);
  console.log(`connected to ${DB}`);

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of ["bundles", "results", "redlines", "uploads.files", "uploads.chunks"]) {
    if (existing.has(name)) {
      console.log(`  ${name} — already present`);
    } else {
      await db.createCollection(name);
      console.log(`  ${name} — created`);
    }
  }

  // `id` is our own identifier, not Mongo's _id, and every read goes through it.
  await db.collection("bundles").createIndex({ id: 1 }, { unique: true });
  // The dashboard lists a user's bundles newest first.
  await db.collection("bundles").createIndex({ ownerEmail: 1, createdAt: -1 });
  await db.collection("results").createIndex({ bundleId: 1 }, { unique: true });
  await db.collection("redlines").createIndex({ bundleId: 1 }, { unique: true });

  // The uploaded PDFs live in the GridFS bucket "uploads" when MONGODB_URI is
  // set, because a serverless deployment has no writable disk to keep them on.
  // Reads are by filename; deleting a filing sweeps by metadata.bundleId.
  await db.collection("uploads.files").createIndex({ filename: 1, uploadDate: 1 });
  await db.collection("uploads.files").createIndex({ "metadata.bundleId": 1 });
  await db.collection("uploads.chunks").createIndex({ files_id: 1, n: 1 }, { unique: true });
  console.log("  indexes ensured");

  const counts = {
    bundles: await db.collection("bundles").countDocuments(),
    results: await db.collection("results").countDocuments(),
  };
  console.log(`\nready — ${counts.bundles} bundle(s), ${counts.results} result(s) on record`);
  await client.close();
}

if (URI)
  main().catch((e) => {
    console.error("seed failed:", e.message);
    process.exitCode = 1;
  });
