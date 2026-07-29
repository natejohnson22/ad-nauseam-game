extends Node2D
class_name SpawnDirector
## Time-driven escalation. Spawns enemies on a ring around the player (so the
## logic is aspect-ratio-agnostic — the camera just frames a slice of it).
## Ramp per the spec: Grunts trickle from 0:00, first Ogre ~1:30, density climbs.

signal enemy_spawned(enemy: Enemy)

const SPAWN_RADIUS := 640.0
const OGRE_START_TIME := 90.0
const RUN_LENGTH := 300.0

var grunt_data: EnemyData
var ogre_data: EnemyData

var _player: Node2D
var _arena: Node
var _time := 0.0
var _grunt_cd := 0.0
var _ogre_cd := 0.0
var _running := false

func setup(player: Node2D, arena: Node, grunt: EnemyData, ogre: EnemyData) -> void:
	_player = player
	_arena = arena
	grunt_data = grunt
	ogre_data = ogre
	_ogre_cd = OGRE_START_TIME

func start() -> void:
	_running = true

func _process(delta: float) -> void:
	if not _running or _player == null or not is_instance_valid(_player):
		return
	_time += delta

	_grunt_cd -= delta
	if _grunt_cd <= 0.0:
		_spawn_grunt_wave()
		_grunt_cd = _grunt_interval()

	if _time >= OGRE_START_TIME:
		_ogre_cd -= delta
		if _ogre_cd <= 0.0:
			_spawn(ogre_data)
			_ogre_cd = _ogre_interval()

func _grunt_interval() -> float:
	# 2.2s between waves at the start, tightening to 0.7s by the 5-min mark.
	return lerpf(2.2, 0.7, clampf(_time / RUN_LENGTH, 0.0, 1.0))

func _grunt_wave_size() -> int:
	# 3 grunts per wave early, ~9 late.
	return 3 + int(_time / 45.0)

func _ogre_interval() -> float:
	var m := clampf((_time - OGRE_START_TIME) / (RUN_LENGTH - OGRE_START_TIME), 0.0, 1.0)
	return lerpf(11.0, 5.0, m)

func _spawn_grunt_wave() -> void:
	for i in _grunt_wave_size():
		_spawn(grunt_data)

func _spawn(data: EnemyData) -> void:
	var e := Enemy.new()
	_arena.add_child(e)
	var ang := randf() * TAU
	e.global_position = _player.global_position + Vector2(cos(ang), sin(ang)) * SPAWN_RADIUS
	e.setup(data)
	enemy_spawned.emit(e)
