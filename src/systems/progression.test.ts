import { describe, expect, it } from "vitest";
import { startOf } from "../content/phases";
import type { UpgradeData } from "../content/types";
import type { Upgrade, UpgradeId } from "../content/upgrades";
import { UPGRADE_POOL } from "../content/upgrades";
import type { WeaponId } from "../content/weapons";
import {
  Progression,
  type RunClock,
  type SpeedTarget,
  type UpgradeTarget,
} from "./progression";

/**
 * The four things the map scopes for slice 2: the XP curve, stack caps,
 * roll-3-of-pool filtering, and upgrade-effect dispatch. `progression.gd` is the
 * reference these assert against.
 *
 * Issue #32 adds the three that decide *when* a pick may be offered — the phase
 * gate, the weapon gate, and the guaranteed offer — which is why the fakes below
 * grew a clock and a notion of which weapons this run owns.
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
  readonly calls: [string, string, number?][] = [];

  /**
   * What this run is carrying. Defaults to **both** weapons, which is what
   * every pre-#32 test assumed when `create` equipped the pair at t=0 — the
   * gate tests below hand `build` a fake holding only the sword instead.
   */
  constructor(readonly owned = new Set<WeaponId>(["adblock_sword", "dnt_boomerang"])) {}

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
  grantWeapon(id: WeaponId): void {
    this.owned.add(id);
    this.calls.push(["grantWeapon", id]);
  }
  hasWeapon(id: WeaponId): boolean {
    return this.owned.has(id);
  }
}

/** A run that has only ever held the starting sword — the real 0:00 state. */
const swordOnly = (): FakeWeapons => new FakeWeapons(new Set<WeaponId>(["adblock_sword"]));

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
  /**
   * Mutable on purpose: the gate tests move the clock between two rolls on one
   * `Progression`, which is the thing a fresh instance per elapsed time could
   * not show — a gate has to *open* mid-run, not merely read open.
   */
  clock: RunClock & { elapsed: number } = { elapsed: 0 },
  weapons: FakeWeapons = new FakeWeapons(),
): {
  progression: Progression;
  bus: FakeBus;
  weapons: FakeWeapons;
  hero: SpeedTarget;
  clock: { elapsed: number };
} {
  const bus = new FakeBus();
  const hero = player();
  return {
    progression: new Progression(hero, weapons, clock, pool, bus, random),
    bus,
    weapons,
    hero,
    clock,
  };
}

/** Levels the player up once and reports what came out, in offered order. */
function roll(progression: Progression, bus: FakeBus): string[] {
  progression.addEngagement(progression.xpNeeded);
  return bus.lastChoices().map((u) => u.id);
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
  it("takes every shipped upgrade to its cap and empties the pool", () => {
    // The clock is parked past the last gate and both weapons are owned, so
    // nothing is held back by #32's gates and the caps are the only ceiling.
    const { progression, bus } = build(UPGRADE_POOL, inOrder, { elapsed: startOf("god_tier") });
    expect(UPGRADE_POOL).toHaveLength(7);

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

  it("routes a weapon grant to grantWeapon, by id alone", () => {
    const { progression, weapons } = build(UPGRADE_POOL, inOrder, { elapsed: 0 }, swordOnly());
    progression.applyUpgrade(
      entry("grant_boomerang", {
        effect: { kind: "grant_weapon", weapon: "dnt_boomerang" },
      }),
    );

    // The id and nothing else: `WeaponManager` owns the `WEAPONS` lookup, so no
    // weapon numbers cross this seam (issue #32).
    expect(weapons.calls).toEqual([["grantWeapon", "dnt_boomerang"]]);
    expect(weapons.hasWeapon("dnt_boomerang")).toBe(true);
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
      // The two damage amounts are x10 with the rest of the HP/damage family
      // (issue #25); the arc is not, being outside it.
      ["modDamage", "adblock_sword", 60],
      ["modArc", "adblock_sword", 25],
      ["grantWeapon", "dnt_boomerang"],
      ["modDamage", "dnt_boomerang", 50],
      ["modProjectiles", "dnt_boomerang", 1],
    ]);
    expect(hero.speedMult).toBeCloseTo(1.12, 10);
    expect(weapons.cooldownMult).toBeCloseTo(0.9, 10);
  });
});

// ------------------------------------------------------------- phase gates

