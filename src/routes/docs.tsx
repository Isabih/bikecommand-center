import { createFileRoute } from "@tanstack/react-router";
import { IntegrationDocs } from "@/components/bike/IntegrationDocs";
import { MqttSetupCard } from "@/components/bike/MqttSetupCard";
import { ConnectionSettings } from "@/components/bike/ConnectionSettings";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Backend Integration Docs — Bike IoT Control Center" },
      {
        name: "description",
        content: "Mosquitto MQTT setup + FastAPI integration guide with live topic sync from the cloud database.",
      },
    ],
  }),
});

function DocsPage() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 space-y-6 relative">
      <ConnectionSettings />
      <MqttSetupCard />
      <IntegrationDocs />
    </main>
  );
}
