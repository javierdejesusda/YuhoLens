"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Citation } from "@/lib/types";
import scriptPreviews from "@/data/repro-script-previews.generated.json";

interface ScriptPreview {
  lang: string;
  lines: string[];
  html: string;
}

const SCRIPT_PREVIEWS = scriptPreviews as Record<string, ScriptPreview>;

/**
 * Renders the build-time shiki snippet for a `repro-row` page reference.
 *
 * The HTML is generated at build time by `scripts/build-content.ts` from
 * source files inside this repo (no user input ever reaches it), so injecting
 * it via `dangerouslySetInnerHTML` is safe — it is the only way to get
 * shiki's per-token coloured spans into the DOM without shipping the shiki
 * runtime to the browser.
 */
function ScriptSnippet({ pageRef }: { pageRef: string }) {
  if (!pageRef) return null;
  const preview = SCRIPT_PREVIEWS[pageRef];
  if (!preview) return null;
  return (
    <section
      className="repro-snippet repro-snippet__root"
      aria-label="First 8 lines of source script"
    >
      <header className="mono repro-snippet__header">
        FIRST 8 LINES · {preview.lang.toUpperCase()}
      </header>
      <div
        className="repro-snippet__body"
        // Trusted: HTML produced at build time from this repo's own source.
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
    </section>
  );
}

interface DrawerPayload {
  citation: Citation;
  customId: string;
  globalIdx?: number;
}

function clearCiteHash() {
  if (typeof window === "undefined") return;
  if (!window.location.hash.startsWith("#cite=")) return;
  const url = window.location.pathname + window.location.search;
  window.history.replaceState(null, "", url);
}

interface Ctx {
  open: (p: DrawerPayload) => void;
  close: () => void;
}

const C = createContext<Ctx | null>(null);

export function useCiteDrawer() {
  const ctx = useContext(C);
  if (!ctx) throw new Error("useCiteDrawer outside provider");
  return ctx.open;
}

export function CiteDrawerProvider({ children }: { children: React.ReactNode }) {
  const [payload, setPayload] = useState<DrawerPayload | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((p: DrawerPayload) => {
    if (typeof document !== "undefined") {
      lastTrigger.current = document.activeElement as HTMLElement;
    }
    setPayload(p);
    if (typeof window !== "undefined" && typeof p.globalIdx === "number") {
      const newHash = "#cite=" + p.globalIdx;
      if (window.location.hash !== newHash) {
        const url =
          window.location.pathname + window.location.search + newHash;
        window.history.replaceState(null, "", url);
      }
    }
  }, []);

  const close = useCallback(() => {
    setPayload(null);
    clearCiteHash();
    if (lastTrigger.current) {
      lastTrigger.current.focus?.();
    }
  }, []);

  useEffect(() => {
    if (!payload) return;
    const drawerEl = drawerRef.current;

    const getFocusable = (): HTMLElement[] => {
      if (!drawerEl) return [];
      const nodes = drawerEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      return Array.from(nodes).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          e.preventDefault();
          drawerEl?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (activeEl === first || !drawerEl?.contains(activeEl)) {
            e.preventDefault();
            last.focus();
          }
        } else if (activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, close]);

  return (
    <C.Provider value={{ open, close }}>
      {children}
      <AnimatePresence>
        {payload && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                zIndex: "var(--z-overlay)",
              } as React.CSSProperties}
            />
            <motion.aside
              key="drawer"
              ref={drawerRef}
              id="cite-drawer"
              className="is-open"
              role="dialog"
              aria-modal="true"
              aria-label="Citation"
              tabIndex={-1}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "fixed",
                right: 0,
                top: 0,
                height: "100vh",
                width: "min(480px, 100vw)",
                background: "var(--color-ink-mid)",
                borderLeft: "1px solid var(--color-rule-strong)",
                padding: 32,
                zIndex: "calc(var(--z-overlay) + 1)",
                overflowY: "auto",
                outline: "none",
              } as React.CSSProperties}
            >
              <button
                ref={closeBtnRef}
                onClick={close}
                aria-label="Close citation"
                className="mono"
                style={{
                  float: "right",
                  background: "transparent",
                  border: "none",
                  color: "var(--color-type-muted)",
                  cursor: "pointer",
                }}
              >
                ✕ ESC
              </button>
              <div className="cd-section">
                <div className="mono">CITATION · {payload.customId || "MEMO"}</div>
              </div>
              <div className="cd-section">
                <p
                  className="jp"
                  style={{
                    marginTop: 24,
                    fontFamily: "var(--font-jp)",
                    fontSize: "var(--text-lg)",
                    lineHeight: 1.8,
                    background: "var(--color-paper-warm)",
                    color: "#29261b",
                    padding: 20,
                  }}
                >
                  {payload.citation.span}
                </p>
              </div>
              <div
                className="cd-section"
                style={{
                  marginTop: 24,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                <div>
                  <div className="mono">SECTION</div>
                  <div style={{ marginTop: 4 }}>
                    {payload.citation.section || "··"}
                  </div>
                </div>
                <div>
                  <div className="mono">PAGE</div>
                  <div style={{ marginTop: 4 }}>
                    {payload.citation.pageRef &&
                    payload.citation.pageRef !== "??"
                      ? payload.citation.pageRef
                      : "··"}
                  </div>
                </div>
              </div>
              <ScriptSnippet pageRef={payload.citation.pageRef} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </C.Provider>
  );
}
