import { FormEvent, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function PublicAskMene() {
  const reduceMotion = useReducedMotion();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = question.trim();
    if (!value || value.length > 500 || busy) return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const response = await fetch("/api/public/product-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: value }),
      });
      const body = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !body.answer) throw new Error(body.error ?? "Mene:Log help is unavailable right now.");
      setAnswer(body.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mene:Log help is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="fixed bottom-5 right-5 z-40 h-12 gap-2 rounded-full px-5 shadow-xl sm:bottom-7 sm:right-7" aria-label="Ask Mene:Log">
          <Sparkles className="size-4" /> Ask Mene:Log
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <div className="relative border-b bg-deep px-6 py-7 text-deep-foreground">
          <div aria-hidden className="motion-blur motion-blur-small" />
          <DialogHeader className="relative text-left">
            <DialogTitle className="flex items-center gap-2 text-deep-foreground"><MessageCircle className="size-5 text-primary" /> Ask Mene:Log</DialogTitle>
            <DialogDescription className="text-deep-foreground/65">Questions about packages, check-in, security, onboarding, and how the system works.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 p-6">
          {answer && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap">{answer}</motion.div>}
          {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <form onSubmit={submit} className="space-y-3">
            <label htmlFor="public-ask-mene" className="text-sm font-semibold">What would you like to know?</label>
            <textarea id="public-ask-mene" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={4} className="w-full resize-none rounded-lg border border-input bg-background p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/30" placeholder="How does QR check-in work?" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{question.length}/500</span>
              <Button type="submit" disabled={busy || !question.trim()}>{busy ? "Thinking…" : "Ask"}<Send className="size-4" /></Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}