import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "Feed" },
      { name: "description", content: "Your activity feed." },
    ],
  }),
  component: FeedPage,
});

function FeedPage() {
  return (
    <div className="min-h-screen px-6 pt-32">
      <h1 className="text-3xl font-semibold">Feed</h1>
      <p className="mt-2 text-muted-foreground">Your feed will appear here.</p>
    </div>
  );
}
