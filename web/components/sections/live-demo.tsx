"use client";
import { useCallback, useEffect, useReducer, useMemo, useRef, useState } from "react";
import filersData from "@/data/filers.generated.json";
import profilesData from "@/data/decoder-profiles.generated.json";
import type { Filer, DecoderProfile } from "@/lib/types";
import {
  reduce,
  INITIAL,
  STAGE_DURATIONS_MS,
  isApproved,
} from "@/components/demo/demo-state-machine";
import { TickerChips } from "@/components/demo/ticker-chips";
import { DecoderToggle } from "@/components/demo/decoder-toggle";
import { LdPipe } from "@/components/demo/ld-pipe";
import { LdOutput } from "@/components/demo/ld-output";
import { LdSource } from "@/components/demo/ld-source";
import { Reveal } from "@/components/ui/reveal";
import { useCiteDrawer } from "@/components/ui/cite-drawer";

const STATUS_LABEL: Record<string, string> = {
  idle: "Idle · pick a filer",
  ingest: "INGESTOR · regex section split",
  pass1: "PASS-1 · per-section JSON · spans",
  critic: "CRITIC · 5 candidates · judge picking…",
  ground: "GROUNDER · verifying every span",
  composing: "COMPOSING MEMO · best-of-5 · 3.88",
  ready: "Ready · memo composed",
};

// Capture the initial `?ticker=` from the URL before any effects can mutate
// it. This lets us tell apart "user landed with a deeplink" (auto-run) from
// "we just echoed our own state into the URL" (don't auto-run).
function readInitialTicker(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("ticker");
}

