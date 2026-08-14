import { GoogleGenAI } from "@google/genai";
import { rawClient } from "@/db";
import { geminiConfigured, requireGeminiKey } from "@/lib/agent/gemini";

/**
 * Semantic arm of block search.
 *
 * Embeddings live in a `search_embeddings` table that is created lazily and
 * only when the database proves it supports libSQL vectors (`vector32`). The
 * table is deliberately NOT part of the Drizzle migrations: vector support
 * varies across hosts (it is native in current libSQL, and reached via the
 * sqlite-vec extension on some Turso plans), so a migration that assumed it
 * would break `pnpm db:migrate` on databases without it. Search degrades to
 * keyword-only when vectors are unavailable or the API key is missing.
 */

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMS = 768;
export const EMBEDDING_TABLE = "search_embeddings";
export const EMBEDDING_INDEX = "search_embeddings_vec_idx";

let genai: GoogleGenAI | null = null;

function embeddingClient(): GoogleGenAI | null {
  if (!geminiConfigured()) return null;
  if (!genai) genai = new GoogleGenAI({ apiKey: requireGeminiKey() });
  return genai;
}

/** Embed one text string. Returns null when the API key is missing or fails. */
export async function embedText(text: string): Promise<number[] | null> {
  const client = embeddingClient();
  if (!client) return null;
  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [text.slice(0, 20_000)],
      config: { outputDimensionality: EMBEDDING_DIMS },
    });
    return response.embeddings?.[0]?.values ?? null;
  } catch {
    return null;
  }
}

let supportProbe: Promise<boolean> | null = null;

/** Probes once whether the connected database understands libSQL vectors. */
export function isVectorSupported(): Promise<boolean> {
  if (!supportProbe) {
    supportProbe = rawClient
      .execute("SELECT vector32('[0.1]') AS probe")
      .then(() => true)
      .catch(() => false);
  }
  return supportProbe;
}

let tableReady: Promise<boolean> | null = null;

/**
 * Creates the embeddings table (and, when the host supports it, a DiskANN
 * index) exactly once. Idempotent; safe to call from every index path.
 */
export function ensureSearchVector(): Promise<boolean> {
  if (!tableReady) {
    tableReady = (async () => {
      if (!(await isVectorSupported())) return false;
      try {
        await rawClient.execute(
          `CREATE TABLE IF NOT EXISTS ${EMBEDDING_TABLE} (
            id TEXT PRIMARY KEY,
            embedding F32_BLOB(${EMBEDDING_DIMS}) NOT NULL
          )`,
        );
      } catch {
        return false;
      }
      // The index is an optimization on hosts that accept it (Turso cloud);
      // brute-force cosine below is the portable fallback, so failure is fine.
      try {
        await rawClient.execute(
          `CREATE INDEX IF NOT EXISTS ${EMBEDDING_INDEX}
           ON ${EMBEDDING_TABLE}(embedding) USING vector_cosine(${EMBEDDING_DIMS})`,
        );
      } catch {
        // Brute-force path covers it.
      }
      return true;
    })();
  }
  return tableReady;
}

export interface SemanticHit {
  id: string;
  distance: number;
}

/**
 * Finds the closest blocks by cosine distance. Uses brute force so the same
 * query runs on every host; the corpus is agency-sized, so O(n) is fine.
 */
export async function searchSemantic(vector: number[], limit: number): Promise<SemanticHit[]> {
  const result = await rawClient.execute(
    `SELECT id, vector_distance_cos(embedding, vector32(?)) AS distance
     FROM ${EMBEDDING_TABLE}
     ORDER BY distance ASC
     LIMIT ${limit}`,
    [JSON.stringify(vector)],
  );
  return (result.rows as unknown as SemanticHit[]) ?? [];
}

/** Stores or replaces one block's embedding. */
export async function writeEmbedding(id: string, vector: number[]): Promise<void> {
  await rawClient.execute(
    `INSERT INTO ${EMBEDDING_TABLE} (id, embedding) VALUES (?, vector32(?))
     ON CONFLICT(id) DO UPDATE SET embedding = excluded.embedding`,
    [id, JSON.stringify(vector)],
  );
}

/** Removes a block's embedding (used when a source row disappears). */
export async function deleteEmbedding(id: string): Promise<void> {
  await rawClient.execute(`DELETE FROM ${EMBEDDING_TABLE} WHERE id = ?`, [id]);
}
