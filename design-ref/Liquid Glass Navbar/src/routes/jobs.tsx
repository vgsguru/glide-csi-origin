import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/jobs")({
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-sm opacity-60">Jobs</p>
    </div>
  ),
});
