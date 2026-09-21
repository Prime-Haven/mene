import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Messaging is always driven from the server. Composing and queueing happen
 * through security-definer database functions (which re-check the caller's
 * admin rights, package, audience scope and daily cap), and only the queue
 * worker below ever touches the providers.
 */

const AUDIENCE = ["all", "branch", "group", "first_timers", "absent", "birthdays_month"] as const;

const broadcastSchema = z.object({
  tenant_id: z.string().uuid(),
  channel: z.enum(["email", "sms"]),
  subject: z.string().trim().max(200),
  body: z.string().trim().min(2).max(1200),
  audience_kind: z.enum(AUDIENCE),
  audience_ref: z.string().uuid().nullable(),
  dry_run: z.boolean(),
});

/** Whether each channel's credentials are saved yet — no values are returned. */
export const getMessagingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { emailConfigured, smsConfigured } = await import("@/lib/messaging.server");
    return { email: emailConfigured(), sms: smsConfigured() };
  });

/** Counts the audience (dry run) or queues the send. */
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => broadcastSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("queue_broadcast", {
      p_tenant: data.tenant_id,
      p_channel: data.channel,
      p_subject: data.subject,
      p_body: data.body,
      p_kind: data.audience_kind,
      p_ref: data.audience_ref,
      p_dry_run: data.dry_run,
    });
    if (error) {
      return { ok: false as const, message: error.message.replace(/^.*?:\s*/, "") };
    }
    const payload = result as unknown as {
      dry_run: boolean;
      recipients: number;
      queued: number;
    };
    return { ok: true as const, ...payload };
  });

/**
 * Drains the queue. Runs after a broadcast is queued and from the daily job.
 * Callers must be an admin of the church they are flushing.
 */
export const flushMessageQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tenant_id: string }) =>
    z.object({ tenant_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_tenant_admin", {
      _tenant: data.tenant_id,
    });
    if (isAdmin !== true) return { ok: false as const, sent: 0, failed: 0 };

    const { processQueue } = await import("@/lib/queue.server");
    const result = await processQueue(120);
    return { ok: true as const, ...result };
  });
