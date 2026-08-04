import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounceValue } from "./useDebounceValue";

describe("useDebounceValue", () => {
  // Fake timers let us control setTimeout deterministically instead of really
  // waiting 500ms. Install before each test, restore real timers after so
  // other test files aren't affected.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the initial value immediately", () => {
    // renderHook runs a hook in isolation, no component needed. result.current
    // is the hook's latest return value.
    const { result } = renderHook(() => useDebounceValue("a", 500));
    expect(result.current).toBe("a");
  });

  it("only updates after the delay, skipping intermediate values", () => {
    // Pass props into the hook so we can rerender with new values, mimicking a
    // user typing "a" -> "ab" -> "abc" quickly.
    const { result, rerender } = renderHook(
      ({ value }) => useDebounceValue(value, 500),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "ab" });
    rerender({ value: "abc" });

    // Before the timer fires, the debounced value is still the original. Each
    // rerender cleared the previous timeout, so only the LAST one is pending.
    expect(result.current).toBe("a");

    // act() wraps state updates that happen as a result of advancing timers, so
    // React flushes them before we assert.
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe("a"); // one ms short — still not fired

    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Jumps straight to "abc": the intermediate "ab" never became the debounced
    // value, which is the whole point of debouncing.
    expect(result.current).toBe("abc");
  });
});
