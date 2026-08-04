import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./src/mocks/server";

// MSW lifecycle, shared across every test file:
//   listen  - start intercepting network calls before any test runs
//   reset   - after each test, drop any per-test server.use(...) overrides so
//             they don't bleed into the next test
//   close   - tear the interceptor down at the very end
beforeAll(() => {
  // onUnhandledRequest: "error" makes a test FAIL loudly if it hits a URL we
  // forgot to mock, instead of silently making a real network call.
  server.listen({ onUnhandledRequest: "error" });

  // Relative-URL fetch shim.
  // Our fetchItems() calls fetch("/api/items?..."). In the browser that
  // resolves against the page origin, but Node's fetch (undici, which vitest
  // uses under jsdom) throws on a relative URL — it demands an absolute one.
  // We install this AFTER server.listen() so it wraps MSW's fetch: the shim
  // prepends a base, then hands the now-absolute URL to MSW to intercept.
  const interceptedFetch = globalThis.fetch;
  globalThis.fetch = ((input, init) => {
    if (typeof input === "string" && input.startsWith("/")) {
      input = "http://localhost" + input;
    }
    return interceptedFetch(input as string | URL | Request, init);
  }) as typeof fetch;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
