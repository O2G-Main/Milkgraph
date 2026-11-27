"use client";

import { useEffect, useSyncExternalStore } from "react";
import { apiGet, API_MODE } from "./client.ts";
import { createResourceStore, type Resource } from "./resource-store.ts";
import { streamEvents } from "./events.ts";

export const EVENT_INVALIDATIONS: Record<string, string[]> = {
  "plan.decided": ["/decisions", "/plans", "/site/status", "/site/bottlenecks", "/receiving", "/audit", "/notifications"],
  "plan.solved": ["/plans", "/audit"],
  "instruction.acked": ["/plans", "/audit"],
  "limits.updated": ["/limits", "/plans", "/receiving", "/notifications", "/audit"],
  "hold.created": ["/holds", "/graph", "/audit", "/notifications"],
  "hold.reviewed": ["/holds", "/graph", "/audit", "/notifications"],
  "lab.created": ["/lab/results", "/lab/summary", "/graph", "/audit"],
  "lab.updated": ["/lab/results", "/lab/summary", "/graph", "/audit"],
  "lab.decided": ["/lab/results", "/lab/summary", "/receiving", "/site/status", "/graph", "/audit"],
  "demand.sent": ["/supply/demand-sends", "/audit"],
  "snapshot.updated": ["/receiving", "/assets", "/production", "/site/status", "/graph", "/notifications"],
  "source.synced": ["/data-sources"],
  "rt-arrival.seeded": ["/supply/rt-arrivals", "/dashboard/executive", "/site/bottlenecks", "/graph"],
  "rt-arrival.created": ["/supply/rt-arrivals", "/dashboard/executive", "/site/bottlenecks", "/graph", "/audit"],
  "rt-arrival.updated": ["/supply/rt-arrivals", "/dashboard/executive", "/site/bottlenecks", "/graph", "/audit"],
  "rt-arrival.imported": ["/supply/rt-arrivals", "/dashboard/executive", "/site/bottlenecks", "/graph", "/audit"],
  "transfer.created": ["/trace/transfers", "/dashboard/executive", "/graph", "/audit"],
  "downtime-event.created": ["/downtime-events", "/downtime-events/recommendation", "/dashboard/executive", "/graph", "/audit"],
  "po.seeded": ["/pos", "/dashboard/executive"],
  "po.created": ["/pos", "/dashboard/executive", "/audit"],
  "po.imported": ["/pos", "/dashboard/executive", "/audit"],
  "schedule.generated": ["/schedules/latest", "/schedules", "/dashboard/executive", "/site/bottlenecks", "/graph", "/audit"],
  "schedule.triggered": ["/schedules/latest", "/schedules", "/dashboard/executive", "/site/bottlenecks", "/graph", "/audit"],
  "cost-item.created": ["/costs", "/audit"],
  "ai-usage.recorded": ["/costs"],
  "role.import-csv-granted": ["/roles", "/audit"],
  "role.created": ["/roles", "/audit"],
  "role.updated": ["/roles", "/audit"],
  "role.deleted": ["/roles", "/audit"],
  "user.created": ["/users", "/audit"],
  "user.updated": ["/users", "/audit"],
  "user.deleted": ["/users", "/audit"],
};

export function matchInvalidation(patterns: string[], path: string): boolean {
  return patterns.some(pattern => path === pattern || path.startsWith(pattern + "/") || path.startsWith(pattern + "?"));
}

let activeRole = "planner";
let streamController: AbortController | null = null;
let onChange: (() => void) | null = null;
export function onApiEvent(callback: () => void) { onChange = callback; }
export function setActiveRole(role: string) {
  if (activeRole === role) return;
  activeRole = role;
  streamController?.abort();
  streamController = null;
  store.invalidate();
  startEventStream();
}

const store = createResourceStore(path => apiGet(path, activeRole));
const idle: Resource<never> = { loading: false };

export function invalidateResources(patterns?: string[]) {
  store.invalidate(patterns);
}

export function startEventStream() {
  if (streamController || typeof window === "undefined" || !API_MODE) return;
  const controller = new AbortController();
  streamController = controller;
  const connect = async () => {
    try {
      await streamEvents(activeRole, (event) => {
        const patterns = EVENT_INVALIDATIONS[event];
        if (patterns) store.invalidate(patterns);
        onChange?.();
      }, controller.signal);
    } catch {
      // Reconnect after brief pause
      if (!controller.signal.aborted) {
        setTimeout(connect, 3000);
      }
    }
  };
  void connect();
}

export function useResource<T>(path: string | null, options: { fetchOnMount?: boolean } = {}): { data: T | null; error: Error | null; loading: boolean; reload: () => Promise<void> } {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    () => (path ? (store.snapshot(path) as Resource<T>) : (idle as Resource<T>)),
    () => (path ? (store.snapshot(path) as Resource<T>) : (idle as Resource<T>))
  );

  const fetchOnMount = options.fetchOnMount ?? true;
  useEffect(() => {
    if (path && API_MODE && fetchOnMount) {
      startEventStream();
      void store.load(path);
    }
  }, [path, fetchOnMount]);

  return {
    data: snapshot.data ?? null,
    error: snapshot.error ?? null,
    loading: path ? snapshot.loading : false,
    reload: async () => {
      if (path) await store.load(path);
    },
  };
}
