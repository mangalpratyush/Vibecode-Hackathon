import type { Bundle, ScrutinyResult } from "./types";
import { getMongoDb } from "./mongodb";

/**
 * Storage.
 *
 * MongoDB when MONGODB_URI is configured, an in-process map when it is not.
 *
 * The fallback is deliberate. A filing-scrutiny tool that cannot start without
 * a database running is a tool nobody tries. PARAM runs on a clean checkout
 * with no configuration at all; adding Mongo makes bundles survive a restart.
 * Which mode is active is shown in the UI rather than hidden, because "my work
 * disappeared" is a far worse surprise than "this is running in memory".
 */

/**
 * Cached on globalThis, not module scope.
 *
 * In dev each route handler can end up in its own module instance, so a plain
 * module-level Map gives /api/bundle and /api/scrutiny two different stores and
 * a bundle saved by one is invisible to the other. Same reason the Mongo client
 * is cached this way in lib/mongodb.ts.
 */
const globalForMem = globalThis as unknown as {
  _paramMemStore?: {
    bundles: Map<string, Bundle>;
    results: Map<string, ScrutinyResult>;
  };
};

const mem = (globalForMem._paramMemStore ??= {
  bundles: new Map<string, Bundle>(),
  results: new Map<string, ScrutinyResult>(),
});

export const usingMongo = () => Boolean(process.env.MONGODB_URI);

export const storageMode = (): "mongodb" | "memory" =>
  usingMongo() ? "mongodb" : "memory";

export async function saveBundle(b: Bundle): Promise<void> {
  if (!usingMongo()) {
    mem.bundles.set(b.id, b);
    return;
  }
  const db = await getMongoDb();
  await db.collection<Bundle>("bundles").replaceOne({ id: b.id }, b, { upsert: true });
}

export async function getBundle(id: string): Promise<Bundle | null> {
  if (!usingMongo()) return mem.bundles.get(id) ?? null;
  const db = await getMongoDb();
  const doc = await db.collection<Bundle>("bundles").findOne({ id }, { projection: { _id: 0 } });
  return doc ?? null;
}

export async function listBundles(ownerEmail: string): Promise<Bundle[]> {
  if (!usingMongo()) {
    return [...mem.bundles.values()]
      .filter((b) => b.ownerEmail === ownerEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const db = await getMongoDb();
  return db
    .collection<Bundle>("bundles")
    .find({ ownerEmail }, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
}

export async function deleteBundle(id: string, ownerEmail: string): Promise<void> {
  if (!usingMongo()) {
    const b = mem.bundles.get(id);
    if (b?.ownerEmail === ownerEmail) {
      mem.bundles.delete(id);
      mem.results.delete(id);
    }
    return;
  }
  const db = await getMongoDb();
  await db.collection<Bundle>("bundles").deleteOne({ id, ownerEmail });
  await db.collection<ScrutinyResult>("results").deleteOne({ bundleId: id });
}

export async function saveResult(r: ScrutinyResult): Promise<void> {
  if (!usingMongo()) {
    mem.results.set(r.bundleId, r);
    return;
  }
  const db = await getMongoDb();
  await db
    .collection<ScrutinyResult>("results")
    .replaceOne({ bundleId: r.bundleId }, r, { upsert: true });
}

export async function getResult(bundleId: string): Promise<ScrutinyResult | null> {
  if (!usingMongo()) return mem.results.get(bundleId) ?? null;
  const db = await getMongoDb();
  const doc = await db
    .collection<ScrutinyResult>("results")
    .findOne({ bundleId }, { projection: { _id: 0 } });
  return doc ?? null;
}
