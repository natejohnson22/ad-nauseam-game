extends Node
class_name Progression
## Engagement (XP) -> level -> "pick 1 of 3" upgrades. The pick-under-pressure
## loop is the protected core of Prototype 1. Applies chosen upgrades to the
## player and the weapon manager.

signal xp_changed(current: int, needed: int, level: int)
signal leveled_up(choices: Array)   # Array[UpgradeData]; run pauses while shown

var level := 1
var xp := 0
var xp_needed := 5

var _pool: Array = []          # Array[UpgradeData]
var _stacks := {}              # id -> count taken
var _player: Player
var _weapons: WeaponManager

func setup(player: Player, weapons: WeaponManager, pool: Array) -> void:
	_player = player
	_weapons = weapons
	_pool = pool
	xp_changed.emit(xp, xp_needed, level)

func add_engagement(value: int) -> void:
	xp += value
	var leveled := false
	while xp >= xp_needed:
		xp -= xp_needed
		_level_up_number()
		leveled = true
	xp_changed.emit(xp, xp_needed, level)
	if leveled:
		leveled_up.emit(_roll_choices(3))

func _level_up_number() -> void:
	level += 1
	xp_needed = int(round(xp_needed * 1.35)) + 1

func _roll_choices(n: int) -> Array:
	var avail := _pool.filter(
		func(u: UpgradeData) -> bool: return int(_stacks.get(u.id, 0)) < u.max_stacks
	)
	avail.shuffle()
	return avail.slice(0, mini(n, avail.size()))

func apply_upgrade(u: UpgradeData) -> void:
	_stacks[u.id] = int(_stacks.get(u.id, 0)) + 1
	match u.effect:
		"weapon_damage_add":
			_weapons.mod_damage(u.target_weapon_id, u.amount)
		"weapon_cooldown_mult":
			_weapons.mod_cooldown_mult(u.target_weapon_id, u.amount)
		"weapon_arc_add":
			_weapons.mod_arc(u.target_weapon_id, u.amount)
		"weapon_projectile_add":
			_weapons.mod_projectiles(u.target_weapon_id, int(u.amount))
		"player_speed_mult":
			_player.speed_mult *= u.amount
		"player_cooldown_mult":
			_weapons.cooldown_mult *= u.amount
