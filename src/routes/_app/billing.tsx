import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Grace City Hub" },
      { name: "description", content: "Your subscription tier, renewal date and payment history." },
      { property: "og:title", content: "Billing — Grace City Hub" },
      { property: "og:description", content: "Subscription tier, renewal date and invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Billing,
});

function Billing() {
  const { tenant } = useTenant();

  const { data: sub } = useQuery({
    queryKey: ["subscription", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, pending_tier, period_start, period_end, payment_method, auto_renew")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, reference, amount_kobo, currency, tier, status, channel, paid_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Subscription</p>
        <h1 className="mt-2 text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          A lapsed subscription pauses check-in and edits. Your records and exports always stay available.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface p-5">
          <p className="text-eyebrow">Current tier</p>
          <p className="mt-2 text-2xl font-bold capitalize">{sub?.tier ?? tenant?.tier}</p>
          {sub?.pending_tier && (
            <p className="mt-1 text-xs text-muted-foreground">
              Changing to {sub.pending_tier} at period end
            </p>
          )}
        </div>
        <div className="surface p-5">
          <p className="text-eyebrow">Renews</p>
          <p className="mt-2 text-2xl font-bold">{sub?.period_end ?? "—"}</p>
        </div>
        <div className="surface p-5">
          <p className="text-eyebrow">Payment method</p>
          <p className="mt-2 text-2xl font-bold uppercase">{sub?.payment_method ?? "momo"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mobile money cannot be auto-debited, so renewal is prompted each cycle.
          </p>
        </div>
      </div>

      <div className="surface p-5">
        <h2 className="text-base font-semibold">Card and mobile money payments</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The payment gateway is wired and waiting for the Paystack key. Once it is added, this screen
          collects the first payment and renewals, and payments recorded by the gateway appear below.
        </p>
      </div>

      <div className="surface divide-y divide-border">
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{p.reference}</p>
              <p className="font-medium capitalize">
                {p.tier} · {p.currency} {(Number(p.amount_kobo) / 100).toFixed(2)}
              </p>
            </div>
            <Badge variant={p.status === "success" ? "default" : "outline"}>{p.status}</Badge>
          </div>
        ))}
        {(payments ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
      </div>
    </div>
  );
}
