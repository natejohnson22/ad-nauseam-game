extends Node2D
## Run orchestrator. Builds the world + HUD in code, drives the 5-minute run
## timer, and owns the three modal moments: level-up, the placeholder ad-break
## on death, and the win screen. Everything is wired here so the individual
## systems stay decoupled.

const RUN_LENGTH := 300.0  # 5 minutes

# --- Content (data-driven; edit the .tres files to retune) ---
var _sword: WeaponData = preload("res://data/weapons/adblock_sword.tres")
var _boomerang: WeaponData = preload("res://data/weapons/dnt_boomerang.tres")
var _grunt: EnemyData = preload("res://data/enemies/popup_grunt.tres")
var _ogre: EnemyData = preload("res://data/enemies/autoplay_ogre.tres")
var _upgrade_pool: Array = [
	preload("res://data/upgrades/sword_damage.tres"),
	preload("res://data/upgrades/sword_arc.tres"),
	preload("res://data/upgrades/boomerang_damage.tres"),
	preload("res://data/upgrades/boomerang_projectile.tres"),
	preload("res://data/upgrades/move_speed.tres"),
	preload("res://data/upgrades/cooldown.tres"),
]

# --- Systems ---
var _world: Node2D
var _player: Player
var _weapons: WeaponManager
var _progression: Progression
var _director: SpawnDirector

# --- UI ---
var _ui: CanvasLayer
var _joystick: VirtualJoystick
var _hp_bar: ProgressBar
var _xp_bar: ProgressBar
var _timer_label: Label
var _level_label: Label
var _kills_label: Label

# --- Run state ---
var _time_left := RUN_LENGTH
var _kills := 0
var _run_over := false

const DEATH_FLAVOR := [
	"You have been converted into 0.0003 ad impressions.",
	"Your attention has been successfully monetized.",
	"Achievement Unlocked: You ARE the Product.",
	"Thank you for your engagement. It was delicious.",
]

func _ready() -> void:
	randomize()
	_build_world()
	_build_ui()
	_director.start()

func _process(delta: float) -> void:
	if _run_over:
		return
	_time_left -= delta
	_update_timer_label()
	if _time_left <= 0.0:
		_time_left = 0.0
		_update_timer_label()
		_run_over = true
		_show_win()

# ---------------------------------------------------------------- world

func _build_world() -> void:
	_world = Node2D.new()
	_world.name = "World"
	add_child(_world)

	_player = Player.new()
	_player.name = "Player"
	_world.add_child(_player)
	_player.health_changed.connect(_on_health_changed)
	_player.died.connect(_on_player_died)

	var cam := Camera2D.new()
	_player.add_child(cam)
	cam.make_current()

	_weapons = WeaponManager.new()
	_weapons.name = "WeaponManager"
	_player.add_child(_weapons)
	_weapons.setup(_player, _world)
	_weapons.add_weapon(_sword)
	_weapons.add_weapon(_boomerang)

	_progression = Progression.new()
	_progression.name = "Progression"
	add_child(_progression)
	_progression.setup(_player, _weapons, _upgrade_pool)
	_progression.xp_changed.connect(_on_xp_changed)
	_progression.leveled_up.connect(_on_leveled_up)

	_director = SpawnDirector.new()
	_director.name = "SpawnDirector"
	_world.add_child(_director)
	_director.setup(_player, _world, _grunt, _ogre)
	_director.enemy_spawned.connect(_on_enemy_spawned)

# ---------------------------------------------------------------- HUD

func _build_ui() -> void:
	_ui = CanvasLayer.new()
	add_child(_ui)

	var hud := Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui.add_child(hud)

	# HP bar (top-left)
	_hp_bar = ProgressBar.new()
	_hp_bar.show_percentage = false
	_hp_bar.custom_minimum_size = Vector2(260, 22)
	_hp_bar.position = Vector2(20, 18)
	_hp_bar.modulate = Color(1, 0.5, 0.5)
	hud.add_child(_hp_bar)

	# XP bar (under HP)
	_xp_bar = ProgressBar.new()
	_xp_bar.show_percentage = false
	_xp_bar.custom_minimum_size = Vector2(260, 12)
	_xp_bar.position = Vector2(20, 46)
	_xp_bar.modulate = Color(0.4, 1, 0.6)
	hud.add_child(_xp_bar)

	# Level (top-left, below XP)
	_level_label = _make_label("LVL 1", Vector2(20, 62))
	hud.add_child(_level_label)

	# Timer (top-center)
	_timer_label = _make_label("5:00", Vector2.ZERO)
	_timer_label.add_theme_font_size_override("font_size", 32)
	_timer_label.anchor_left = 0.5
	_timer_label.anchor_right = 0.5
	_timer_label.position = Vector2(-40, 14)
	hud.add_child(_timer_label)

	# Kills (top-right)
	_kills_label = _make_label("Kills: 0", Vector2.ZERO)
	_kills_label.anchor_left = 1.0
	_kills_label.anchor_right = 1.0
	_kills_label.position = Vector2(-140, 18)
	hud.add_child(_kills_label)

	# Virtual joystick overlay (bottom of UI stack, ignores mouse)
	_joystick = VirtualJoystick.new()
	_ui.add_child(_joystick)

