import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { theme } from "@/theme";
import type { ReactElement, ReactNode } from "react";

// A FRESH QueryClient per render. Sharing one client across tests would leak
// cache between them (one test's fetched data showing up in another) and make
// them order-dependent — the classic flaky-test trap.
//
// retry: false is the important bit for error-state tests: React Query retries
// failed queries 3x by default with backoff, so a mocked 500 would take
// seconds to finally surface as an error. Turning retries off makes it fail
// immediately and deterministically.
function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Wraps whatever component-under-test in the same providers the real app uses,
// so hooks like useQuery / useTheme work in the test. Returns the client too,
// in case a test wants to seed or inspect the cache directly.
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  const client = makeTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  }

  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
