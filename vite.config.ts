// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Pre-bundle these up front so the preview never re-bundles mid-session,
    // which previously loaded two copies of React and caused a blank screen.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "framer-motion",
        "@tanstack/react-query",
        "@tanstack/react-router",
        "zod",
        "lucide-react",
        "@supabase/supabase-js",
        "sonner",
      ],
    },
    // Public browser configuration must be present in the compiled bundle.
    // Lovable Cloud normally injects these values, while these non-secret
    // fallbacks keep published auth and data pages functional if injection is
    // unavailable during a deployment. Private credentials remain server-only.
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://edhtwycqgiokiwnmtlio.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_aKCzF6IdC-5fOR40yHgMMA_EB2UepNT",
      ),
    },
  },
});
