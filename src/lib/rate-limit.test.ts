import { describe, expect, it } from "vitest";
import { hit, reset } from "./rate-limit";

describe("rate limit", () => {
  it("blocks after the limit until the window ends", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("k", 3, 15 * 60_000, t0)).toBe(0);
    expect(hit("k", 3, 15 * 60_000, t0 + 60_000)).toBe(14);
    expect(hit("k", 3, 15 * 60_000, t0 + 15 * 60_000)).toBe(0); // new window
    reset("k");
    expect(hit("k", 3, 15 * 60_000, t0)).toBe(0);
  });
});
