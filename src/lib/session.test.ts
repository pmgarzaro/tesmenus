import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session";

const KEY = "test-secret";

describe("session token", () => {
  it("accepts a fresh token", async () => {
    const token = await createSessionToken(1000, KEY);
    expect(await verifySessionToken(token, 2000, KEY)).toBe(true);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(0, KEY);
    expect(await verifySessionToken(token, SESSION_MAX_AGE * 1000 + 1, KEY)).toBe(false);
  });

  it("rejects a tampered token or another key", async () => {
    const token = await createSessionToken(0, KEY);
    const [, sig] = token.split(".");
    expect(await verifySessionToken(`99999999999999.${sig}`, 0, KEY)).toBe(false);
    expect(await verifySessionToken(token, 0, "other")).toBe(false);
    expect(await verifySessionToken(undefined, 0, KEY)).toBe(false);
  });
});
