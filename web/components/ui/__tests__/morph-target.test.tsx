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
  it("idle pressure → 320ms cadence", () => {
    expect(cadenceFromPressure(0)).toBe(320);
  });

  it("peak pressure → cadence at the 100ms floor (never sub-100ms)", () => {
    const c = cadenceFromPressure(1);
    expect(c).toBeLessThanOrEqual(100);
    expect(c).toBeGreaterThanOrEqual(100);
  });

  it("rejects negative pressure values (clamps to idle 320ms)", () => {
    expect(cadenceFromPressure(-0.5)).toBe(320);
  });

  it("rejects pressure values above 1 (clamps to floor)", () => {
    expect(cadenceFromPressure(2)).toBeLessThanOrEqual(100);
  });

  it("interpolates monotonically: 0 < 0.5 < 1 produces decreasing cadence", () => {
    const idle = cadenceFromPressure(0);
    const mid = cadenceFromPressure(0.5);
    const peak = cadenceFromPressure(1);
    expect(idle).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(peak);
  });

  it("never returns sub-100ms cadence (floor enforced — sub-100ms reads as flicker)", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(cadenceFromPressure(p)).toBeGreaterThanOrEqual(100);
    }
  });
});

describe("MorphTarget cycling render", () => {
  it("renders pairs[0] synchronously when pairs are provided", () => {
    const { container } = render(
      <MorphTarget pairs={["memo", "覚書"]} pressure={0} />
    );
    expect(container.textContent).toBe("memo");
  });

  it("reduced-motion: stays on first entry without flipping", () => {
    mockMatchMedia(true);
    const { container } = render(
      <MorphTarget pairs={["memo", "覚書"]} pressure={1} />
    );
    expect(container.textContent).toBe("memo");
  });

  it("preserves the no-pairs API (defaults to one-shot JA→EN morph)", () => {
    const { container } = render(<MorphTarget />);
    expect(container.querySelector("span")).toBeTruthy();
  });
});
