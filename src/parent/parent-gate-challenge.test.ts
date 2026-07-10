import { describe, it, expect } from "vitest";
import {
  MIN_CODE_LENGTH,
  isGateAnswerCorrect,
  makeGateChallenge,
} from "./parent-gate-challenge.js";

/** A deterministic rng that walks through a fixed list of values. */
function seededRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

describe("makeGateChallenge", () => {
  it("produces a code of the requested length, at least the minimum", () => {
    expect(makeGateChallenge(Math.random, 6).code).toHaveLength(6);
    expect(makeGateChallenge(Math.random, 1).code).toHaveLength(MIN_CODE_LENGTH);
  });

  it("produces only digits", () => {
    expect(makeGateChallenge().code).toMatch(/^[0-9]+$/);
  });

  it("is deterministic for a fixed rng", () => {
    // 0.05->0, 0.15->1, 0.25->2, 0.35->3
    const rng = seededRng([0.05, 0.15, 0.25, 0.35]);
    expect(makeGateChallenge(rng, 4).code).toBe("0123");
  });

  it("tolerates a misbehaving rng without throwing", () => {
    const rng = seededRng([-1, 2, Number.NaN, 0.99999]);
    const { code } = makeGateChallenge(rng, 4);
    expect(code).toMatch(/^[0-9]{4}$/);
  });
});

describe("isGateAnswerCorrect", () => {
  it("accepts only an exact match", () => {
    const challenge = { code: "4729" };
    expect(isGateAnswerCorrect(challenge, "4729")).toBe(true);
    expect(isGateAnswerCorrect(challenge, "4720")).toBe(false);
    expect(isGateAnswerCorrect(challenge, "472")).toBe(false);
    expect(isGateAnswerCorrect(challenge, "47290")).toBe(false);
    expect(isGateAnswerCorrect(challenge, "")).toBe(false);
  });
});
