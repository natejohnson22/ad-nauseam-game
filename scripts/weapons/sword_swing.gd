extends Node2D
class_name SwordSwing
## AdBlock+ Sword attack: an instantaneous cleave. Deals damage once on spawn to
## every enemy inside a wedge (reach + arc) facing `dir`, then lingers ~0.18s
## purely as a visual. Parented to the player so it sits at the player's origin.

const LIFE := 0.18

var _reach := 120.0
var _arc := 90.0
var _dir := Vector2.RIGHT
var _color := Color.WHITE
var _life := LIFE

func setup(data: WeaponData, dir: Vector2, _source: Node2D) -> void:
	_reach = data.reach
	_arc = data.arc_degrees
	_dir = dir.normalized() if dir.length() > 0.001 else Vector2.RIGHT
	_color = data.color

	var half := deg_to_rad(_arc) * 0.5
	for e in get_tree().get_nodes_in_group("enemies"):
		var to: Vector2 = e.global_position - global_position
		var body: float = (e.data.radius if e is Enemy else 0.0)
		if to.length() <= _reach + body and absf(_dir.angle_to(to)) <= half:
			e.take_damage(data.base_damage, global_position, data.knockback)

func _process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0:
		queue_free()
	else:
		queue_redraw()

func _draw() -> void:
	var half := deg_to_rad(_arc) * 0.5
	var a0 := _dir.angle() - half
	var pts := PackedVector2Array()
	pts.append(Vector2.ZERO)
	var steps := 14
	for i in steps + 1:
		var a: float = a0 + deg_to_rad(_arc) * (float(i) / steps)
		pts.append(Vector2(cos(a), sin(a)) * _reach)
	var fade := _life / LIFE
	draw_colored_polygon(pts, Color(_color.r, _color.g, _color.b, 0.35 * fade))
