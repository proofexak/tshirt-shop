import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's automatic afterEach(cleanup) only registers itself
// when it detects global test hooks (vitest.config.mts doesn't set
// `test.globals: true`, so `afterEach` isn't on globalThis). Without this,
// multiple tests rendering the same component in one file leak DOM nodes
// across tests (e.g. two "S" buttons found by the second test's query).
afterEach(cleanup);
