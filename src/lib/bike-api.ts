import { API_BASE } from "./bike-types";

async function post(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export const bikeApi = {
  startBike: () => post("/bike/start"),
  stopBike: () => post("/bike/stop"),
  startSimulation: () => post("/simulation/start"),
  stopSimulation: () => post("/simulation/stop"),
};