/**
 * `unlockedFrom` — the declared half of issue #32's gating. Written as a
 * `PhaseId` rather than a number of seconds so that a tuning pass moving a phase
 * boundary carries its gates with it.
 */
describe("the phase gate", () => {
  const gated = entry("gated", { unlockedFrom: "confidence", maxStacks: 3 });
  const ungated = entry("ungated", { maxStacks: 3 });

  it("withholds a gated upgrade before its phase opens", () => {
    const { progression, bus } = build([gated, ungated], inOrder, { elapsed: 0 });
    expect(roll(progression, bus)).toEqual(["ungated"]);
  });

  it("offers it from the instant the phase opens, not a moment sooner", () => {
    const { progression, bus, clock } = build([gated, ungated], inOrder, {
      elapsed: startOf("confidence") - 0.1,
    });
    expect(roll(progression, bus)).toEqual(["ungated"]);

    clock.elapsed = startOf("confidence");
    expect(roll(progression, bus)).toEqual(["gated", "ungated"]);
  });

  it("leaves an ungated upgrade available from 0:00", () => {
    const { progression, bus } = build([ungated], inOrder, { elapsed: 0 });
    expect(roll(progression, bus)).toEqual(["ungated"]);
  });
});

// ------------------------------------------------------------ the weapon gate

/**
 * The inferred half. Nothing declares that "Sharper Signal" needs the boomerang
 * — its effect already says `weapon: "dnt_boomerang"`, and issue #32 refused to
 * write that fact down a second time as a `requires` field. The predicate is
 * read inverted for `grant_weapon`, which is the one arm that wants the weapon
 * *absent*.
 */
describe("the weapon gate", () => {
  const grant = entry("grant", {
    effect: { kind: "grant_weapon", weapon: "dnt_boomerang" },
  });
  const boomerangDamage = entry("boomerang_damage", {
    effect: { kind: "weapon_damage_add", weapon: "dnt_boomerang", amount: 50 },
    maxStacks: 6,
  });
  const swordDamage = entry("sword_damage", {
    effect: { kind: "weapon_damage_add", weapon: "adblock_sword", amount: 60 },
    maxStacks: 6,
  });

  it("withholds a weapon's upgrades while the weapon is unowned", () => {
    const pool = [boomerangDamage, swordDamage];
    const { progression, bus } = build(pool, inOrder, { elapsed: 0 }, swordOnly());
    expect(roll(progression, bus)).toEqual(["sword_damage"]);
  });

  it("releases them the moment the weapon is granted", () => {
    const pool = [grant, boomerangDamage, swordDamage];
    const { progression, bus } = build(pool, inOrder, { elapsed: 0 }, swordOnly());
    expect(roll(progression, bus)).toEqual(["grant", "sword_damage"]);

    progression.applyUpgrade(grant);
    expect(roll(progression, bus)).toEqual(["boomerang_damage", "sword_damage"]);
  });

  it("stops offering the grant once the weapon is owned", () => {
    const { progression, bus } = build([grant, swordDamage], inOrder, { elapsed: 0 });
    // The default fake already holds both weapons, so the grant has nothing
    // to give and must not appear even once.
    expect(roll(progression, bus)).toEqual(["sword_damage"]);
  });

  it("leaves upgrades that target no weapon alone", () => {
    const speed = entry("move_speed", {
      effect: { kind: "player_speed_mult", amount: 1.12 },
      maxStacks: 5,
    });
    const { progression, bus } = build([speed], inOrder, { elapsed: 0 }, swordOnly());
    expect(roll(progression, bus)).toEqual(["move_speed"]);
  });
});

// --------------------------------------------------------- guaranteed offers

/**
 * The boomerang's arrival must not be a dice roll (issue #32): a guaranteed
 * upgrade takes a slot in every roll from the moment its gate opens until it is
 * taken. The player keeps the right to decline — what they lose is the right to
 * never be asked.
 */
