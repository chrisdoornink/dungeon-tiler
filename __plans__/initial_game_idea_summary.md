Dungeon-tiler

the world bounds are 20x20 tiles.
Each tile doesn't need to be part of the dungeon, can be blank (if inaccessible)
Inaccessible tiles SHOULD be blank.Tile types

- Floor
- Wall
- Nothing
  Each tile type can have other attributes
- They can contain a hidden item
  - Items will be defined somewhere, the item can be anything for now
  - covered/uncovered will be a data thing to track
- They can contain a switch/lever
  - Can be covered/uncovered or visible (these will have different visual styles so differentiating them is important
- Floors can have
  - Traps, holes you fall into
  - Switches
    - Visible
    - Covered
  - Items
    - Visible
    - Covered
- Walls can have
  - Openings
    - Visible
    - Covered
  - Exit Doors
    - Visible
    - Covered
  - Interior Doors
    - Visible
    - Covered
    - Locked or unlocked
  - Items
    - Visible
    - Covered
- Items can be (sure more will flood in later)
  - Lights
  - Keys
    - Must correspond to a locked door
  - Spikes
  - Weapons

Each dungeon has
Exactly 1 exit door
Exactly 1 exit key
Multiple enemies
0-2 interior doors
doors should go to a room that is inaccessible by any other path

A tile should be Nothing if

- Is not inside of the wall bounds of the level
- Is not accessible by the player

Walls should wrap the entire world

Floors should be created first

- Rooms will always have at least 1 tile of wall between them

The game mechanics are

Get to the exit
You need to find the exterior door key to get there
You need to find the key and get to the door without dying

You can die by
Enemy
Trap
