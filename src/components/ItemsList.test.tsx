import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { CircularProgress, Alert } from "@mui/material";
import { http, HttpResponse } from "msw";
import { renderWithProviders } from "@/test/renderWithProviders";
import { fetchItems } from "@/api/items";
import { server } from "@/mocks/server";

// A minimal harness that mirrors the marketplace's DATA layer (useInfiniteQuery
// + fetchItems + loading/error/list states) without the virtualization, router,
// context and EventSource coupling.
//
// Why not render the real MarketplaceGrid? jsdom has no layout engine —
// elements report 0x0 — so @tanstack/react-virtual computes an empty visible
// window and renders zero rows, making list assertions impossible. In a real
// codebase the fix is to extract the presentational list into its own
// component and test THAT; here we test the query states directly.
function ItemsList() {
  const { data, isLoading, isError } = useInfiniteQuery({
    queryKey: ["test-items"],
    queryFn: ({ pageParam, signal }) =>
      fetchItems({ limit: 20, cursor: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor,
  });

  if (isLoading) return <CircularProgress />; // MUI gives this role="progressbar"
  if (isError) return <Alert severity="error">Failed to load</Alert>;

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

describe("items list states", () => {
  it("shows a loading indicator first, then the items", async () => {
    renderWithProviders(<ItemsList />);

    // Synchronous assertion: on first render the query is pending, so the
    // spinner is in the DOM right away. getByRole because a progressbar has a
    // real ARIA role.
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    // findBy* returns a promise that retries until the element appears (or
    // times out) — the correct tool for "after the async fetch resolves".
    // Prefer findBy* over waitFor(() => getBy...) — it's the same waiting
    // behaviour with a clearer intent and better error messages.
    expect(await screen.findByText("Test Card A")).toBeInTheDocument();
    expect(screen.getByText("Test Card B")).toBeInTheDocument();

    // The spinner is gone once data has rendered. queryBy* (not getBy*) is the
    // right query for asserting ABSENCE — getBy* throws if the element is
    // missing, queryBy* returns null.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows an error state when the request 500s", async () => {
    // Override the default happy-path handler just for this test. afterEach's
    // resetHandlers() (in vitest.setup.ts) undoes it afterwards.
    server.use(
      http.get("*/api/items", () =>
        HttpResponse.json({ error: "upstream exploded" }, { status: 500 }),
      ),
    );

    renderWithProviders(<ItemsList />);

    // Because renderWithProviders sets retry: false, the 500 surfaces as an
    // error immediately instead of after 3 retries.
    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
  });
});
