import { createFileRoute } from "@tanstack/react-router";
import { IntegrationDocs } from "@/components/bike/IntegrationDocs";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Backend Integration Docs — Bike IoT Control Center" },
      {
        name: "description",
        content: "FastAPI + Mosquitto integration guide with live topic sync from the cloud database.",
      },
    ],
  }),
});

function DocsPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 relative">
      <IntegrationDocs />
    </main>
  );
}
