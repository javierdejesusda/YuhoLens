/**
 * Regression for the demo-output disappearance bug flagged by adversarial
 * review: when the streaming run finishes and the parent transitions
 * `active=true → false` (composing → ready), the rendered memo lines must
 * persist. Earlier the effect reset state to 0 on `!active`, which blanked
 * the output the moment the seal stamp fired.
 *
 * Streaming is per-character (8–16 ms/char) so the loop must advance enough
 * fake timer cycles to exhaust every char + line-break pause.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import type { MemoLine } from "@/lib/types";

vi.mock("@/components/ui/cite-drawer", () => ({
  useCiteDrawer: () => () => {},
}));

import { LdOutput } from "@/components/demo/ld-output";

const LINES: MemoLine[] = [
  { text: "Line one.", displayText: "Line one.", citations: [], refused: false },
  { text: "Line two.", displayText: "Line two.", citations: [], refused: false },
  { text: "Line three.", displayText: "Line three.", citations: [], refused: false },
];

// Drain all pending timers + react updates. Per-char streaming schedules
// ~80–250 ms per line plus a 180 ms gap, so we need many small ticks rather
// than one huge advance (which could otherwise outrun react's effect cycle).
function flushStreaming() {
  for (let i = 0; i < 500; i++) {
    act(() => {
      vi.advanceTimersByTime(20);
    });
  }
}

describe("LdOutput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("preserves rendered lines after active→inactive (ready state)", () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <LdOutput lines={LINES} active={true} customId="test-1" onDone={onDone} />,
    );
    flushStreaming();
    expect(onDone).toHaveBeenCalled();
    expect(screen.getByText(/Line one/)).toBeDefined();
    expect(screen.getByText(/Line three/)).toBeDefined();

    // Parent flips active=false (mirrors stage transition composing → ready).
    rerender(
      <LdOutput lines={LINES} active={false} customId="test-1" onDone={onDone} />,
    );

    // Critical assertion: lines must remain rendered in the ready state.
    expect(screen.getByText(/Line one/)).toBeDefined();
    expect(screen.getByText(/Line two/)).toBeDefined();
    expect(screen.getByText(/Line three/)).toBeDefined();
  });

  it("resets and re-streams when active flips false→true (new run)", () => {
    const onDone = vi.fn();
    const { rerender } = render(
      <LdOutput lines={LINES} active={false} customId="test-2" onDone={onDone} />,
    );
    expect(screen.queryByText(/Line one/)).toBeNull();

    // Start new run.
    rerender(
      <LdOutput lines={LINES} active={true} customId="test-2" onDone={onDone} />,
    );
    flushStreaming();
    expect(screen.getByText(/Line three/)).toBeDefined();
  });
});
