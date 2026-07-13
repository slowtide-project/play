import { describe, it, expect } from "vitest";
import { PIN_LENGTH, isValidPin, verifyPin, shuffledKeypad } from "./parent-pin.js";

/** A deterministic rng that walks through a fixed list of values. */
function seededRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

describe("isValidPin", () => {
  it("accepts exactly PIN_LENGTH digits", () => {
    expect(isValidPin("0000")).toBe(true);
    expect(isValidPin("4729")).toBe(true);
    expect(PIN_LENGTH).toBe(4);
  });

  it("rejects wrong length or non-digits", () => {
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("12 4")).toBe(false);
  });
});

describe("verifyPin", () => {
  it("accepts only an exact match against a valid stored PIN", () => {
    expect(verifyPin("4729", "4729")).toBe(true);
    expect(verifyPin("4729", "4720")).toBe(false);
    expect(verifyPin("4729", "472")).toBe(false);
    expect(verifyPin("4729", "")).toBe(false);
  });

  it("never accepts against an invalid stored PIN", () => {
    expect(verifyPin("12a4", "12a4")).toBe(false);
    expect(verifyPin("", "")).toBe(false);
  });
});

describe("shuffledKeypad", () => {
  it("always returns a permutation of the ten digits", () => {
    for (let n = 0; n < 50; n++) {
      const pad = shuffledKeypad();
      expect([...pad].sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    }
  });

  it("is deterministic for a fixed rng", () => {
    const a = shuffledKeypad(seededRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.8, 0.6]));
    const b = shuffledKeypad(seededRng([0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.8, 0.6]));
    expect(a).toEqual(b);
  });

  it("reshuffles: two default draws are very unlikely to be identical", () => {
    // Not a guarantee, but a permutation of 10 has 1/10! chance of repeating.
    let same = 0;
    for (let n = 0; n < 20; n++) {
      const a = shuffledKeypad().join("");
      const b = shuffledKeypad().join("");
      if (a === b) same += 1;
    }
    expect(same).toBe(0);
  });

  it("tolerates a misbehaving rng without throwing or dropping digits", () => {
    const pad = shuffledKeypad(seededRng([-1, 2, Number.NaN, 0.99999, Infinity]));
    expect([...pad].sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });
});
