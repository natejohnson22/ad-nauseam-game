import { describe, expect, it } from "vitest";
import { facingXY } from "./facing";

describe("facingXY", () => {
  it("picks the dominant axis", () => {
    expect(facingXY(3, 1)).toBe("right");
    expect(facingXY(-3, 1)).toBe("left");
    expect(facingXY(1, 3)).toBe("down");
    expect(facingXY(1, -3)).toBe("up");
  });

  it("breaks a pure diagonal toward the vertical axis", () => {
    expect(facingXY(1, 1)).toBe("down");
    expect(facingXY(-1, 1)).toBe("down");
    expect(facingXY(1, -1)).toBe("up");
    expect(facingXY(-1, -1)).toBe("up");
  });

  it("reads a swing's aim the same way as a move vector", () => {
    // cos/sin of an angle just under the -x axis → faces left (the prototype's
    // −161° case); straight down → faces down.
    expect(facingXY(Math.cos(Math.PI * 0.9), Math.sin(Math.PI * 0.9))).toBe(
      "left",
    );
    expect(facingXY(0, 1)).toBe("down");
  });
});