describe("guaranteed offers", () => {
  const sure = entry("sure", { guaranteed: true, unlockedFrom: "slow_build" });
  const rest = ["a", "b", "c", "d", "e"].map((id) => entry(id, { maxStacks: 9 }));

  it("takes the first slot once its gate is open", () => {
    const { progression, bus } = build([...rest, sure], inOrder, {
      elapsed: startOf("slow_build"),
    });
    // Last in the pool, first out of the roll — and the other two slots still
    // come from the ordinary shuffle.
    expect(roll(progression, bus)).toEqual(["sure", "a", "b"]);
  });

  it("stays silent while its own gate is shut", () => {
    const { progression, bus } = build([...rest, sure], inOrder, { elapsed: 0 });
    expect(roll(progression, bus)).toEqual(["a", "b", "c"]);
  });

  it("never expires — declining it three times over still offers it a fourth", () => {
    const { progression, bus } = build([...rest, sure], inOrder, {
      elapsed: startOf("slow_build"),
    });
    for (let i = 0; i < 4; i++) {
      expect(roll(progression, bus)[0]).toBe("sure");
    }
  });

  it("gives its slot back the moment it is taken", () => {
    const { progression, bus } = build([...rest, sure], inOrder, {
      elapsed: startOf("slow_build"),
    });
    expect(roll(progression, bus)).toEqual(["sure", "a", "b"]);

    progression.applyUpgrade(sure);
    expect(roll(progression, bus)).toEqual(["a", "b", "c"]);
  });

  it("still shuffles the slots it does not occupy", () => {
    // r = 0 sends every Fisher-Yates swap to index 0, so the tail is emphatically
    // reordered while the guaranteed head is not.
    const { progression, bus } = build([...rest, sure], () => 0, {
      elapsed: startOf("slow_build"),
    });
    const ids = roll(progression, bus);
    expect(ids[0]).toBe("sure");
    expect(new Set(ids).size).toBe(3);
  });
});

// ------------------------------------------------- the shipped pool, in order

/**
 * The three rules meeting the real content — the thing a run actually plays.
 * Everything here is asserted against `UPGRADE_POOL` rather than a shaped pool,
 * because the whole point of issue #32 is what the *first six minutes* offer.
 */
describe("the shipped pool through the opening", () => {
  it("offers nothing boomerang-shaped in Quick start", () => {
    const { progression, bus } = build(UPGRADE_POOL, inOrder, { elapsed: 0 }, swordOnly());
    const ids = roll(progression, bus);

    expect(ids).toEqual(["sword_damage", "sword_arc", "move_speed"]);
  });

  it("leads with the boomerang from Slow build until it is taken", () => {
    const { progression, bus, weapons } = build(
      UPGRADE_POOL,
      inOrder,
      { elapsed: startOf("slow_build") },
      swordOnly(),
    );
    expect(roll(progression, bus)[0]).toBe("grant_boomerang");
    expect(roll(progression, bus)[0]).toBe("grant_boomerang");

    const grant = UPGRADE_POOL.find((u) => u.id === "grant_boomerang");
    progression.applyUpgrade(grant!);
    expect(weapons.hasWeapon("dnt_boomerang")).toBe(true);
    expect(roll(progression, bus)).not.toContain("grant_boomerang");
  });

  /**
   * The boomerang family alone, in shipped order. Three records and three slots,
   * so what comes out is exactly what is *eligible* — the whole pool would let a
   * gate look shut when Multi-Track had merely placed fifth in a roll of three.
   */
  const boomerangFamily = UPGRADE_POOL.filter((u) => u.id.includes("boomerang"));

  it("holds multi-track back past the boomerang itself, until Confidence", () => {
    const { progression, bus } = build(
      boomerangFamily,
      inOrder,
      { elapsed: startOf("slow_build") },
      swordOnly(),
    );
    progression.applyUpgrade(boomerangFamily[0]!);

    // Owned, so "Sharper Signal" is live — but Multi-Track carries a phase gate
    // on top of the ownership one, and Slow build is not Confidence.
    expect(roll(progression, bus)).toEqual(["boomerang_damage"]);
  });

  it("releases multi-track in Confidence, once both its conditions hold", () => {
    const { progression, bus, clock } = build(
      boomerangFamily,
      inOrder,
      { elapsed: startOf("slow_build") },
      swordOnly(),
    );
    progression.applyUpgrade(boomerangFamily[0]!);

    clock.elapsed = startOf("confidence");
    expect(roll(progression, bus)).toEqual(["boomerang_damage", "boomerang_projectile"]);
  });

  it("never releases multi-track to a player who declined the boomerang", () => {
    // Deep into Confidence, phase gate wide open, weapon never taken.
    const { progression, bus } = build(
      boomerangFamily,
      inOrder,
      { elapsed: startOf("confidence") + 60 },
      swordOnly(),
    );
    expect(roll(progression, bus)).toEqual(["grant_boomerang"]);
  });
});
