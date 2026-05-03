"use client";
import { useSyncExternalStore } from "react";

export interface ScrollState {
  y: number;
  progress: number;
  velocity: number;
  visibilityRatio: number;
}

const SERVER_STATE: ScrollState = {
  y: 0,
  progress: 0,
  velocity: 0,
  visibilityRatio: 1,
};

interface Store {
  state: ScrollState;
  listeners: Set<() => void>;
  rafPending: boolean;
  rafId: number;
  lastY: number;
  lastT: number;
  installed: boolean;
}

let store: Store | null = null;

function getStore(): Store {
  if (store) return store;
  store = {
    state: { ...SERVER_STATE },
    listeners: new Set(),
    rafPending: false,
    rafId: 0,
    lastY: 0,
    lastT: 0,
    installed: false,
  };
  return store;
}

function compute(s: Store) {
  s.rafPending = false;
  if (typeof window === "undefined") return;
  const doc = document.documentElement;
  const y = window.scrollY || doc.scrollTop || 0;
  const denom = doc.scrollHeight - window.innerHeight;
  const progress = denom > 0 ? y / denom : 0;
  const now =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  const dt = s.lastT === 0 ? 0 : Math.max(1, now - s.lastT);
  const dy = y - s.lastY;
  const velocity = dt > 0 ? dy / dt : 0;
  s.lastY = y;
  s.lastT = now;
  const innerH = window.innerHeight || 1;
  const visibilityRatio = denom > 0 ? Math.min(1, innerH / (denom + innerH)) : 1;
  const next: ScrollState = { y, progress, velocity, visibilityRatio };
  const prev = s.state;
  if (
    prev.y !== next.y ||
    prev.progress !== next.progress ||
    prev.velocity !== next.velocity ||
    prev.visibilityRatio !== next.visibilityRatio
  ) {
    s.state = next;
    s.listeners.forEach((l) => l());
  }
}

function schedule(s: Store) {
  if (s.rafPending) return;
  s.rafPending = true;
  s.rafId = requestAnimationFrame(() => compute(s));
}

function install(s: Store) {
  if (s.installed || typeof window === "undefined") return;
  s.installed = true;
  const onScroll = () => schedule(s);
  const onResize = () => schedule(s);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  schedule(s);
}

function subscribe(callback: () => void): () => void {
  const s = getStore();
  install(s);
  s.listeners.add(callback);
  return () => {
    s.listeners.delete(callback);
  };
}

function getSnapshot(): ScrollState {
  return getStore().state;
}

function getServerSnapshot(): ScrollState {
  return SERVER_STATE;
}

export function useScrollState(): ScrollState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
