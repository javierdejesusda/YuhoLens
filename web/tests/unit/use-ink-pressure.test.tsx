/**
 * Contract test for useInkPressure: subscribes to lenis "scroll" events and
 * publishes |velocity|/8 (clamped 0..1) to both React state and the
 * `--ink-pressure` CSS custom property on the document root. Tasks 7, 9,
 * and 17 read this var, so we lock the contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

type ScrollHandler = (l: { velocity: number }) => void;

const lenisListeners: ScrollHandler[] = [];
const fakeLenis = {
  velocity: 0,
  on: vi.fn((event: string, handler: ScrollHandler) => {
    if (event === "scroll") lenisListeners.push(handler);
  }),
  off: vi.fn((event: string, handler: ScrollHandler) => {
    if (event !== "scroll") return;
    const idx = lenisListeners.indexOf(handler);
    if (idx >= 0) lenisListeners.splice(idx, 1);
  }),
};

vi.mock("@/lib/lenis", () => ({
  getLenis: () => fakeLenis,
}));

import { useInkPressure } from "@/lib/use-ink-pressure";

function Probe() {
  const pressure = useInkPressure();
  return <span data-testid="probe">{pressure.toFixed(3)}</span>;
}

describe("useInkPressure", () => {
  beforeEach(() => {
    lenisListeners.length = 0;
    fakeLenis.on.mockClear();
    fakeLenis.off.mockClear();
    document.documentElement.style.removeProperty("--ink-pressure");
  });
  afterEach(() => {
    cleanup();
  });

  it("subscribes once on mount and unsubscribes on unmount", () => {
    const { unmount } = render(<Probe />);
    expect(fakeLenis.on).toHaveBeenCalledTimes(1);
    expect(lenisListeners).toHaveLength(1);
    unmount();
    expect(fakeLenis.off).toHaveBeenCalledTimes(1);
    expect(lenisListeners).toHaveLength(0);
  });

  it("publishes |velocity|/8 to the --ink-pressure CSS var (clamped 0..1)", () => {
    render(<Probe />);
    const fire = (velocity: number) => {
      fakeLenis.velocity = velocity;
      act(() => {
        lenisListeners[0]({ velocity });
      });
      return document.documentElement.style.getPropertyValue("--ink-pressure");
    };

    expect(fire(0)).toBe("0.000");
    expect(fire(4)).toBe("0.500");
    expect(fire(-4)).toBe("0.500");
    expect(fire(20)).toBe("1.000");
  });

  it("returns the latest pressure from the hook itself", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe").textContent).toBe("0.000");
    act(() => {
      lenisListeners[0]({ velocity: 4 });
    });
    expect(getByTestId("probe").textContent).toBe("0.500");
    act(() => {
      lenisListeners[0]({ velocity: 20 });
    });
    expect(getByTestId("probe").textContent).toBe("1.000");
  });
});
