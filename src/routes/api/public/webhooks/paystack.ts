import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack webhook. Every request is verified with an HMAC-SHA512 signature over
 * the raw body before any database write happens. Unverified requests are dropped.
 */
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["PAYSTACK_SECRET_KEY"];
        if (!secret) return new Response("Not configured", { status: 503 });

        const raw = await request.text();
        const provided = request.headers.get("x-paystack-signature") ?? "";
        const expected = createHmac("sha512", secret).update(raw).digest("hex");

        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: {
          event?: string;
          data?: {
            reference?: string;
            status?: string;
            channel?: string;
            paid_at?: string;
            amount?: number;
            metadata?: { tenant_id?: string; tier?: string };
          };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        if (event.event !== "charge.success" || !event.data?.reference) {
          return new Response("ignored");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.rpc("apply_successful_payment", {
          p_reference: event.data.reference,
          p_channel: event.data.channel ?? null,
          p_paid_at: event.data.paid_at ?? new Date().toISOString(),
          p_amount: event.data.amount ?? null,
        });

        if (error) {
          console.error("paystack_webhook_apply_failed", error.message);
          return new Response("Could not record payment", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
