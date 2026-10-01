import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE, createSessionToken, verifySessionToken } from "./session";

const KEY = "test-secret";

describe("session token", () => {
  it("returns the user id of a fresh token", async () => {
    const token = await createSessionToken(42, 1000, KEY);
    expect(await verifySessionToken(token, 2000, KEY)).toBe(42);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(1, 0, KEY);
    expect(await verifySessionToken(token, SESSION_MAX_AGE * 1000 + 1, KEY)).toBeNull();
  });

  it("rejects a tampered token or another key", async () => {
    const token = await createSessionToken(1, 0, KEY);
    const [, expires, sig] = token.split(".");
    expect(await verifySessionToken(`2.${expires}.${sig}`, 0, KEY)).toBeNull();
    expect(await verifySessionToken(token, 0, "other")).toBeNull();
    expect(await verifySessionToken(undefined, 0, KEY)).toBeNull();
    expect(await verifySessionToken("garbage", 0, KEY)).toBeNull();
  });
});
