import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { UitvoeringLabel } from "@/components/cases/UitvoeringLabel";

const span = (container: HTMLElement) => container.querySelector("span") as HTMLElement;

describe("Uitvoering-label", () => {
  it("TerreVolt krijgt een eigen groen label", () => {
    const { container } = render(<UitvoeringLabel uitvoerder="terrevolt" />);
    const el = span(container);
    expect(el.textContent).toBe("Uitvoering TerreVolt");
    expect(el.style.color).toBe("rgb(31, 92, 58)");
    expect(el.style.background).toBe("rgb(217, 242, 211)");
  });

  it("Van Gelder blijft het beige label", () => {
    const { container } = render(<UitvoeringLabel uitvoerder="van_gelder" />);
    const el = span(container);
    expect(el.textContent).toBe("Uitvoering Van Gelder");
    expect(el.style.color).toBe("rgb(91, 74, 30)");
    expect(el.style.background).toBe("rgb(243, 235, 214)");
  });
});
