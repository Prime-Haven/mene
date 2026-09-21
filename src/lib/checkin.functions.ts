import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Public check-in runs entirely on the server with the service-role client so the
 * browser never reads or writes church data directly. Rate limiting, validation and
 * QR issuing all happen inside the database's security-definer functions.
 */

const checkinSchema = z.object({
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,40}$/, "Invalid church address"),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
  residential_area: z.string().trim().max(120).optional().or(z.literal("")),
  consent: z.literal(true),
});

function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-real-ip") ?? "unknown";
}

export const getChurchBranding = createServerFn({ method: "GET" })
  .inputValidator((data: { subdomain: string }) =>
    z.object({ subdomain: z.string().trim().toLowerCase().max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: branding, error } = await supabaseAdmin.rpc("tenant_branding", {
      p_subdomain: data.subdomain,
    });
    if (error) return null;
    return branding as {
      id: string;
      name: string;
      subdomain: string;
      logo_path: string | null;
      active: boolean;
    } | null;
  });

export const submitSelfCheckin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkinSchema.parse(data))
  .handler(async ({ data }) => {
    // Cheap per-request guard before touching the database at all.
    getRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("self_checkin", {
      p_subdomain: data.subdomain,
      p_full_name: data.full_name,
      p_phone: data.phone,
      p_email: data.email || null,
      p_dob: data.date_of_birth || null,
      p_gender: (data.gender || null) as "male" | "female" | "other" | null,
      p_area: data.residential_area || null,
      p_ip: clientIp(),
    });

    if (error) {
      // Surface only the human-readable message, never provider internals.
      return { ok: false as const, message: error.message.replace(/^.*?:\s*/, "") };
    }

    const payload = result as {
      ok: boolean;
      token: string;
      returning: boolean;
      checked_in: boolean;
      church: string;
    };
    return { ok: true as const, ...payload };
  });
