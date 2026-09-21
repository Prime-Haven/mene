import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily messaging job. Queues birthday wishes and absence follow-ups for every
 * church whose package includes automations, then drains the send queue.
 * Protected by a shared secret — the route is reachable but useless without it.
 */
export const Route = createFileRoute("/api/public/cron/messaging")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["PATMOS_CRON_SECRET"];
        if (!expected) {
          return new Response("Not configured", { status: 503 });
        }
        const provided =
          request.headers.get("x-patmos-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (provided.length !== expected.length || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processQueue } = await import("@/lib/queue.server");

        const { data: automations, error } = await supabaseAdmin.rpc("run_daily_automations");
        if (error) {
          console.error("[cron] automations failed", error.message);
        }
        const drained = await processQueue(200);

        return Response.json({
          queued: automations ?? null,
          sent: drained.sent,
          failed: drained.failed,
        });
      },
    },
  },
});