export function LiveDemo() {
  const filers = filersData as Filer[];
  const profiles = profilesData as DecoderProfile[];
  const initialTickerRef = useRef<string | null>(null);
  if (initialTickerRef.current === null) {
    initialTickerRef.current = readInitialTicker() ?? "";
  }

  const [state, dispatch] = useReducer(reduce, {
    ...INITIAL,
    filerId: filers[0]?.customId ?? "",
    profileId:
      profiles.find((p) => p.isDefault)?.name ?? profiles[0]?.name ?? "",
  });

  const [tickerInput, setTickerInput] = useState(filers[0]?.customId ?? "");
  const [tickerNotice, setTickerNotice] = useState<string | null>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const openCite = useCiteDrawer();

  const flashSourceMark = useCallback((markIdx: number) => {
    const root = sourceRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`mark[data-cite="${markIdx}"]`);
    if (!el) return;
    el.classList.add("is-flash");
    setTimeout(() => el.classList.remove("is-flash"), 1200);
  }, []);

  const activeFiler = useMemo(
    () => filers.find((f) => f.customId === state.filerId),
    [filers, state.filerId],
  );

  useEffect(() => {
    const dur = STAGE_DURATIONS_MS[state.stage];
    if (dur > 0) {
      const t = setTimeout(() => dispatch({ type: "ADVANCE" }), dur);
      return () => clearTimeout(t);
    }
  }, [state.stage]);

  useEffect(() => {
    if (activeFiler) setTickerInput(activeFiler.customId);
  }, [activeFiler]);

  // Re-stream when the user picks a new ticker after a memo is already on
  // screen. Without this the new memo just pops in fully formed, which the
  // user reported as boring. We track the previous filerId; when it changes
  // and we're already in `ready`, dispatch RUN to walk the pipeline again.
  const prevFilerIdRef = useRef(state.filerId);
  useEffect(() => {
    if (prevFilerIdRef.current === state.filerId) return;
    prevFilerIdRef.current = state.filerId;
    if (state.stage === "ready") {
      dispatch({ type: "RUN", filerId: state.filerId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.filerId]);

  // #31 — clear notice when input changes
  useEffect(() => {
    if (noticeTimerRef.current !== null) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setTickerNotice(null);
  }, [tickerInput]);

  // #32 — keep URL in sync when filer changes via UI
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!state.filerId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("ticker") === state.filerId) return;
    params.set("ticker", state.filerId);
    const url =
      window.location.pathname +
      "?" +
      params.toString() +
      window.location.hash;
    window.history.replaceState(null, "", url);
  }, [state.filerId]);

  // #32 — deeplink ?ticker=xxx on mount. We use the ticker we captured
  // synchronously before any effect ran, so the auto-run only fires for
  // genuine external deeplinks, not for the URL we wrote ourselves.
  useEffect(() => {
    const t = initialTickerRef.current;
    if (!t) return;
    const match = filers.find((f) => f.customId === t);
    if (!match) return;
    dispatch({ type: "SET_FILER", filerId: match.customId });
    dispatch({ type: "RUN", filerId: match.customId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #38 — listen for yuho:open-cite events; resolve global idx to citation
  useEffect(() => {
    if (!activeFiler) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ idx: number }>;
      const idx = ce.detail?.idx;
      if (typeof idx !== "number") return;
      const all = activeFiler.memo.flatMap((m) => m.citations);
      const c = all[idx];
      if (!c) return;
      openCite({ citation: c, customId: activeFiler.customId, globalIdx: idx });
      flashSourceMark(idx);
    };
    document.addEventListener("yuho:open-cite", handler as EventListener);
    return () =>
      document.removeEventListener("yuho:open-cite", handler as EventListener);
  }, [activeFiler, openCite, flashSourceMark]);

  // #38 — parse #cite=N on mount, after activeFiler is ready
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeFiler) return;
    const m = window.location.hash.match(/^#cite=(\d+)$/);
    if (!m) return;
    const idx = parseInt(m[1], 10);
    if (Number.isNaN(idx)) return;
    document.dispatchEvent(
      new CustomEvent("yuho:open-cite", { detail: { idx } }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFiler?.customId]);

  const buttonLabel =
    state.stage === "idle"
      ? "Read →"
      : state.stage === "ready"
      ? "Read again →"
      : "Running…";

  // #31 — surface "no match" notice if the typed ticker doesn't resolve.
  const onRun = () => {
    const trimmed = tickerInput.trim();
    if (trimmed) {
      const match = filers.find((f) => f.customId === trimmed);
      if (!match) {
        const fallbackId = state.filerId || filers[0]?.customId || ", ";
        setTickerNotice(`no match · using ${fallbackId}`);
        if (noticeTimerRef.current !== null) {
          clearTimeout(noticeTimerRef.current);
        }
        noticeTimerRef.current = window.setTimeout(() => {
          setTickerNotice(null);
          noticeTimerRef.current = null;
        }, 3000);
      } else if (match.customId !== state.filerId) {
        dispatch({ type: "SET_FILER", filerId: match.customId });
      }
    }
    dispatch({
      type:
        state.stage === "idle" || state.stage === "ready" ? "RUN" : "RESET",
    });
  };

  return (
    <section className="live-demo is-paper-anchor-right" id="demo" data-paper-stage="demo" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">§ 02 · 5</span>
          <span>The lens, live</span>
          <span className="ja">実演</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Pick a filer. <span className="accent">Watch it read.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          A small, live taste. Click a row, the four-agent pipeline writes a span-cited memo from the
          Japanese source, in front of you. Click any superscript to inspect the citation.
        </p>
      </Reveal>

      <div className="ld-grid">
        <Reveal>
          <div className="ld-console">
            <div className="ld-bar">
              <span className="dot" aria-hidden="true" />
              <span className="lbl">YuhoLens · Pipeline</span>
              <span className="meta">{STATUS_LABEL[state.stage] ?? state.stage}</span>
            </div>

            <div className="ld-input">
              <span className="prompt">$</span>
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value)}
                aria-label="EDINET row ID"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={onRun}
                disabled={state.stage !== "idle" && state.stage !== "ready"}
              >
                {buttonLabel}
              </button>
            </div>
            {tickerNotice && (
              <div className="ld-notice mono">{tickerNotice}</div>
            )}

            <TickerChips
              filers={filers}
              active={state.filerId}
              onPick={(id) => dispatch({ type: "SET_FILER", filerId: id })}
            />

            <DecoderToggle
              profiles={profiles}
              active={state.profileId}
              onPick={(name) => dispatch({ type: "SET_PROFILE", profileId: name })}
            />

            <LdPipe current={state.stage} />

            <div className="ld-output">
              {activeFiler &&
                (state.stage === "composing" || state.stage === "ready") && (
                  <LdOutput
                    lines={activeFiler.memo}
                    active={state.stage === "composing"}
                    customId={activeFiler.customId}
                    onDone={() => dispatch({ type: "STREAM_DONE" })}
                    onCiteClick={flashSourceMark}
                    approved={isApproved(state.stage)}
                  />
                )}
              {state.stage !== "composing" && state.stage !== "ready" && (
                <p className="placeholder">
                  {state.stage === "idle"
                    ? "Press Read → to compose a memo from this filer."
                    : "Composing memo…"}
                </p>
              )}
            </div>
          </div>
        </Reveal>

        {activeFiler && (
          <Reveal delay={1}>
            <LdSource filer={activeFiler} ref={sourceRef} />
          </Reveal>
        )}
      </div>
    </section>
  );
}
