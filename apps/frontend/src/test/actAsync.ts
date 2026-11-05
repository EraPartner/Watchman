import { act } from "react";

/**
 * Runs `fn` inside React's async `act()` and lets pending microtasks settle
 * before returning: the same as `await act(async () => fn())`, written so
 * the callback does not need an `async` keyword without an `await`.
 */
export async function actAsync(fn: () => unknown): Promise<void> {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}
