extends Resource
class_name EnemyData
## Tunable numbers for one enemy archetype. One generic Enemy scene reads this;
## adding an enemy later = new .tres + (if needed) a new behavior branch.

@export var id: StringName = &"enemy"
@export var display_name: String = "Enemy"

@export_group("Stats")
@export var max_hp: float = 20.0
@export var speed: float = 60.0
@export var radius: float = 14.0           ## body size (collision + placeholder visual)
@export var engagement_value: int = 1      ## XP dropped on death

@export_group("Contact Damage")
@export var contact_damage: float = 5.0    ## per tick while touching the player
@export var contact_interval: float = 0.5  ## seconds between contact ticks

@export_group("Behavior")
@export_enum("chase", "telegraph_aoe") var behavior: String = "chase"
## telegraph_aoe only: slow tank that periodically winds up an unavoidable-once-
## committed blast. Player reads the tell and steps out of aoe_radius.
@export var aoe_interval: float = 3.5      ## seconds between blasts
@export var aoe_telegraph: float = 1.1     ## wind-up time (the tell)
@export var aoe_radius: float = 95.0
@export var aoe_damage: float = 28.0       ## the "chunky" hit

@export_group("Placeholder Art")
@export var color: Color = Color(0.85, 0.2, 0.2)
