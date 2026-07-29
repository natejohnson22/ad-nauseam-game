extends Node2D
class_name Enemy
## Generic enemy driven entirely by an EnemyData resource. Two behaviors for
## Prototype 1: "chase" (Popup Grunt) and "telegraph_aoe" (Autoplay Video Ogre).
## Interactions use groups + distance rather than physics layers — simpler and
## fully deterministic at prototype scale.

signal died(enemy: Enemy)

var data: EnemyData
var hp: float

var _player: Node2D
var _contact_cd := 0.0

# telegraph_aoe state machine
enum AoeState { IDLE, WINDING }
var _aoe_state: int = AoeState.IDLE
var _aoe_cd := 0.0
var _aoe_wind := 0.0
var _flash := 0.0  # brief white flash when hit, for hit feedback with no art

func setup(d: EnemyData) -> void:
	data = d
	hp = d.max_hp
	_aoe_cd = d.aoe_interval

func _ready() -> void:
	add_to_group("enemies")
	_player = get_tree().get_first_node_in_group("player")

func _process(delta: float) -> void:
	if _player == null or not is_instance_valid(_player):
		_player = get_tree().get_first_node_in_group("player")
		return

	if data.behavior == "telegraph_aoe":
		_process_aoe(delta)
	else:
		_process_chase(delta)

	_contact_cd = maxf(0.0, _contact_cd - delta)
	_try_contact()
	_flash = maxf(0.0, _flash - delta * 6.0)
	queue_redraw()

func _process_chase(delta: float) -> void:
	var to: Vector2 = _player.global_position - global_position
	if to.length() > 1.0:
		global_position += to.normalized() * data.speed * delta

func _process_aoe(delta: float) -> void:
	match _aoe_state:
		AoeState.IDLE:
			var to: Vector2 = _player.global_position - global_position
			if to.length() > 1.0:
				global_position += to.normalized() * data.speed * delta
			_aoe_cd -= delta
			if _aoe_cd <= 0.0:
				_aoe_state = AoeState.WINDING
				_aoe_wind = data.aoe_telegraph
		AoeState.WINDING:
			# Plant and telegraph — the player's cue to step out of the ring.
			_aoe_wind -= delta
			if _aoe_wind <= 0.0:
				_blast()
				_aoe_state = AoeState.IDLE
				_aoe_cd = data.aoe_interval

func _blast() -> void:
	if _player and is_instance_valid(_player):
		if _player.global_position.distance_to(global_position) <= data.aoe_radius:
			_player.take_damage(data.aoe_damage)

func _try_contact() -> void:
	if _contact_cd > 0.0:
		return
	if _player and is_instance_valid(_player):
		var reach: float = data.radius + _player.get_radius()
		if global_position.distance_to(_player.global_position) <= reach:
			_player.take_damage(data.contact_damage)
			_contact_cd = data.contact_interval

## Called by weapons. knockback_from is the source position for knockback dir.
func take_damage(amount: float, knockback_from = null, knockback: float = 0.0) -> void:
	if hp <= 0.0:
		return
	hp -= amount
	_flash = 1.0
	if knockback_from != null and knockback > 0.0:
		var dir: Vector2 = (global_position - knockback_from)
		if dir.length() > 0.001:
			global_position += dir.normalized() * knockback
	if hp <= 0.0:
		died.emit(self)
		queue_free()

func _draw() -> void:
	var col: Color = data.color.lerp(Color.WHITE, _flash)
	draw_circle(Vector2.ZERO, data.radius, col)
	if _aoe_state == AoeState.WINDING:
		# Pulsing telegraph ring showing the danger radius.
		var t: float = 1.0 - (_aoe_wind / maxf(0.01, data.aoe_telegraph))
		draw_arc(Vector2.ZERO, data.aoe_radius, 0.0, TAU, 48,
			Color(1.0, 0.35, 0.1, 0.35 + 0.4 * t), 3.0, true)
