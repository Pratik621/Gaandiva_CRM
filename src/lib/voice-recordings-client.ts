"use client";

import type { VoiceRecording } from "@/lib/voice-recordings";

/**
 * Coalesces per-cell recording lookups into one POST /api/leads/voice-recordings
 * call. Every table cell that mounts within the window joins the same batch, so
 * a page of N leads costs 1 request instead of N. Results are cached in-session
 * to avoid repeat fetches on pagination / re-renders.
 */
const BATCH_WINDOW_MS = 50;
const MAX_BATCH_LEADS = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

type Waiter = {
  resolve: (recordings: VoiceRecording[]) => void;
  reject: (err: unknown) => void;
};

type CacheEntry = {
  recordings: VoiceRecording[];
  fetchedAt: number;
};

let pendingWaiters = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const recordingsCache = new Map<string, CacheEntry>();

function isCacheFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

export function getCachedLeadRecordings(leadId: string): VoiceRecording[] | null {
  const entry = recordingsCache.get(leadId);
  if (!entry || !isCacheFresh(entry)) {
    if (entry) recordingsCache.delete(leadId);
    return null;
  }
  return entry.recordings;
}

export function setCachedLeadRecordings(leadId: string, recordings: VoiceRecording[]): void {
  recordingsCache.set(leadId, { recordings, fetchedAt: Date.now() });
}

export function invalidateLeadRecordingsCache(leadId?: string): void {
  if (leadId) {
    recordingsCache.delete(leadId);
    return;
  }
  recordingsCache.clear();
}

async function flushBatch() {
  flushTimer = null;
  const waiters = pendingWaiters;
  pendingWaiters = new Map();

  const leadIds = [...waiters.keys()];
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += MAX_BATCH_LEADS) {
    chunks.push(leadIds.slice(i, i + MAX_BATCH_LEADS));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch("/api/leads/voice-recordings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: chunk }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          recordings?: Record<string, VoiceRecording[]>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Failed to load recordings");
        }
        for (const id of chunk) {
          const recs = json.recordings?.[id] ?? [];
          setCachedLeadRecordings(id, recs);
          for (const w of waiters.get(id) ?? []) {
            w.resolve(recs);
          }
        }
      } catch (err) {
        for (const id of chunk) {
          for (const w of waiters.get(id) ?? []) {
            w.reject(err);
          }
        }
      }
    })
  );
}

export function fetchLeadRecordingsBatched(leadId: string): Promise<VoiceRecording[]> {
  const cached = getCachedLeadRecordings(leadId);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  return new Promise<VoiceRecording[]>((resolve, reject) => {
    const existing = pendingWaiters.get(leadId);
    if (existing) {
      existing.push({ resolve, reject });
    } else {
      pendingWaiters.set(leadId, [{ resolve, reject }]);
    }
    if (!flushTimer) {
      flushTimer = setTimeout(() => void flushBatch(), BATCH_WINDOW_MS);
    }
  });
}
