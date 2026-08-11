import { describe, expect, it } from "vitest";
import { RUN_LENGTH } from "../content/phases";
import {
  MAX_PICKS,
  MAX_TIME_SCALE,
  isConfigured,
  parseDevConfig,
} from "./dev-config";

/**
 * The seek grammar is the whole of what is worth testing here: three spellings
 * that must agree, and a clamp. `?at=15:00` read as fifteen seconds would look
 * exactly like the Panic phase being too quiet.
 */
describe("parseDevConfig", () => {
  it("starts a plain run at the top, in real time, mortal", () => {
    const config = parseDevConfig("");
    expect(config).toEqual({
      startAt: 0,
      timeScale: 1,
      invulnerable: false,
      picks: 0,
      problems: [],
    });
    expect(isConfigured(config)).toBe(false);
  });

  it("seeks by phase id — the reason a phase has one", () => {
    expect(parseDevConfig("?at=panic").startAt).toBe(900);
    expect(parseDevConfig("?at=quick_start").startAt).toBe(0);
    expect(parseDevConfig("?at=god_tier").startAt).toBe(1500);
  });

  it("seeks by clock reading, minutes and seconds", () => {
    expect(parseDevConfig("?at=15:00").startAt).toBe(900);
    expect(parseDevConfig("?at=0:30").startAt).toBe(30);
    expect(parseDevConfig("?at=25:45").startAt).toBe(1545);
  });

  it("seeks by plain seconds", () => {
    expect(parseDevConfig("?at=900").startAt).toBe(900);
  });

  it("keeps the seek inside the run, short of the ending", () => {
    expect(parseDevConfig("?at=99999").startAt).toBe(RUN_LENGTH - 1);
    expect(parseDevConfig("?at=-60").startAt).toBe(0);
  });

  it("reports an unreadable seek rather than silently starting at zero", () => {
    const config = parseDevConfig("?at=panci");
    expect(config.startAt).toBe(0);
    expect(config.problems).toHaveLength(1);
    expect(config.problems[0]).toContain("panci");
    expect(isConfigured(config)).toBe(true);
  });

  it("takes a time scale, clamped", () => {
    expect(parseDevConfig("?speed=4").timeScale).toBe(4);
    expect(parseDevConfig("?speed=0.25").timeScale).toBe(0.25);
    expect(parseDevConfig("?speed=9000").timeScale).toBe(MAX_TIME_SCALE);
  });

  it("rejects a time scale that would stop or reverse the clock", () => {
    expect(parseDevConfig("?speed=0").timeScale).toBe(1);
    expect(parseDevConfig("?speed=-2").timeScale).toBe(1);
    expect(parseDevConfig("?speed=fast").problems).toHaveLength(1);
  });

  it("treats invuln as a bare flag", () => {
    expect(parseDevConfig("?invuln").invulnerable).toBe(true);
    expect(parseDevConfig("?invuln=1").invulnerable).toBe(true);
    expect(parseDevConfig("?invuln=0").invulnerable).toBe(false);
    expect(parseDevConfig("?invuln=false").invulnerable).toBe(false);
    expect(parseDevConfig("").invulnerable).toBe(false);
  });

  it("grants a whole number of picks after the seek", () => {
    expect(parseDevConfig("?picks=8").picks).toBe(8);
    expect(parseDevConfig("?picks=0").picks).toBe(0);
    expect(parseDevConfig("").picks).toBe(0);
  });

  it("clamps an absurd pick count to a typo, not a build", () => {
    expect(parseDevConfig("?picks=9999").picks).toBe(MAX_PICKS);
  });

  it("reports a non-integer or negative pick count rather than rounding it", () => {
    expect(parseDevConfig("?picks=eight").picks).toBe(0);
    expect(parseDevConfig("?picks=eight").problems).toHaveLength(1);
    expect(parseDevConfig("?picks=3.5").problems).toHaveLength(1);
    expect(parseDevConfig("?picks=-2").picks).toBe(0);
    expect(parseDevConfig("?picks=-2").problems).toHaveLength(1);
  });

  it("counts a pick grant as a configured run", () => {
    expect(isConfigured(parseDevConfig("?picks=8"))).toBe(true);
  });

  it("reads a full harness URL", () => {
    const config = parseDevConfig("?at=panic&speed=4&invuln&picks=8");
    expect(config).toEqual({
      startAt: 900,
      timeScale: 4,
      invulnerable: true,
      picks: 8,
      problems: [],
    });
  });
});
