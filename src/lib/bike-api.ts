import { API_BASE } from "./bike-types";

async function post(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export interface TopicConfig {
  name: string;
  topic: string;
  description?: string;
}

export const bikeApi = {
  startBike: () => post("/bike/start"),
  stopBike: () => post("/bike/stop"),
  startSimulation: () => post("/simulation/start"),
  stopSimulation: () => post("/simulation/stop"),
  getTopics: async (): Promise<TopicConfig[]> => {
    const res = await fetch(`${API_BASE}/topics`);
    if (!res.ok) throw new Error(`GET /topics failed: ${res.status}`);
    const data = await res.json();
    // Accept either an array of {name, topic} or a {name: topic} map
    if (Array.isArray(data)) return data;
    return Object.entries(data as Record<string, string>).map(([name, topic]) => ({
      name,
      topic: String(topic),
    }));
  },
  updateTopic: async (name: string, topic: string) => {
    const res = await fetch(`${API_BASE}/topics/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) throw new Error(`PUT /topics/${name} failed: ${res.status}`);
    return res.json().catch(() => ({}));
  },
};
