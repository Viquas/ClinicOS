import { describe, expect, it } from "vitest";
import { rxDisplayCode } from "./rx-code";

describe("rxDisplayCode", () => {
  it("formats the first 8 hex chars as XXXX-XXXX", () => {
    expect(rxDisplayCode("1d3c4447-2917-4760-892b-3dc76f9f3ec2")).toBe(
      "1D3C-4447",
    );
  });

  it("ignores dashes in the input", () => {
    expect(rxDisplayCode("a6efea0c41364b70ae3101a4b8935fa4")).toBe("A6EF-EA0C");
  });
});
