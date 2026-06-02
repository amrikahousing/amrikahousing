import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";

// Use the HTTP adapter instead of the WebSocket Pool adapter.
// In Vercel serverless each Lambda is stateless — a WebSocket Pool must do a full
// TLS + WS handshake on every cold start (200-600 ms extra per request).
// The HTTP adapter issues plain HTTPS requests; no connection setup overhead.
function createPrismaClient() {
  const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!, {});
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

// Simple singleton — dev hot-reload safe, no schema-field introspection at runtime.
// The stale-client guard that was here caused a brand-new PrismaClient (and a new
// connection) to be created on every request if any of the ~26 field checks failed.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