func _make_label(text: String, pos: Vector2) -> Label:
	var l := Label.new()
	l.text = text
	l.position = pos
	l.add_theme_color_override("font_color", Color.WHITE)
	l.add_theme_color_override("font_outline_color", Color.BLACK)
	l.add_theme_constant_override("outline_size", 4)
	return l

# ---------------------------------------------------------------- HUD updates

func _on_health_changed(current: float, maximum: float) -> void:
	_hp_bar.max_value = maximum
	_hp_bar.value = current

func _on_xp_changed(current: int, needed: int, level: int) -> void:
	_xp_bar.max_value = needed
	_xp_bar.value = current
	_level_label.text = "LVL %d" % level

func _update_timer_label() -> void:
	var t := int(ceil(_time_left))
	_timer_label.text = "%d:%02d" % [t / 60, t % 60]

func _update_kills() -> void:
	_kills_label.text = "Kills: %d" % _kills

# ---------------------------------------------------------------- enemies / xp

func _on_enemy_spawned(e: Enemy) -> void:
	e.died.connect(_on_enemy_died)

func _on_enemy_died(e: Enemy) -> void:
	_kills += 1
	_update_kills()
	var drop := Engagement.new()
	_world.add_child(drop)
	drop.global_position = e.global_position
	drop.setup(e.data.engagement_value)
	drop.collected.connect(_on_engagement_collected)

func _on_engagement_collected(value: int) -> void:
	if _run_over:
		return
	_progression.add_engagement(value)

# ---------------------------------------------------------------- level-up

func _on_leveled_up(choices: Array) -> void:
	if choices.is_empty() or _run_over:
		return
	get_tree().paused = true
	_joystick.reset()

	var modal := _make_modal(Color(0, 0, 0, 0.72))

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 18)
	modal.add_child(box)

	var title := _make_label("LEVEL UP — choose an upgrade", Vector2.ZERO)
	title.add_theme_font_size_override("font_size", 28)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 16)
	box.add_child(row)

	for u in choices:
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(230, 150)
		btn.text = "%s\n\n%s" % [u.title, u.description]
		btn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		btn.pressed.connect(_on_upgrade_chosen.bind(u, modal))
		row.add_child(btn)

func _on_upgrade_chosen(u: UpgradeData, modal: Control) -> void:
	_progression.apply_upgrade(u)
	modal.queue_free()
	get_tree().paused = false

# ---------------------------------------------------------------- death / ad-break

func _on_player_died() -> void:
	if _run_over:
		return
	_run_over = true
	_show_ad_break()

func _show_ad_break() -> void:
	get_tree().paused = true
	_joystick.reset()

	var modal := _make_modal(Color(0, 0, 0, 0.92))

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 14)
	modal.add_child(box)

	var over := _make_label("GAME OVER", Vector2.ZERO)
	over.add_theme_font_size_override("font_size", 40)
	over.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(over)

	var flavor := _make_label(DEATH_FLAVOR[randi() % DEATH_FLAVOR.size()], Vector2.ZERO)
	flavor.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(flavor)

	# The "ad" — a bare placeholder frame. The real ad SDK is deferred.
	var ad := ColorRect.new()
	ad.color = Color(0.15, 0.15, 0.18)
	ad.custom_minimum_size = Vector2(360, 200)
	var ad_label := _make_label("[ YOUR AD HERE ]\n(placeholder)", Vector2.ZERO)
	ad_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	ad_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ad_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	ad.add_child(ad_label)
	box.add_child(ad)

	var retry := Button.new()
	retry.text = "Skip in 5..."
	retry.disabled = true
	retry.custom_minimum_size = Vector2(200, 44)
	retry.pressed.connect(_restart)
	box.add_child(retry)

	_run_honest_countdown(retry)

## Honest countdown: the Retry button is genuinely locked for exactly the
## advertised 5 seconds, then unlocks. No fake padding — honesty is the joke.
func _run_honest_countdown(retry: Button) -> void:
	for i in range(5, 0, -1):
		if not is_instance_valid(retry):
			return
		retry.text = "Skip in %d..." % i
		await get_tree().create_timer(1.0).timeout
	if not is_instance_valid(retry):
		return
	retry.text = "Skip  ▶"
	retry.disabled = false

# ---------------------------------------------------------------- win

func _show_win() -> void:
	get_tree().paused = true
	_joystick.reset()

	var modal := _make_modal(Color(0, 0.05, 0.1, 0.9))

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 16)
	modal.add_child(box)

	var win := _make_label("YOU SURVIVED", Vector2.ZERO)
	win.add_theme_font_size_override("font_size", 40)
	win.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(win)

	var stats := _make_label("You outlasted the Swarm. Kills: %d" % _kills, Vector2.ZERO)
	stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(stats)

	var again := Button.new()
	again.text = "Play Again"
	again.custom_minimum_size = Vector2(200, 44)
	again.pressed.connect(_restart)
	box.add_child(again)

# ---------------------------------------------------------------- helpers

func _make_modal(bg: Color) -> Control:
	var modal := Control.new()
	modal.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal.mouse_filter = Control.MOUSE_FILTER_STOP
	modal.process_mode = Node.PROCESS_MODE_ALWAYS
	var dim := ColorRect.new()
	dim.color = bg
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	modal.add_child(dim)
	_ui.add_child(modal)
	return modal

func _restart() -> void:
	get_tree().paused = false
	Controls.touch_vector = Vector2.ZERO
	get_tree().reload_current_scene()
