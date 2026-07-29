extends Node2D
class_name Player
## The User. Reads only the unified movement vector from Controls, so it is
## identical across keyboard, gamepad, and touch. Placeholder art = a circle.

signal health_changed(current: float, maximum: float)
signal died

@export var max_hp := 100.0
@export var base_speed := 220.0

var hp: float
var speed_mult := 1.0

var _radius := 16.0
var _alive := true

func _ready() -> void:
	add_to_group("player")
	hp = max_hp
	health_changed.emit(hp, max_hp)
	queue_redraw()

func _process(delta: float) -> void:
	if not _alive:
		return
	var dir: Vector2 = Controls.get_move_vector()
	position += dir * base_speed * speed_mult * delta
	queue_redraw()

func get_radius() -> float:
	return _radius

func take_damage(amount: float) -> void:
	if not _alive:
		return
	hp = maxf(0.0, hp - amount)
	health_changed.emit(hp, max_hp)
	if hp <= 0.0:
		_alive = false
		died.emit()

func heal(amount: float) -> void:
	if not _alive:
		return
	hp = minf(max_hp, hp + amount)
	health_changed.emit(hp, max_hp)

func _draw() -> void:
	draw_circle(Vector2.ZERO, _radius, Color(0.25, 0.8, 1.0))
	# small facing pip toward current movement, for readability
	var mv: Vector2 = Controls.get_move_vector()
	if mv.length() > 0.1:
		draw_circle(mv.normalized() * (_radius - 5.0), 4.0, Color.WHITE)
