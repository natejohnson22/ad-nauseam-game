extends Node2D
class_name Engagement
## XP pickup dropped by dead enemies. Drifts toward the player once in range,
## then reports its value. "Engagement" is the game's satirical name for XP.

signal collected(value: int)

const ATTRACT_RANGE := 95.0
const COLLECT_RANGE := 18.0
const ATTRACT_SPEED := 340.0

var value: int = 1
var _player: Node2D
var _done := false

func setup(v: int) -> void:
	value = v

func _ready() -> void:
	add_to_group("engagement")
	_player = get_tree().get_first_node_in_group("player")

func _process(delta: float) -> void:
	if _done or _player == null or not is_instance_valid(_player):
		return
	var to: Vector2 = _player.global_position - global_position
	var d: float = to.length()
	if d <= COLLECT_RANGE:
		_done = true
		collected.emit(value)
		queue_free()
	elif d <= ATTRACT_RANGE:
		global_position += to.normalized() * ATTRACT_SPEED * delta

func _draw() -> void:
	draw_circle(Vector2.ZERO, 5.0, Color(0.3, 1.0, 0.5))
