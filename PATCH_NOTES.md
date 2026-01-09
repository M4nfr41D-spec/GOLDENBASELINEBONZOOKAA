# BONZOOKAA v2 – Patchset: World-Coordinaten + Endless-Depth Stabilität

## Ziel
- Gegner/Deco/Obstacles korrekt in World-Koordinaten rendern (keine Kopplung an Spielerposition)
- Offscreen-Despawn/Kill-Logik auf Zone-/World-Mode umstellen
- Seed/RNG für sehr große Zone-Indizes stabilisieren (uint32, Seed-Mixing)

## Geänderte Dateien
- main.js
- runtime/world/World.js
- runtime/Enemies.js
- runtime/Bullets.js
- runtime/Pickups.js
- runtime/world/SeededRandom.js
- runtime/world/MapGenerator.js

## Deployment
- ZIP entpacken und 1:1 auf GitHub Pages deployen (Branch/Folder wie bisher).
- Optional: Browser-Cache leeren oder Cache-Busting via Querystring.

## Validierung
- In Exploration Mode: weit (>2000px) in X/Y bewegen. Gegner und Deco müssen weiterhin sichtbar/spawnfähig sein.
- Keine 'Off screen' Kills basierend auf Canvas-Größe im World-Mode.

---

# Cleanroom Patch 2 – Lazy DOM Contracts (Modularität)

## Ziel
- Boot nur auf **minimalen DOM-Contracts** prüfen (Canvas/Container).
- Feature-spezifische UI-Contracts **lazy** prüfen: Hub/Combat/Death/Vendor nur dann, wenn der Flow genutzt wird.
- Wiederholte DOM-Scans vermeiden (Scope-Caching).

## Geänderte Dateien
- runtime/Contracts.js
- main.js

## Validierung
- Start → Hub: muss normal funktionieren.
- Act starten: Combat HUD muss vorhanden sein, sonst klare Fehlermeldung (Missing IDs).
- Tod/Vendor: jeweils klare Fehlermeldung, falls UI-Module entfernt wurden.

---

# Cleanroom Patch 3 – Runtime Invariants + Soft-Fuse Entity Caps

## Ziel
- **Fail-fast** bei Non-Finite Werten (NaN/Infinity) in kritischen Pfaden (dt, Player Core).
- **Soft-Fuse** gegen Entity-Flooding (Bullets/Enemies/Pickups/Particles): trimmt alte Einträge statt FPS-Kollaps.
- Automatische **Debug-Dumps** bei Invariant-Fails (Console + localStorage `bonz_last_dump`).

## Neu
- runtime/Invariants.js

## Geänderte Dateien
- main.js

## Konfiguration (Caps)
Default Caps (anpassbar in `Invariants.caps`):
- bullets: 2000
- enemyBullets: 2000
- enemies: 900
- pickups: 700
- particles: 6500

## Validierung
- 60–120s intensives Combat (viel FireRate/Projectiles) → keine Freezes, keine runaway entity counts.
- Bei absichtlich provoziertem NaN (Debug) → klarer Error + Dump in Console + `localStorage.bonz_last_dump`.

---

# Cleanroom Patch 4 – View-Prewarm Spawning + Tuning (Dichte/Aggro/Fire)

## Ziel
- **Gegner-Pop-in eliminieren**: Spawns werden bereits aktiviert, bevor der Spawn-Punkt in den Viewport wandert.
- **Gegnerdichte reduzieren** (ohne Act-Daten zu verändern): harte Caps pro Zone + optionale Density-Multipliers.
- **Testbarkeit verbessern**: reduzierte Aggro-Range + langsamere Feuerintervalle.

## Neu in `data/config.json`
- `exploration.enemyDensityMult`
- `exploration.eliteDensityMult`
- `exploration.maxEnemySpawnsPerZone`
- `exploration.maxEliteSpawnsPerZone`
- `exploration.enemySpawnMinDist*`
- `exploration.spawnViewMargin`
- `exploration.despawnViewMargin`
- `exploration.enemyAggroRangeMult`
- `exploration.enemyFireIntervalMult`

## Geänderte Dateien
- main.js
- runtime/world/World.js
- runtime/world/MapGenerator.js
- runtime/Enemies.js
- data/config.json

## Validierung
- Beim schnellen Movement auf neue Spawns: Gegner sollen **nicht mehr direkt neben dem Schiff auftauchen**, sondern spätestens am Screen-Rand sichtbar werden.
- Zonen-Load: Spawn-Anzahl bleibt bounded (keine "Hundertschaften" mehr) – lesbares Combat.
- Aggro/Feuerrate spürbar ruhiger für Debugging/QA.

---

# Cleanroom Patch 7A – Map Scale (größere Zonen ohne Spawn-Explosion)

## Ziel
- Zonen sind **deutlich größer** (Exploration wird relevant; nicht mehr "in 2 Sekunden quer durch").
- Enemy-Counts skalieren **nicht** flächenlinear mit – hard caps + Density-Multipliers bleiben die primären Stellschrauben.

## Neu in `data/config.json`
- `exploration.mapScale` (Default: 5.0)

## Geänderte Dateien
- runtime/world/MapGenerator.js
- data/config.json

## Validierung
- Zone lädt normal, FPS stabil.
- Keine Enemy-Floods (Caps greifen weiterhin).
- Travel-Time spürbar höher; Pop-in bleibt durch View-Prewarm weiterhin eliminiert.

---

# Patch 9A0 – Pack Director Minimal (3–5er Packs, keine neuen Enemy-Typen)

## Ziel
- **Pack-Spawns** aktivieren, ohne neue Gegnerklassen oder Status-Systeme.
- Packs **verbrauchen** das bestehende Spawn-Budget (keine zusätzliche Gegnerdichte).
- Deterministisch: gleicher Seed ⇒ gleiche Pack-Struktur.

## Neu
- `data/packs.json` (Pack-Templates + Director Defaults)

## Geänderte Dateien
- `runtime/DataLoader.js` (lädt nun zusätzlich `packs.json`)
- `runtime/world/MapGenerator.js` (applyPackDirector Hook)

## Validierung
- Zone startet ohne Errors.
- Sichtbar: Gruppen erscheinen als Cluster (3–5 Gegner nahe beieinander) neben Singles.
- Gesamtzahl der Gegner bleibt innerhalb der bestehenden Caps.


## Patch 9A4
- Added synergy pack template: `pack_repair_escort` (1x breacher + 2x repair_drone, pack size 3)
- Added new basic enemy type: `repair_drone` with capped tether heal (non-stacking per target per frame)
- MapGenerator pack director now supports `template.members` explicit composition
- Enemies: repair tether line visualization
