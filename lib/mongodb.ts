import { Db as MongoDb, MongoClient } from "mongodb";

/**
 * Shared MongoDB client. The client promise is cached on `globalThis` so dev
 * hot-reloads (and serverless warm invocations) reuse one connection pool
 * instead of opening a new one per module reload.
 */

const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function clientPromise(): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set (add it to .env.local)");
    globalForMongo._mongoClientPromise = new MongoClient(uri).connect();
  }
  return globalForMongo._mongoClientPromise;
}

export const DB_NAME = process.env.MONGODB_DB || "param";

export async function getMongoDb(): Promise<MongoDb> {
  const client = await clientPromise();
  return client.db(DB_NAME);
}
