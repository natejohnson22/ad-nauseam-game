extends Resource
class_name UpgradeData
## One option in the level-up "pick 1 of 3" pool. Interpreted by
## ProgressionSystem.apply_upgrade(). Kept deliberately small for Prototype 1.

@export var id: StringName = &"upgrade"
@export var title: String = "Upgrade"
@export_multiline var description: String = ""

## What the pick changes.
##  weapon_damage_add     : +amount base_damage to target weapon
##  weapon_cooldown_mult  : *amount cooldown of target weapon (e.g. 0.85 = faster)
##  weapon_arc_add        : +amount degrees to a melee weapon's cleave
##  weapon_projectile_add : +int(amount) projectiles to a ranged weapon
##  player_speed_mult     : *amount player move speed
##  player_cooldown_mult  : *amount ALL weapon cooldowns
@export_enum(
	"weapon_damage_add",
	"weapon_cooldown_mult",
	"weapon_arc_add",
	"weapon_projectile_add",
	"player_speed_mult",
	"player_cooldown_mult"
) var effect: String = "weapon_damage_add"

## Weapon this targets (for weapon_* effects). Empty for player_* effects.
@export var target_weapon_id: StringName = &""
@export var amount: float = 1.0

## How many times this pick may be taken in one run (keeps the pool fresh).
@export var max_stacks: int = 5
