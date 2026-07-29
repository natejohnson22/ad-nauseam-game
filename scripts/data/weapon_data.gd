extends Resource
class_name WeaponData
## Tunable numbers for a weapon. Behavior lives in scripts/weapons/*; only the
## knobs we retune every playtest live here so they can be edited in the
## inspector and swapped/added without touching code.

@export var id: StringName = &"weapon"
@export var display_name: String = "Weapon"
@export_enum("melee", "ranged") var kind: String = "melee"

@export_group("Combat")
@export var base_damage: float = 10.0
@export var cooldown: float = 1.0          ## seconds between auto-fires
@export var knockback: float = 120.0

@export_group("Melee")
@export var reach: float = 120.0           ## radius of the cleave
@export var arc_degrees: float = 90.0      ## width of the cleave arc

@export_group("Ranged")
@export var projectile_speed: float = 420.0
@export var travel_distance: float = 300.0 ## how far out before it returns (boomerang)
@export var projectile_count: int = 1

@export_group("Placeholder Art")
@export var color: Color = Color(0.9, 0.9, 0.9)
