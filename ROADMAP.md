<!-- Copyright (c) Manfred Foissner. All rights reserved. License: See LICENSE.txt -->

# 🚀 BONZOOKAA v2 - Exploration Mode Roadmap

## ✅ PHASE 1: Core Architecture (DONE)

### Completed Systems
| System | File | Status |
|--------|------|--------|
| Seeded Random | `runtime/world/SeededRandom.js` | ✅ |
| Camera System | `runtime/world/Camera.js` | ✅ |
| Map Generator | `runtime/world/MapGenerator.js` | ✅ |
| World Manager | `runtime/world/World.js` | ✅ |
| Scene Manager | `runtime/world/SceneManager.js` | ✅ |
| Acts Config | `data/acts.json` | ✅ |
| Hub Modal | `index.html` | ✅ |
| Game Loop | `main.js` | ✅ |
| Enemy Level Scaling | `runtime/Enemies.js` | ✅ |
| Map Editor Tool | `tools/mapEditor.html` | ✅ |

---

## 🔧 PHASE 2: Polish & Testing (NEXT)

### 2.1 Collision System
```
runtime/Collision.js (NEW)
├── Player vs Obstacles
├── Bullets vs Obstacles  
├── Enemy vs Obstacles
└── Line-of-sight for AI
```

**Tasks:**
- [ ] Create Collision.js with circle/rect intersection
- [ ] Add asteroid collision (destroyable)
- [ ] Add mine explosion on contact
- [ ] Add pillar blocking

### 2.2 Enemy AI Improvements
```
runtime/AI.js (NEW)
├── Aggro radius detection
├── Chase behavior
├── Patrol return
├── Group coordination
└── Boss phases
```

**Tasks:**
- [ ] Enemies only attack when player in range
- [ ] Chase player when aggro'd
- [ ] Return to patrol if player escapes
- [ ] Boss adds spawning

### 2.3 Portal System Enhancement
**Tasks:**
- [ ] Portal animation (swirling effect)
- [ ] Portal enter transition
- [ ] Return portal in hub
- [ ] Portal sound effects

---

## 🎮 PHASE 3: Hub Features

### 3.1 Space Station Hub Scene
```
Canvas-rendered hub with:
├── Vendor NPC (buy/sell)
├── Skill Station
├── Stash Terminal
├── Act Portals
└── Ship Display
```

**Alternative:** Keep HTML-based hub (current)

### 3.2 Vendor System
**Tasks:**
- [ ] NPC selling random items
- [ ] Item refresh on act completion
- [ ] Sell items for scrap
- [ ] Buyback system

### 3.3 Skill Station
**Tasks:**
- [ ] Skill tree visualization
- [ ] Respec option (cost scrap)
- [ ] Skill preview

---

## 🗺️ PHASE 4: Content

### 4.1 More Acts
```json
{
  "act4": "Derelict Fleet",
  "act5": "Black Hole Approach",
  "act6": "Enemy Mothership"
}
```

### 4.2 More Enemy Types
```
New enemies:
├── Bomber (area denial)
├── Healer (supports others)
├── Cloaker (invisible until close)
├── Summoner (spawns minions)
└── Turret (stationary, high damage)
```

### 4.3 More Bosses
```
Boss mechanics:
├── Phase transitions
├── Add spawning
├── Environmental hazards
├── Weak points
└── Enrage timers
```

---

## ⚡ PHASE 5: Performance

### 5.1 Spatial Partitioning
```
runtime/SpatialHash.js (NEW)
├── Grid-based collision
├── Efficient neighbor lookup
├── Large map support
```

### 5.2 Object Pooling
```
Reuse objects instead of GC:
├── Bullets pool
├── Particles pool
├── Enemies pool
└── Pickups pool
```

### 5.3 Render Optimization
```
├── Frustum culling (done via Camera.isVisible)
├── Batch rendering
├── Offscreen canvas for static elements
└── requestAnimationFrame optimization
```

---

## 🎨 PHASE 6: Visual Polish

### 6.1 Parallax Enhancement
- [ ] More layers (5-6 total)
- [ ] Animated nebulae
- [ ] Distant planet/sun
- [ ] Asteroid field layer

### 6.2 Environment
- [ ] Space dust particles
- [ ] Ship trails
- [ ] Explosion improvements
- [ ] Shield bubble effect

### 6.3 UI Polish
- [ ] Minimap fog of war
- [ ] Damage direction indicator
- [ ] Quest/objective tracker
- [ ] Loot beam effects

