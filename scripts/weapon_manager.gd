extends Node2D
class_name WeaponManager
## Holds the player's equipped weapons, ticks their cooldowns, and auto-fires
## each one at the nearest enemy. Stores a duplicate() of each WeaponData so
## level-up upgrades mutate the run copy, never the saved .tres asset.
##
## Parented to the player, so its origin follows the player. Melee swings are
## added as children (stay on the player); projectiles go to the arena.

var cooldown_mult := 1.0

var _weapons: Array = []   # [{data: WeaponData, cd: float}]
var _player: Node2D
var _arena: Node

func setup(player: Node2D, arena: Node) -> void:
	_player = player
	_arena = arena

func add_weapon(data: WeaponData) -> void:
	_weapons.append({"data": data.duplicate(), "cd": 0.15})

func has_weapon(id: StringName) -> bool:
	return get_weapon_data(id) != null

func get_weapon_data(id: StringName) -> WeaponData:
	for w in _weapons:
		if w.data.id == id:
			return w.data
	return null

func _process(delta: float) -> void:
	for w in _weapons:
		w.cd -= delta
		if w.cd <= 0.0:
			_fire(w.data)
			w.cd = maxf(0.05, w.data.cooldown * cooldown_mult)

func _fire(data: WeaponData) -> void:
	var dir := _aim_dir()
	if data.kind == "melee":
		var s := SwordSwing.new()
		add_child(s)
		s.setup(data, dir, _player)
	else:
		var count: int = maxi(1, data.projectile_count)
		for i in count:
			var spread := deg_to_rad(16.0) * (i - (count - 1) * 0.5)
			var b := Boomerang.new()
			_arena.add_child(b)
			b.global_position = _player.global_position
			b.setup(data, dir.rotated(spread), _player)

func _aim_dir() -> Vector2:
	var nearest := _nearest_enemy()
	if nearest:
		return (nearest.global_position - _player.global_position).normalized()
	var mv: Vector2 = Controls.get_move_vector()
	return mv.normalized() if mv.length() > 0.1 else Vector2.RIGHT

func _nearest_enemy() -> Node2D:
	var best: Node2D = null
	var best_d := INF
	for e in get_tree().get_nodes_in_group("enemies"):
		var d: float = _player.global_position.distance_squared_to(e.global_position)
		if d < best_d:
			best_d = d
			best = e
	return best

# --- Upgrade hooks (called by Progression) ---

func mod_damage(id: StringName, amount: float) -> void:
	var d := get_weapon_data(id)
	if d: d.base_damage += amount

func mod_cooldown_mult(id: StringName, m: float) -> void:
	var d := get_weapon_data(id)
	if d: d.cooldown *= m

func mod_arc(id: StringName, amount: float) -> void:
	var d := get_weapon_data(id)
	if d: d.arc_degrees += amount

func mod_projectiles(id: StringName, n: int) -> void:
	var d := get_weapon_data(id)
	if d: d.projectile_count += n
