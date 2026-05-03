import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SealStamp } from "@/components/ui/seal-stamp";

describe("SealStamp", () => {
  it("renders pending state with aria attributes", () => {
    render(<SealStamp state="pending" label="grounder check" />);
    expect(screen.getByRole("img", { name: /pending/i })).toBeInTheDocument();
  });
  it("renders verified state with vermilion fill class", () => {
    const { container } = render(<SealStamp state="verified" label="grounded" />);
    expect(container.querySelector('[data-state="verified"]')).toBeTruthy();
  });
  it("renders refused state with diagonal slash overlay", () => {
    const { container } = render(<SealStamp state="refused" label="no span" />);
    expect(container.querySelector('[data-state="refused"]')).toBeTruthy();
  });
});
