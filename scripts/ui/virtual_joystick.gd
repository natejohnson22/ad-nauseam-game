extends Control
class_name VirtualJoystick
## Floating on-screen joystick. First touch anywhere spawns the stick under the
## thumb; dragging steers. Feeds Controls.touch_vector. With emulate_touch_from_
## _mouse on, this also works with the mouse on desktop for testing.
##
## mouse_filter = IGNORE so it never blocks HUD/modal buttons; it reads via
## _unhandled_input, which only fires for events the GUI didn't consume.

const MAX_RADIUS := 90.0

var _active := false
var _touch_index := -1
var _base := Vector2.ZERO
var _knob := Vector2.ZERO

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed and not _active:
			_active = true
			_touch_index = event.index
			_base = event.position
			_knob = event.position
			_update_vector()
			queue_redraw()
		elif not event.pressed and event.index == _touch_index:
			_end()
	elif event is InputEventScreenDrag and _active and event.index == _touch_index:
		_knob = event.position
		var off: Vector2 = _knob - _base
		if off.length() > MAX_RADIUS:
			_knob = _base + off.normalized() * MAX_RADIUS
		_update_vector()
		queue_redraw()

func _update_vector() -> void:
	Controls.touch_vector = (_knob - _base) / MAX_RADIUS

## Cancel any in-progress drag (called when a modal opens so the vector doesn't
## get stuck if the finger lifts while the game is paused).
func reset() -> void:
	_end()

func _end() -> void:
	_active = false
	_touch_index = -1
	Controls.touch_vector = Vector2.ZERO
	queue_redraw()

func _draw() -> void:
	if not _active:
		return
	draw_circle(_base, MAX_RADIUS, Color(1, 1, 1, 0.06))
	draw_arc(_base, MAX_RADIUS, 0.0, TAU, 40, Color(1, 1, 1, 0.22), 2.0)
	draw_circle(_knob, 28.0, Color(1, 1, 1, 0.22))
	draw_arc(_knob, 28.0, 0.0, TAU, 24, Color(1, 1, 1, 0.4), 2.0)
