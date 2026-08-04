import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// One MSW server for the whole test run. vitest.setup.ts starts it before all
// tests, resets handlers between tests (so a test's server.use override doesn't
// leak into the next), and closes it at the end.
export const server = setupServer(...handlers);
