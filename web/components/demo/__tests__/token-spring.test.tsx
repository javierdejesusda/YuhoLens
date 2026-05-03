import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenSpring } from "@/components/demo/token-spring";

describe("TokenSpring", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders every visible token from the input list", () => {
    const tokens = ["First", " ", "verified", " ", "memo", "."];
    render(<TokenSpring tokens={tokens} approved={false} />);
    for (const tok of tokens) {
      if (tok.trim().length === 0) continue;
      expect(screen.getByText(tok)).toBeInTheDocument();
    }
  });

  it("does not mount the SealStamp when approved is false", () => {
    const tokens = ["alpha", " ", "beta"];
    const { container } = render(
      <TokenSpring tokens={tokens} approved={false} />,
    );
    act(() => {
      vi.advanceTimersByTime(tokens.length * 32 + 400);
    });
    expect(container.querySelector('[data-state="verified"]')).toBeNull();
    expect(container.querySelector(".seal-stamp")).toBeNull();
  });

  it("mounts SealStamp state=verified once approved flips true and tokens settle", () => {
    const tokens = ["one", " ", "two", " ", "three"];
    const { container } = render(
      <TokenSpring tokens={tokens} approved label="memo grounded" />,
    );
    act(() => {
      vi.advanceTimersByTime(tokens.length * 32 + 400);
    });
    const stamp = container.querySelector('[data-state="verified"]');
    expect(stamp).toBeTruthy();
    expect(stamp?.getAttribute("aria-label")).toMatch(/memo grounded/i);
  });

  it("replaces a token with the citationSlots node at the matching index", () => {
    const tokens = ["sales", " ", "<cite>", " ", "rose"];
    const slots = {
      2: (
        <button type="button" data-testid="cite-trigger">
          ref-1
        </button>
      ),
    };
    render(
      <TokenSpring tokens={tokens} approved={false} citationSlots={slots} />,
    );
    expect(screen.getByTestId("cite-trigger")).toBeInTheDocument();
    expect(screen.queryByText("<cite>")).toBeNull();
  });
});
