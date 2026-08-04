import { describe, expect, it } from "vitest";
import type { UpgradeData } from "../content/types";
import type { Upgrade, UpgradeId } from "../content/upgrades";
import { UPGRADE_POOL } from "../content/upgrades";
import { Progression, type SpeedTarget, type UpgradeTarget } from "./progression";

/**
 * The four things the map scopes for slice 2: the XP curve, stack caps,
 * roll-3-of-pool filtering, and upgrade-effect dispatch. `progression.gd` is the
 * reference these assert against.
 *
 * Nothing here imports Phaser. `Progression` takes its collaborators as narrow
 * interfaces and its bus as `Pick<GameBus, "emit">`, so the fakes below are the
 * whole harness — which is the reason the class was kept Phaser-free.
 */

// ------------------------------------------------------------------- fakes

class FakeBus {
  readonly emitted: { event: string; args: unknown[] }[] = [];

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }

  /** Payloads of every `event` emitted so far, in order. */
  argsFor(event: string): unknown[][] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args);
  }

  /** The most recent `leveledUp` payload. */
  lastChoices(): readonly Upgrade[] {
    const calls = this.argsFor("leveledUp");
    return (calls.at(-1)?.[0] ?? []) as readonly Upgrade[];
  }
}

class FakeWeapons implements UpgradeTarget {
  cooldownMult = 1;
  readonly calls: [string, string, number][] = [];

  modDamage(id: string, amount: number): void {
    this.calls.push(["modDamage", id, amount]);
  }
  modCooldownMult(id: string, mult: number): void {
    this.calls.push(["modCooldownMult", id, mult]);
  }
  modArc(id: string, degrees: number): void {
    this.calls.push(["modArc", id, degrees]);
  }
  modProjectiles(id: string, count: number): void {
    this.calls.push(["modProjectiles", id, count]);
  }
}

const player = (): SpeedTarget => ({ speedMult: 1 });

/** A pool entry with an arbitrary id, so tests can build pools by shape. */
function entry(id: string, data: Partial<UpgradeData> = {}): Upgrade {
  return {
    id: id as UpgradeId,
    data: {
      title: id,
      description: id,
      effect: { kind: "player_speed_mult", amount: 1 },
      maxStacks: 1,
      ...data,
    },
  };
}

/**
 * The identity shuffle: Fisher-Yates picks `floor(r * (i + 1))`, which for
 * r = 0.999 is `i` itself, so every swap is a no-op and the pool's own order
 * survives. Tests that care about *which* three came out use this; the one that
 * cares that shuffling happens at all uses 0, which reorders.
 */
const inOrder = (): number => 0.999;

function build(
  pool: readonly Upgrade[] = UPGRADE_POOL,
  random: () => number = inOrder,
): { progression: Progression; bus: FakeBus; weapons: FakeWeapons; hero: SpeedTarget } {
  const bus = new FakeBus();
  const weapons = new FakeWeapons();
  const hero = player();
  return {
    progression: new Progression(hero, weapons, pool, bus, random),
    bus,
    weapons,
    hero,
  };
}

// -------------------------------------------------------------- the XP curve

describe("the XP curve", () => {
  it("starts at 5 and compounds by round(x * 1.35) + 1", () => {
    const { progression } = build();
    expect(progression.xpNeeded).toBe(Progression.FIRST_LEVEL_XP);

    // 5 -> round(6.75) + 1 = 8 -> round(10.8) + 1 = 12 -> round(16.2) + 1 = 17
    const thresholds = [5, 8, 12, 17];
    for (const [index, needed] of thresholds.entries()) {
      expect(progression.level).toBe(index + 1);
      expect(progression.xpNeeded).toBe(needed);
      progression.addEngagement(needed);
    }
    expect(progression.level).toBe(thresholds.length + 1);
  });

  it("carries the remainder into the next level rather than dropping it", () => {
    const { progression } = build();
    progression.addEngagement(7); // 5 to level, 2 left over
    expect(progression.level).toBe(2);
    expect(progression.xp).toBe(2);
    expect(progression.xpNeeded).toBe(8);
  });

  it("levels twice off one pickup, and still offers exactly one modal", () => {
    const { progression, bus } = build();
    // 5 + 8 = 13 clears both thresholds; the `while` is what makes it two.
    progression.addEngagement(14);

    expect(progression.level).toBe(3);
    expect(progression.xp).toBe(1);
    expect(progression.xpNeeded).toBe(12);
    expect(bus.argsFor("leveledUp")).toHaveLength(1);
  });

  it("emits xpChanged for a pickup that levels nobody up", () => {
    const { progression, bus } = build();
    progression.addEngagement(1);

    // One from the constructor, one from the pickup.
    expect(bus.argsFor("xpChanged")).toEqual([
      [0, 5, 1],
      [1, 5, 1],
    ]);
    expect(bus.argsFor("leveledUp")).toHaveLength(0);
  });
});

// ------------------------------------------------------------- stack caps

