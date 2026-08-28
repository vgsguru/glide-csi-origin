import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/og/jobs/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const file = params.file as string;
        const m = file.match(/^([0-9a-fA-F-]{36})\.(\w+)$/);
        if (!m) return new Response("Not found", { status: 404 });
        const jobId = m[1];
        const ext = m[2].toLowerCase();
        const path = `${jobId}.${ext}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("og-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        const buf = await data.arrayBuffer();
        const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        return new Response(buf, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
