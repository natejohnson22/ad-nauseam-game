extends Node2D
class_name Boomerang
## Do Not Track Boomerang: flies out to travel_distance, then homes back to the
## player, damaging enemies on both passes. Per-enemy hit cooldown so a single
## throw can tag the same enemy on the way out and the way back, but not spam it.

const HIT_INTERVAL := 0.3
const RADIUS := 8.0
const CATCH := 16.0

var _speed := 420.0
var _travel := 300.0
var _damage := 10.0
var _knockback := 100.0
var _color := Color.WHITE
var _dir := Vector2.RIGHT

var _returning := false
var _dist_out := 0.0
var _owner: Node2D
var _hit_cd := {}  # Enemy -> seconds until hittable again

func setup(data: WeaponData, dir: Vector2, owner_node: Node2D) -> void:
	_speed = data.projectile_speed
	_travel = data.travel_distance
	_damage = data.base_damage
	_knockback = data.knockback
	_color = data.color
	_dir = dir.normalized() if dir.length() > 0.001 else Vector2.RIGHT
	_owner = owner_node

func _process(delta: float) -> void:
	if not _returning:
		global_position += _dir * _speed * delta
		_dist_out += _speed * delta
		if _dist_out >= _travel:
			_returning = true
	else:
		if _owner and is_instance_valid(_owner):
			var to: Vector2 = _owner.global_position - global_position
			if to.length() <= CATCH:
				queue_free()
				return
			global_position += to.normalized() * _speed * delta
		else:
			queue_free()
			return

	for k in _hit_cd.keys():
		_hit_cd[k] -= delta

	for e in get_tree().get_nodes_in_group("enemies"):
		if _hit_cd.get(e, 0.0) > 0.0:
			continue
		var body: float = (e.data.radius if e is Enemy else 0.0)
		if global_position.distance_to(e.global_position) <= RADIUS + body:
			e.take_damage(_damage, global_position, _knockback)
			_hit_cd[e] = HIT_INTERVAL

	queue_redraw()

func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS, _color)
	draw_arc(Vector2.ZERO, RADIUS + 2.0, 0.0, TAU, 16, Color(_color, 0.5), 2.0)
