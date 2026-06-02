import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";

/**
 * Pings the database every 4 minutes to prevent Neon free-tier compute from
 * auto-suspending. Neon suspends after 5 minutes of inactivity; this runs just
 * under that window to keep the compute warm.
 *
 * Remove this function (and its entry in the Inngest serve() call) if you
 * upgrade to a Neon paid plan that disables auto-suspend.
 */
export const dbKeepalive = inngest.createFunction(
  {
    id: "db-keepalive",
    name: "DB keepalive (Neon anti-suspend)",
    triggers: [{ cron: "*/4 * * * *" }],
  },
  async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  },
);
