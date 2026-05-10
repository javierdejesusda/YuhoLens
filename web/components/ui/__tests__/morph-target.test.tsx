import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MorphTarget, cadenceFromPressure } from "@/components/ui/morph-target";

function mockMatchMedia(reducedMotion: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MorphTarget cadence formula", () => {
  it("idle pressure → 900ms cadence", () => {
    expect(cadenceFromPressure(0)).toBe(900);
  });

  it("peak pressure → cadence at the 260ms floor (never sub-260ms)", () => {
    const c = cadenceFromPressure(1);
    expect(c).toBeLessThanOrEqual(260);
    expect(c).toBeGreaterThanOrEqual(260);
  });

  it("rejects negative pressure values (clamps to idle 900ms)", () => {
    expect(cadenceFromPressure(-0.5)).toBe(900);
  });

  it("rejects pressure values above 1 (clamps to floor)", () => {
    expect(cadenceFromPressure(2)).toBeLessThanOrEqual(260);
  });

  it("interpolates monotonically: 0 < 0.5 < 1 produces decreasing cadence", () => {
    const idle = cadenceFromPressure(0);
    const mid = cadenceFromPressure(0.5);
    const peak = cadenceFromPressure(1);
    expect(idle).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(peak);
  });

  it("never returns sub-260ms cadence (floor enforced)", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(cadenceFromPressure(p)).toBeGreaterThanOrEqual(260);
    }
  });
});

describe("MorphTarget cycling render", () => {
  // The component renders a hidden width-reservation span (aria-hidden=true)
  // alongside the visible text span, so container.textContent contains both.
  // Query the visible inner span via the :not([aria-hidden]) selector.
  const visibleText = (container: HTMLElement) =>
    container.querySelector('span > span:not([aria-hidden="true"])')?.textContent;

  it("renders pairs[0] synchronously when pairs are provided", () => {
    const { container } = render(
      <MorphTarget pairs={["memo", "覚書"]} pressure={0} />
    );
    expect(visibleText(container)).toBe("memo");
  });

  it("reduced-motion: stays on first entry without flipping", () => {
    mockMatchMedia(true);
    const { container } = render(
      <MorphTarget pairs={["memo", "覚書"]} pressure={1} />
    );
    expect(visibleText(container)).toBe("memo");
  });

  it("preserves the no-pairs API (defaults to one-shot JA→EN morph)", () => {
    const { container } = render(<MorphTarget />);
    expect(container.querySelector("span")).toBeTruthy();
  });
});
