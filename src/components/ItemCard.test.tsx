import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/renderWithProviders";
import { ItemCard } from "./ItemCard";
import type { Item } from "@/mocks/data";

const item: Item = {
  id: "item_00001",
  name: "1998 Downtown Kobe Bryant #14",
  player: "Kobe Bryant",
  year: 1998,
  setName: "Downtown",
  grade: 8.5,
  priceCents: 41614,
  category: "card",
  imageUrl: "https://example.com/kobe.jpg",
  updatedAt: "2020-01-01T00:00:00.000Z",
};

describe("ItemCard", () => {
  it("renders the name and formats the price from cents", () => {
    renderWithProviders(<ItemCard item={item} onSelect={() => {}} />);

    // getByText: the name is plain content, so a text query is the natural fit.
    expect(screen.getByText(item.name)).toBeInTheDocument();

    // The component formats 41614 cents as "$416.14" — assert the formatted
    // output, not the raw number, so a formatting regression is caught.
    expect(screen.getByText("$416.14")).toBeInTheDocument();
  });

  it("calls onSelect with the item id when clicked", async () => {
    const onSelect = vi.fn();
    // userEvent.setup() gives realistic user interaction (pointer events,
    // focus, etc.) — preferred over the older fireEvent for click/type.
    const user = userEvent.setup();

    renderWithProviders(<ItemCard item={item} onSelect={onSelect} />);

    // QUERY PRIORITY (Testing Library's recommended order, most → least
    // preferred):
    //   1. getByRole            - how assistive tech sees it; use this first
    //   2. getByLabelText       - form fields
    //   3. getByPlaceholderText
    //   4. getByText            - non-interactive content
    //   5. getByDisplayValue
    //   ... last resort: getByTestId (couples the test to an implementation
    //   detail, invisible to users).
    // The card's <img> exposes role="img" with its accessible name from `alt`,
    // so we click it by role. The click bubbles up to the Card's onClick.
    await user.click(screen.getByRole("img", { name: item.name }));

    // Assert the handler fired with the id specifically — not just that it was
    // called — so a bug passing the wrong argument is caught.
    expect(onSelect).toHaveBeenCalledWith(item.id);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

// A11y note worth saying out loud: the whole Card is clickable but it's a
// <div>, not a <button>, so keyboard users can't activate it and there's no
// button role to query. In a real review I'd make the card a button (or wrap
// the content in one) — the test would then use getByRole("button").
