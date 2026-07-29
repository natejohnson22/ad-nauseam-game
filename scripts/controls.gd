extends Node
## Unified movement input (autoload singleton "Controls").
##
## Game code calls get_move_vector() and never learns whether the vector came
## from the keyboard, a gamepad stick, or the on-screen touch joystick. That is
## the whole point: one abstraction so the player controller — and cross-platform
## support — stay device-agnostic.

## Set every frame by the on-screen virtual joystick (VirtualJoystick.gd).
## Zero when no thumb is down.
var touch_vector: Vector2 = Vector2.ZERO

const STICK_DEADZONE := 0.2

func get_move_vector() -> Vector2:
	# Keyboard / arrows (deadzone handled by the action map).
	var v := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	# Gamepad left stick on device 0.
	var stick := Vector2(
		Input.get_joy_axis(0, JOY_AXIS_LEFT_X),
		Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
	)
	if stick.length() > STICK_DEADZONE:
		v += stick

	# Touch joystick.
	v += touch_vector

	return v.limit_length(1.0)