---

## 🔊 PHASE 7: Audio

### 7.1 Sound Effects
```
assets/audio/
├── sfx_shoot.wav
├── sfx_hit.wav
├── sfx_explosion.wav
├── sfx_pickup.wav
├── sfx_portal.wav
├── sfx_boss_spawn.wav
└── sfx_level_up.wav
```

### 7.2 Music
```
assets/audio/
├── music_hub.mp3
├── music_combat.mp3
├── music_boss.mp3
└── music_victory.mp3
```

### 7.3 Audio Manager
```javascript
runtime/Audio.js (NEW)
├── Volume controls
├── Music crossfade
├── Spatial audio (optional)
└── Mute/unmute
```

---

## 📱 PHASE 8: Polish & QOL

### 8.1 Save System Enhancement
- [ ] Multiple save slots
- [ ] Cloud save (optional)
- [ ] Export/import save
- [ ] Autosave indicator

### 8.2 Settings Menu
- [ ] Volume sliders
- [ ] Control rebinding
- [ ] Screen shake toggle
- [ ] Damage numbers toggle
- [ ] Minimap size/position

### 8.3 Tutorial
- [ ] First-run tutorial
- [ ] Control hints
- [ ] Mechanic explanations
- [ ] Skip option

---

## 🏆 PHASE 9: Endgame

### 9.1 New Game+
- [ ] Difficulty scaling
- [ ] Bonus modifiers
- [ ] Prestige rewards

### 9.2 Endless Mode
- [ ] Procedural zones
- [ ] Scaling difficulty
- [ ] Leaderboard (local)

### 9.3 Challenges
- [ ] Daily challenges
- [ ] Achievement system
- [ ] Unlockable cosmetics

---

## 📊 Priority Order

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| 2.1 Collision | 🔴 HIGH | Medium | High |
| 2.2 Enemy AI | 🔴 HIGH | Medium | High |
| 2.3 Portals | 🟡 MED | Low | Medium |
| 3.2 Vendor | 🟡 MED | Medium | High |
| 4.1 More Acts | 🟡 MED | Medium | High |
| 7.1 SFX | 🟢 LOW | Low | Medium |
| 5.1 Spatial Hash | 🟢 LOW | High | Medium |

---

## 🎯 Immediate Next Steps

1. **Test current build** - Play through Act 1
2. **Add Collision.js** - Obstacles blocking movement
3. **Improve AI** - Aggro + chase behavior
4. **Add Act 2 content** - Different enemies/boss
5. **Sound effects** - Basic shooting/explosion sounds

---

## 📁 File Structure

```
bonzookaa-desktop/
├── index.html          # Main HTML + CSS
├── main.js             # Game controller
├── runtime/
│   ├── State.js        # Global state
│   ├── DataLoader.js   # JSON loading
│   ├── Save.js         # LocalStorage
│   ├── Stats.js        # Stat calculation
│   ├── Leveling.js     # XP & levels
│   ├── Items.js        # Item generation
│   ├── Player.js       # Player logic
│   ├── Enemies.js      # Enemy logic
│   ├── Bullets.js      # Projectiles
│   ├── Pickups.js      # Drops
│   ├── Particles.js    # VFX
│   ├── Input.js        # Controls
│   ├── UI.js           # UI rendering
│   └── world/          # ⭐ NEW
│       ├── index.js
│       ├── SeededRandom.js
│       ├── Camera.js
│       ├── MapGenerator.js
│       ├── World.js
│       └── SceneManager.js
├── data/
│   ├── config.json
│   ├── acts.json       # ⭐ NEW
│   ├── enemies.json
│   ├── items.json
│   ├── affixes.json
│   ├── skills.json
│   ├── pilotStats.json
│   ├── rarities.json
│   ├── runUpgrades.json
│   └── slots.json
├── tools/
│   └── mapEditor.html  # ⭐ NEW
└── assets/
    └── audio/          # (Future)
```

---

## 🐛 Known Issues

1. **Enemy targeting** - Uses screen coords, should use world coords
2. **Pickup attraction** - May need camera offset adjustment
3. **Boss health bar** - Not implemented yet
4. **Zone exit** - No visual indicator when near

---

## 💡 Ideas for Future

- Ship customization (visual)
- Companion drones
- Environmental hazards (radiation zones, asteroid storms)
- NPC dialogue system
- Quest system
- Crafting system
- Multiplayer (co-op)

---

*Last updated: 2025-01-03*
