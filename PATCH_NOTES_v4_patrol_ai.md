BONZOOKAA v2 – Patch v4 (Patrol AI + Drift Fix)

Changes
1) Exploration enemy AI (runtime/Enemies.js)
   - Patrol at spawn (circle/line/wander/static)
   - Aggro when player enters aggroRange
   - Fire only in aggro + within attackRange
   - Return-to-home when player leaves disengageRange or leash exceeded
   - Zone-bounds clamping to prevent coordinate drift/runaway

2) World despawn behavior (runtime/world/World.js)
   - No hard despawn while enemy is engaged
   - If player is far from spawn: enemy is forced into RETURN; despawn happens only once it is back "at home" (idle)

3) Pickup drift removed in exploration mode (runtime/Pickups.js)
   - No gravity in world mode
   - Strong damping for initial throw velocity
   - Zone-bounds clamping

Files changed
- runtime/Enemies.js
- runtime/Pickups.js
- runtime/world/World.js
