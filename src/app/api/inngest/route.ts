import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { autopayChargeDueRent } from "@/inngest/autopay";
import { dbKeepalive } from "@/inngest/db-keepalive";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [autopayChargeDueRent, dbKeepalive],
});