describe("stack caps", () => {
  it("counts every take", () => {
    const { progression } = build();
    const upgrade = entry("sword_damage", { maxStacks: 6 });

    expect(progression.stacksOf(upgrade.id)).toBe(0);
    progression.applyUpgrade(upgrade);
    progression.applyUpgrade(upgrade);
    expect(progression.stacksOf(upgrade.id)).toBe(2);
  });

  it("drops an upgrade from the pool once it is capped", () => {
    const capped = entry("capped", { maxStacks: 1 });
    const open = entry("open", { maxStacks: 3 });
    const { progression, bus } = build([capped, open]);

    progression.addEngagement(5);
    expect(bus.lastChoices().map((u) => u.id)).toEqual(["capped", "open"]);

    progression.applyUpgrade(capped);
    progression.addEngagement(8);
    expect(bus.lastChoices().map((u) => u.id)).toEqual(["open"]);
  });

  /**
   * Slice 5's parity bar, asserted rather than played: all six shipped upgrades
   * reach their caps, and a run that takes every one of them 25 times over ends
   * with nothing left to offer. `main.gd` has no ceiling of its own — the pool
   * emptying is the only thing that ends the choosing.
   */
  it("takes all six shipped upgrades to their caps and empties the pool", () => {
    const { progression, bus } = build();
    expect(UPGRADE_POOL).toHaveLength(6);

    for (const upgrade of UPGRADE_POOL) {
      for (let i = 0; i < upgrade.data.maxStacks; i++) {
        progression.applyUpgrade(upgrade);
      }
      expect(progression.stacksOf(upgrade.id)).toBe(upgrade.data.maxStacks);
    }

    progression.addEngagement(5);
    expect(bus.lastChoices()).toEqual([]);
  });

  it("offers nothing once every upgrade is capped", () => {
    const only = entry("only", { maxStacks: 1 });
    const { progression, bus } = build([only]);

    progression.applyUpgrade(only);
    progression.addEngagement(5);
    expect(bus.lastChoices()).toEqual([]);
  });
});

// ------------------------------------------------------ roll 3 of the pool

describe("rolling three of the pool", () => {
  it("offers at most three, even from a bigger pool", () => {
    const pool = ["a", "b", "c", "d", "e"].map((id) => entry(id));
    const { progression, bus } = build(pool);

    progression.addEngagement(5);
    expect(bus.lastChoices()).toHaveLength(3);
  });

  it("offers three distinct upgrades", () => {
    const pool = ["a", "b", "c", "d", "e"].map((id) => entry(id));
    // 0 makes every swap reach index 0, so the order is emphatically not the
    // pool's — a shuffle that duplicated instead of permuting would show here.
    const { progression, bus } = build(pool, () => 0);

    progression.addEngagement(5);
    const ids = bus.lastChoices().map((u) => u.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("offers the whole pool when it is smaller than three", () => {
    const pool = ["a", "b"].map((id) => entry(id));
    const { progression, bus } = build(pool);

    progression.addEngagement(5);
    expect(bus.lastChoices().map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("draws from the real pool", () => {
    const { progression, bus } = build();
    progression.addEngagement(5);

    const ids = bus.lastChoices().map((u) => u.id);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(UPGRADE_POOL.map((u) => u.id)).toContain(id);
    }
  });
});

// ------------------------------------------------------- effect dispatch

describe("upgrade-effect dispatch", () => {
  it("routes each weapon effect to its hook, with its own number", () => {
    const cases: [UpgradeData["effect"], [string, string, number]][] = [
      [
        { kind: "weapon_damage_add", weapon: "adblock_sword", amount: 6 },
        ["modDamage", "adblock_sword", 6],
      ],
      [
        { kind: "weapon_cooldown_mult", weapon: "adblock_sword", amount: 0.85 },
        ["modCooldownMult", "adblock_sword", 0.85],
      ],
      [
        { kind: "weapon_arc_add", weapon: "adblock_sword", degrees: 25 },
        ["modArc", "adblock_sword", 25],
      ],
      [
        { kind: "weapon_projectile_add", weapon: "dnt_boomerang", count: 1 },
        ["modProjectiles", "dnt_boomerang", 1],
      ],
    ];

    for (const [effect, expected] of cases) {
      const { progression, weapons } = build();
      progression.applyUpgrade(entry("u", { effect }));
      expect(weapons.calls).toEqual([expected]);
    }
  });

  it("multiplies the player's speed rather than setting it", () => {
    const { progression, hero } = build();
    const speed = entry("move_speed", {
      effect: { kind: "player_speed_mult", amount: 1.12 },
      maxStacks: 5,
    });

    progression.applyUpgrade(speed);
    progression.applyUpgrade(speed);
    expect(hero.speedMult).toBeCloseTo(1.12 * 1.12, 10);
  });

  it("routes the global cooldown pick to the weapon manager, not a weapon", () => {
    const { progression, weapons } = build();
    const cooldown = entry("cooldown", {
      effect: { kind: "player_cooldown_mult", amount: 0.9 },
      maxStacks: 5,
    });

    progression.applyUpgrade(cooldown);
    progression.applyUpgrade(cooldown);
    expect(weapons.cooldownMult).toBeCloseTo(0.81, 10);
    expect(weapons.calls).toEqual([]);
  });

  it("applies every upgrade the shipped pool actually contains", () => {
    const { progression, weapons, hero } = build();
    for (const upgrade of UPGRADE_POOL) progression.applyUpgrade(upgrade);

    expect(weapons.calls).toEqual([
      ["modDamage", "adblock_sword", 6],
      ["modArc", "adblock_sword", 25],
      ["modDamage", "dnt_boomerang", 5],
      ["modProjectiles", "dnt_boomerang", 1],
    ]);
    expect(hero.speedMult).toBeCloseTo(1.12, 10);
    expect(weapons.cooldownMult).toBeCloseTo(0.9, 10);
  });
});
