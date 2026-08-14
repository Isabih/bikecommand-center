import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Scheduled GitHub firmware poller.
 *
 * Lists every manifest JSON under `firmwares/apaforme/` in the
 * `Isabih/apaforme-firmware` repository, fetches each one, and upserts it
 * into the `firmware_versions` cache. `latest.json` marks the row it points
 * to as `is_latest = true`.
 *
 * Trigger:
 *   - hourly via pg_cron  (POST, no body)
 *   - manually from the Firmware page "Refresh" button
 */

const REPO_OWNER = "Isabih";
const REPO_NAME = "apaforme-firmware";
const MANIFEST_DIR = "firmwares/apaforme";
const GH_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${MANIFEST_DIR}`;

interface GhContent {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
}

interface Manifest {
  version?: string;
  url?: string;
  /** Real repo manifests use `firmware_url`. */
  firmware_url?: string;
  sha256?: string;
  size?: number;
  notes?: string;
  product?: string;
  mandatory?: boolean;
  released_at?: string;
  /** Real repo manifests use `release_date`. */
  release_date?: string;
}

function manifestUrl(d: Manifest): string | null {
  return d.firmware_url ?? d.url ?? null;
}
function manifestReleased(d: Manifest): string | null {
  const raw = d.released_at ?? d.release_date;
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "apaforme-dashboard",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${url} → ${res.status}`);
  return (await res.json()) as T;
}


async function runRefresh() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env not configured");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // 1. list the manifest directory
  const listing = await ghJson<GhContent[]>(GH_API);
  const jsonFiles = listing.filter((f) => f.type === "file" && f.name.endsWith(".json"));
  const versionDirs = listing.filter((f) => f.type === "dir" && /^v?\d+\.\d+/.test(f.name));

  // 2. fetch every root-level manifest (latest.json, x.y.z.json, …)
  const manifests: Array<{ file: string; data: Manifest }> = [];
  for (const f of jsonFiles) {
    if (!f.download_url) continue;
    try {
      manifests.push({ file: f.name, data: await ghJson<Manifest>(f.download_url) });
    } catch (e) {
      console.warn(`[refresh-firmware] skip ${f.name}: ${(e as Error).message}`);
    }
  }

  // 3. walk each version folder: use its manifest.json when present,
  //    otherwise synthesise one from firmware.bin.
  for (const dir of versionDirs) {
    const version = dir.name.replace(/^v/, "");
    if (manifests.some((m) => m.data.version === version)) continue;
    try {
      const files = await ghJson<GhContent[]>(`${GH_API}/${dir.name}`);
      const manifestFile = files.find((f) => f.type === "file" && f.name.endsWith(".json"));
      if (manifestFile?.download_url) {
        manifests.push({ file: `${dir.name}/${manifestFile.name}`, data: await ghJson<Manifest>(manifestFile.download_url) });
        continue;
      }
      const bin = files.find((f) => f.name === "firmware.bin" && f.download_url);
      if (bin?.download_url) {
        manifests.push({ file: `${dir.name}/firmware.bin`, data: { version, firmware_url: bin.download_url } });
      }
    } catch (e) {
      console.warn(`[refresh-firmware] skip dir ${dir.name}: ${(e as Error).message}`);
    }
  }

  // 4. resolve which version is "latest": latest.json's version field wins
  const latestFile = manifests.find((m) => m.file.toLowerCase() === "latest.json");
  const latestVersion = latestFile?.data.version;

  const rows = manifests
    .map((m) => {
      const d = m.data;
      const binUrl = manifestUrl(d);
      if (!d.version || !binUrl) return null;
      return {
        version: String(d.version),
        url: binUrl,
        sha256: d.sha256 ?? null,
        notes: d.notes ?? null,
        released_at: manifestReleased(d),
        is_latest: latestVersion ? d.version === latestVersion : false,
        source: "github",
        manifest: d as unknown as Record<string, unknown>,
        fetched_at: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  // De-duplicate by version, preferring the entry with the most metadata.
  const byVersion = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = String(r.version);
    const prev = byVersion.get(key);
    if (!prev || Object.values(r).filter(Boolean).length > Object.values(prev).filter(Boolean).length) {
      byVersion.set(key, { ...prev, ...r });
    }
  }
  const finalRows = Array.from(byVersion.values());

  if (finalRows.length === 0) return { ok: true, upserted: 0, note: "no manifests found" };


  // Reset is_latest before upserting, then upsert with per-row flag.
  await sb.from("firmware_versions").update({ is_latest: false }).neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await sb.from("firmware_versions").upsert(finalRows, { onConflict: "version" });
  if (error) throw error;

  return { ok: true, upserted: finalRows.length, latest: latestVersion ?? null };
}

export const Route = createFileRoute("/api/public/hooks/refresh-firmware")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const r = await runRefresh();
          return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      POST: async () => {
        try {
          const r = await runRefresh();
          return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
