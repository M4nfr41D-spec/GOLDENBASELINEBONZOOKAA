// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// World.js - Zone & Enemy Spawn Management
// ============================================================
// Manages current zone, spawns enemies when player approaches

import { State } from '../State.js';
import { MapGenerator } from './MapGenerator.js';
import { Camera } from './Camera.js';
import { SeededRandom } from './SeededRandom.js';
import { DepthRules } from './DepthRules.js';

export const World = {
  currentZone: null,
  currentAct: null,
  zoneIndex: 0,
  
  // Spawning config
  // Legacy distance-based spawning (kept as fallback)
  spawnRadius: 600,
  despawnRadius: 1200,

  // View-based spawning (preferred): spawns become active before they enter the camera view
  spawnViewMargin: 520,      // pixels beyond viewport to prewarm spawns
  despawnViewMargin: 1800,   // pixels beyond viewport to allow despawn
  activeEnemies: [],     // Currently active enemies from spawns

  // Check if a world point is within (camera view + margin)
  isInView(x, y, camX, camY, screenW, screenH, margin) {
    return (
      x >= camX - margin &&
      x <= camX + screenW + margin &&
      y >= camY - margin &&
      y <= camY + screenH + margin
    );
  },
  
  // Initialize world with act config
  async init(actId, seed = null) {
    // Load act config
    const actConfig = State.data.acts?.[actId];
    if (!actConfig) {
      console.error(`Act ${actId} not found!`);
      return false;
    }
    
    this.currentAct = actConfig;
    this.currentAct.id = actId;
    
    // Use provided seed or generate from act name
    const actSeed = seed || SeededRandom.fromString(actId + '_' + Date.now());
    this.currentAct.seed = actSeed;
    
    // Generate first zone
    this.zoneIndex = 0;
    this.loadZone(0);
    
    return true;
  },
  
  // Load/generate a zone (endless via depth)
  loadZone(index) {
    // Zone transition cleanup: prevent entity/bullet carry-over
    State.bullets = [];
    State.enemyBullets = [];
    State.enemies = [];
    State.pickups = [];
    State.particles = [];

    // Depth is 1-based
    const depth = index + 1;
    const zoneSeed = MapGenerator.createZoneSeed(this.currentAct.seed, index);

    // Hybrid milestone unlocks (weighted randomness)
    DepthRules.maybeUnlock(depth, this.currentAct);
    DepthRules.recordDepth(depth);

    // Boss interval: prefer config (exploration.bossEveryNZones), else act.zones, else 10
    const tune = State.data.config?.exploration || {};
    const cfgBossEvery = (typeof tune.bossEveryNZones === 'number' && tune.bossEveryNZones > 0)
      ? tune.bossEveryNZones
      : null;
    const actBossEvery = (typeof this.currentAct.zones === 'number' && this.currentAct.zones > 0)
      ? this.currentAct.zones
      : null;
    const bossInterval = cfgBossEvery || actBossEvery || 10;
    const isBossZone = (depth % bossInterval) === 0;

    // Sample active modifiers for this zone
    const activeMods = DepthRules.sampleActive(depth, this.currentAct);

    if (isBossZone) {
      this.currentZone = MapGenerator.generateBossZone(this.currentAct, zoneSeed, { depth, mods: activeMods });
    } else {
      this.currentZone = MapGenerator.generate(this.currentAct, zoneSeed, { depth, mods: activeMods });
    }

    this.currentZone.depth = depth;
    this.currentZone.mods = activeMods;

    this.zoneIndex = index;
    this.activeEnemies = [];
    State.world.zoneIndex = index;
    State.world.currentZone = this.currentZone;

    // Position player at spawn
    State.player.x = this.currentZone.spawn.x;
    State.player.y = this.currentZone.spawn.y;
    State.player.vx = 0;
    State.player.vy = 0;

    // Snap camera to player
    const canvas = document.getElementById('gameCanvas');
    const screenW = canvas?.width || 800;
    const screenH = canvas?.height || 600;
    Camera.snapTo(
      State.player.x - screenW / 2,
      State.player.y - screenH / 2
    );

    // Reset zone-combat counters
    this.spawnedEnemyCount = 0;
    this.spawnedEliteCount = 0;
    this.bossSpawned = false;
  },
  
  // Update - handle view-based spawning (and fallback proximity spawning)
  update(dt, screenW = 800, screenH = 600) {
    if (!this.currentZone) return;

    const player = State.player;
    const tune = State.data.config?.exploration || {};
    const spawnMargin = (typeof tune.spawnViewMargin === 'number') ? tune.spawnViewMargin : this.spawnViewMargin;
    const despawnMargin = (typeof tune.despawnViewMargin === 'number') ? tune.despawnViewMargin : this.despawnViewMargin;
    const portalRadius = (typeof tune.portalInteractRadius === 'number') ? tune.portalInteractRadius : 75;

    // Use camera target (less laggy) for spawn checks.
    const camX = (Camera.targetX != null) ? Camera.targetX : Camera.getX();
    const camY = (Camera.targetY != null) ? Camera.targetY : Camera.getY();
    
    // Check enemy spawns
    for (const spawn of this.currentZone.enemySpawns) {
      if (spawn.killed) continue;
      
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);

      // Preferred: spawn when the spawn point approaches the camera view.
      // This prevents "enemies popping into existence" right next to the ship.
      const shouldSpawnByView = this.isInView(spawn.x, spawn.y, camX, camY, screenW, screenH, spawnMargin);
      if (!spawn.active && shouldSpawnByView) {
        this.spawnEnemy(spawn, false);
      } else if (!spawn.active && dist < this.spawnRadius) {
        // Fallback for edge cases (very small screens / extreme camera settings)
        this.spawnEnemy(spawn, false);
      }
      
      // Despawn if too far (and not engaged)
      // Despawn when far outside view (and the enemy has returned home)
      const shouldDespawnByView = !this.isInView(spawn.x, spawn.y, camX, camY, screenW, screenH, despawnMargin);
      if (spawn.active && (shouldDespawnByView || dist > this.despawnRadius)) {
        // Only despawn when the enemy is effectively "idle" at home.
        // If it was engaged, force a return so it doesn't vanish mid-behavior.
        const enemy = State.enemies.find(e => e.id === spawn.enemyId);
        if (enemy) {
          if (enemy.aiState === 'aggro') enemy.aiState = 'return';

          const distHome = Math.hypot(enemy.x - spawn.x, enemy.y - spawn.y);
          const homeThreshold = enemy.returnThreshold || 60;
          if (enemy.aiState !== 'aggro' && distHome <= homeThreshold) {
            this.despawnEnemy(spawn);
          }
        } else {
          this.despawnEnemy(spawn);
        }
      }
    }
    
    // Check elite spawns
    for (const spawn of this.currentZone.eliteSpawns) {
      if (spawn.killed) continue;
      
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);

      const shouldSpawnByView = this.isInView(spawn.x, spawn.y, camX, camY, screenW, screenH, spawnMargin);
      if (!spawn.active && shouldSpawnByView) {
        this.spawnEnemy(spawn, true);
      } else if (!spawn.active && dist < this.spawnRadius) {
        this.spawnEnemy(spawn, true);
      }

      // Despawn elites when far outside view (only once they returned home)
      const shouldDespawnByView = !this.isInView(spawn.x, spawn.y, camX, camY, screenW, screenH, despawnMargin);
      if (spawn.active && (shouldDespawnByView || dist > this.despawnRadius)) {
        const enemy = State.enemies.find(e => e.id === spawn.enemyId);
        if (enemy) {
          if (enemy.aiState === 'aggro') enemy.aiState = 'return';
          const distHome = Math.hypot(enemy.x - spawn.x, enemy.y - spawn.y);
          const homeThreshold = enemy.returnThreshold || 60;
          if (enemy.aiState !== 'aggro' && distHome <= homeThreshold) {
            this.despawnEnemy(spawn);
          }
        } else {
          this.despawnEnemy(spawn);
        }
      }
    }
    
    // Check boss spawn
    if (this.currentZone.bossSpawn && !this.currentZone.bossSpawn.killed) {
      const spawn = this.currentZone.bossSpawn;
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);

      const bossMargin = spawnMargin * 1.25;
      const shouldSpawnByView = this.isInView(spawn.x, spawn.y, camX, camY, screenW, screenH, bossMargin);
      if (!spawn.active && shouldSpawnByView) {
        this.spawnBoss(spawn);
      } else if (!spawn.active && dist < this.spawnRadius * 1.5) {
        this.spawnBoss(spawn);
      }
    }
    
    // Check exit collision
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      const dist = Math.hypot(player.x - exit.x, player.y - exit.y);
      
      if (dist < 50) {
        this.onExitReached();
      }
    }
    
    // Portal interaction (no auto-teleport): require player input
    this.nearPortal = null;
    for (const portal of this.currentZone.portals) {
      const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
      if (dist < portalRadius) {
        this.nearPortal = portal;
        break;
      }
    }

    if (this.nearPortal && State.input?.interactPressed) {
      this.usePortal(this.nearPortal);
    }
    
    // Enemy AI (patrol/aggro/return) is handled in Enemies.update() for exploration mode.
  },
  
  // Spawn regular enemy
  spawnEnemy(spawn, isElite = false) {
    const { Enemies } = State.modules;
    const tune = State.data.config?.exploration || {};
    const aggroMult = (typeof tune.enemyAggroRangeMult === 'number') ? tune.enemyAggroRangeMult : 1.0;
    
    // Calculate level based on player
    const playerLvl = State.meta.level || 1;
    let enemyLvl;
    
    if (isElite) {
      enemyLvl = playerLvl; // Elite = same level
    } else {
      enemyLvl = Math.max(1, playerLvl - 1 - Math.floor(Math.random() * 2));
    }
    
    // Create enemy
    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, isElite, false);
    enemy.spawnRef = spawn;
    enemy.level = enemyLvl;

    // World AI baseline (patrol -> aggro -> return)
    const patrolType = spawn.patrol || (isElite ? 'circle' : 'wander');
    const patrolRadius = spawn.patrolRadius || (isElite ? 140 : 110);

    enemy.homeX = spawn.x;
    enemy.homeY = spawn.y;
    enemy.aiState = 'patrol';
    enemy.patrol = patrolType;
    enemy.patrolRadius = patrolRadius;
    enemy.patrolAngle = Math.random() * Math.PI * 2;
    enemy.patrolDir = Math.random() < 0.5 ? -1 : 1;
    enemy.patrolTimer = 0;
    enemy.wanderTarget = null;
    enemy.wanderTimer = 0;

    // Engagement envelope (tuned for exploration)
    const baseAggro = spawn.aggroRange || (isElite ? 420 : 340);
    enemy.aggroRange = baseAggro * aggroMult;
    enemy.attackRange = spawn.attackRange || enemy.aggroRange;
    enemy.disengageRange = spawn.disengageRange || enemy.aggroRange * 1.65;
    enemy.leashRange = spawn.leashRange || Math.max(enemy.aggroRange * 2.2, patrolRadius * 5);
    enemy.returnThreshold = Math.max(40, enemy.size * 1.2);
    
    // Scale stats by level difference
    const levelScale = Math.pow(1.1, enemyLvl - 1);
    enemy.hp *= levelScale;
    enemy.maxHP *= levelScale;
    enemy.damage *= levelScale;
    enemy.xp = Math.floor(enemy.xp * levelScale);
    
    spawn.active = true;
    spawn.enemyId = enemy.id;
    
    this.activeEnemies.push(enemy);
  },
  
  // Spawn boss
  spawnBoss(spawn) {
    const { Enemies } = State.modules;
    const tune = State.data.config?.exploration || {};
    const aggroMult = (typeof tune.enemyAggroRangeMult === 'number') ? tune.enemyAggroRangeMult : 1.0;
    
    const playerLvl = State.meta.level || 1;
    const bossLvl = playerLvl + Math.floor(Math.random() * 6); // +0 to +5
    
    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, false, true);
    enemy.spawnRef = spawn;
    enemy.level = bossLvl;

    // Boss AI baseline
    enemy.homeX = spawn.x;
    enemy.homeY = spawn.y;
    enemy.aiState = 'patrol';
    enemy.patrol = spawn.patrol || 'circle';
    enemy.patrolRadius = spawn.patrolRadius || 220;
    enemy.patrolAngle = Math.random() * Math.PI * 2;
    enemy.patrolDir = 1;
    enemy.patrolTimer = 0;

    const baseAggro = spawn.aggroRange || 550;
    enemy.aggroRange = baseAggro * aggroMult;
    enemy.attackRange = spawn.attackRange || enemy.aggroRange;
    enemy.disengageRange = spawn.disengageRange || enemy.aggroRange * 1.5;
    enemy.leashRange = spawn.leashRange || Math.max(enemy.aggroRange * 2.0, enemy.patrolRadius * 6);
    enemy.returnThreshold = Math.max(60, enemy.size * 1.2);

    // Scale boss
    const levelScale = Math.pow(1.15, bossLvl - 1);
    enemy.hp *= levelScale;
    enemy.maxHP *= levelScale;
    enemy.damage *= levelScale;
    
    spawn.active = true;
    spawn.enemyId = enemy.id;
    
    // Announce boss
    State.ui?.showAnnouncement?.(`⚠️ ${enemy.name || 'BOSS'} APPEARS!`);
  },
  
  // Despawn enemy (too far)
  despawnEnemy(spawn) {
    // Remove from State.enemies
    const idx = State.enemies.findIndex(e => e.id === spawn.enemyId);
    if (idx !== -1) {
      State.enemies.splice(idx, 1);
    }
    
    spawn.active = false;
    spawn.enemyId = null;
    
    // Remove from active list
    this.activeEnemies = this.activeEnemies.filter(e => e.spawnRef !== spawn);
  },
  
  // Called when enemy dies
  onEnemyKilled(enemy) {
    if (enemy.spawnRef) {
      enemy.spawnRef.killed = true;
      enemy.spawnRef.active = false;
    }
    
    // Check if boss
    if (enemy.isBoss && this.currentZone.bossSpawn) {
      this.onBossKilled();
    }
  },
  
  // Boss killed - spawn portal
  onBossKilled() {
    // Track run stats (best-effort)
    if (State.run?.stats) State.run.stats.bossesKilled = (State.run.stats.bossesKilled || 0) + 1;

    // Spawn portal to next zone (Shift+E can return to hub)
    this.currentZone.portals.push({
      x: this.currentZone.width / 2,
      y: this.currentZone.height / 2,
      destination: 'next',
      allowHub: true,
      type: 'victory'
    });
  },
  
  // Player reached zone exit
  onExitReached() {
    const nextZone = this.zoneIndex + 1;
    this.loadZone(nextZone);
  },
  
  // Use portal (requires interact input)
  usePortal(portal) {
    const wantsHub = !!State.input?.shift;
    const Game = State.modules?.Game;
    const SceneManager = State.modules?.SceneManager;

    if (wantsHub && portal.allowHub) {
      // Prefer full game-flow (credits resources, saves, shows hub)
      if (Game?.returnToHub) Game.returnToHub();
      else if (SceneManager?.returnToHub) SceneManager.returnToHub('portal');
      return;
    }

    if (portal.destination === 'next') {
      const nextZone = this.zoneIndex + 1;
      this.loadZone(nextZone);
      return;
    }

    if (portal.destination === 'hub') {
      if (Game?.returnToHub) Game.returnToHub();
      else if (SceneManager?.returnToHub) SceneManager.returnToHub('portal');
      return;
    }

    // Fallback: load act by id
    if (portal.destination && typeof portal.destination === 'string') {
      this.init(portal.destination);
    }
  },

  // Backwards-compatible hook (if older code calls onPortalEnter)
  onPortalEnter(portal) {
    this.usePortal(portal);
  },
  
  // Update enemy patrol behavior
  updateEnemyPatrols(dt) {
    for (const enemy of this.activeEnemies) {
      if (!enemy.patrol || enemy.dead) continue;
      
      switch (enemy.patrol) {
        case 'circle':
          enemy.patrolAngle += dt * 0.5;
          enemy.x = enemy.patrolOrigin.x + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
          enemy.y = enemy.patrolOrigin.y + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'line':
          enemy.patrolAngle += dt * 0.8;
          enemy.x = enemy.patrolOrigin.x + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'wander':
          // Random direction changes
          if (Math.random() < dt * 0.5) {
            enemy.vx = (Math.random() - 0.5) * enemy.speed;
            enemy.vy = (Math.random() - 0.5) * enemy.speed;
          }
          // Stay near origin
          const dist = Math.hypot(
            enemy.x - enemy.patrolOrigin.x,
            enemy.y - enemy.patrolOrigin.y
          );
          if (dist > enemy.patrolRadius) {
            const angle = Math.atan2(
              enemy.patrolOrigin.y - enemy.y,
              enemy.patrolOrigin.x - enemy.x
            );
            enemy.vx = Math.cos(angle) * enemy.speed * 0.5;
            enemy.vy = Math.sin(angle) * enemy.speed * 0.5;
          }
          break;
      }
    }
  },
  
  // Draw zone elements (obstacles, decorations)
  draw(ctx, screenW, screenH) {
    if (!this.currentZone) return;
    // Draw decorations (behind everything)
    for (const dec of this.currentZone.decorations) {
      if (!Camera.isVisible(dec.x, dec.y, 200, screenW, screenH)) continue;
      
      ctx.globalAlpha = dec.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y, 5 * dec.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Draw obstacles
    for (const obs of this.currentZone.obstacles) {
      if (!Camera.isVisible(obs.x, obs.y, 100, screenW, screenH)) continue;
      
      ctx.save();
      ctx.translate(obs.x, obs.y);
      ctx.rotate(obs.rotation || 0);
      
      // Draw based on type
      switch (obs.type) {
        case 'asteroid':
          ctx.fillStyle = '#555566';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#333344';
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
          
        case 'debris':
          ctx.fillStyle = '#444455';
          ctx.fillRect(-obs.radius, -obs.radius/2, obs.radius*2, obs.radius);
          break;
          
        case 'mine':
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffff00';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
          
        case 'pillar':
          ctx.fillStyle = '#667788';
          ctx.beginPath();
          ctx.arc(0, 0, obs.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#8899aa';
          ctx.lineWidth = 3;
          ctx.stroke();
          break;
      }
      
      ctx.restore();
    }
    
    // Draw exit marker
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      ctx.fillStyle = '#00ff88';
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(exit.x, exit.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', exit.x, exit.y + 5);
    }
    
    // Draw portals
    for (const portal of this.currentZone.portals) {
      const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
      ctx.fillStyle = portal.type === 'victory' ? '#ffdd00' : '#8800ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 30 * pulse;
      ctx.beginPath();
      ctx.arc(portal.x, portal.y, 40 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('PORTAL', portal.x, portal.y + 5);

      // Interaction hint (shown only when player is in range)
      if (this.nearPortal === portal) {
        ctx.font = 'bold 11px Orbitron';
        if (portal.destination === 'next') {
          ctx.fillText('E: CONTINUE', portal.x, portal.y - 50);
          if (portal.allowHub) ctx.fillText('SHIFT+E: HUB', portal.x, portal.y - 34);
        } else {
          ctx.fillText('E: USE', portal.x, portal.y - 50);
        }
      }
    }
  },
  
  // Draw parallax background layers
  drawParallax(ctx, screenW, screenH) {
    if (!this.currentZone?.parallax) return;
    
    const parallax = this.currentZone.parallax;
    const camX = Camera.getX();
    const camY = Camera.getY();
    
    // Layer 0: Background color
    ctx.fillStyle = parallax.background.color;
    ctx.fillRect(0, 0, screenW, screenH);
    
    // Layer 0: Deep stars
    const bgOffsetX = camX * parallax.background.scrollSpeed;
    const bgOffsetY = camY * parallax.background.scrollSpeed;
    
    ctx.fillStyle = '#ffffff';
    for (const star of parallax.background.stars) {
      const x = ((star.x - bgOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - bgOffsetY) % screenH + screenH) % screenH;
      
      let brightness = star.brightness;
      if (star.twinkle) {
        brightness *= 0.5 + Math.sin(Date.now() / 500 + star.x) * 0.5;
      }
      
      ctx.globalAlpha = brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Layer 1: Mid stars
    const midOffsetX = camX * parallax.midground.scrollSpeed;
    const midOffsetY = camY * parallax.midground.scrollSpeed;
    
    for (const star of parallax.midground.stars) {
      const x = ((star.x - midOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - midOffsetY) % screenH + screenH) % screenH;
      
      ctx.globalAlpha = star.brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
    
    // Layer 2: Nebula wisps
    if (parallax.foreground.objects) {
      const fgOffsetX = camX * parallax.foreground.scrollSpeed;
      const fgOffsetY = camY * parallax.foreground.scrollSpeed;
      
      for (const wisp of parallax.foreground.objects) {
        const x = wisp.x - fgOffsetX;
        const y = wisp.y - fgOffsetY;
        
        ctx.globalAlpha = wisp.alpha;
        ctx.fillStyle = wisp.color;
        ctx.beginPath();
        ctx.ellipse(x, y, wisp.width / 2, wisp.height / 2, wisp.rotation, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
    }
  }
};

export default World;