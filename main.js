// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// MAIN.js - BONZOOKAA Exploration Mode
// ============================================================
// Diablo-style exploration with hub, acts, and boss portals

import { State, resetRun, resetPlayer } from './runtime/State.js';
import { loadAllData } from './runtime/DataLoader.js';
import { Save } from './runtime/Save.js';
import { Stats } from './runtime/Stats.js';
import { Leveling } from './runtime/Leveling.js';
import { Items } from './runtime/Items.js';
import { Player } from './runtime/Player.js';
import { Enemies } from './runtime/Enemies.js';
import { Bullets } from './runtime/Bullets.js';
import { Pickups } from './runtime/Pickups.js';
import { Particles } from './runtime/Particles.js';
import { Input } from './runtime/Input.js';
import { UI } from './runtime/UI.js';
import { Contracts } from './runtime/Contracts.js';
import { Invariants } from './runtime/Invariants.js';

// World System
import { Camera } from './runtime/world/Camera.js';
import { World } from './runtime/world/World.js';
import { SceneManager } from './runtime/world/SceneManager.js';
import { SeededRandom } from './runtime/world/SeededRandom.js';

// ============================================================
// GAME CONTROLLER
// ============================================================

const Game = {
  canvas: null,
  ctx: null,
  lastTime: 0,
  
  // Screen dimensions
  screenW: 800,
  screenH: 600,
  
  // Game mode
  mode: 'exploration', // 'exploration' or 'waves' (legacy)
  
  // ========== INITIALIZATION ==========
  
  async init() {
    console.log('🚀 BONZOOKAA Exploration Mode initializing...');

    // Fail fast on BOOT contracts only.
    // Feature-specific UI contracts are asserted lazily when their flows are invoked.
    Contracts.assertBoot();
    
    // Setup canvas
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Load data
    await loadAllData();
    
    // Load save
    Save.load();
    
    // Register modules in State for cross-module access
    State.modules = {
      Save, Stats, Leveling, Items, Player, 
      Enemies, Bullets, Pickups, Particles, UI,
      Camera, World, SceneManager
    };

    // Allow world/systems to invoke high-level game flow (e.g., portal -> hub)
    State.modules.Game = this;
    
    // Initialize systems
    Input.init(this.canvas);
    UI.init();
    Camera.init(0, 0);
    SceneManager.init();
    
    // Calculate stats
    Stats.calculate();
    
    // Add starter items if new
    if (State.meta.stash.length === 0) {
      this.addStarterItems();
    }
    
    // Initialize act unlocks
    this.initActUnlocks();
    
    // Show hub
    this.showHub();
    
    // Start loop
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    
    console.log('✅ Exploration mode ready');
  },
  
  resize() {
    const container = document.getElementById('gameContainer');
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.screenW = this.canvas.width;
    this.screenH = this.canvas.height;
  },
  
  addStarterItems() {
    const starterWeapon = Items.generate('laser_cannon', 'common');
    const starterShield = Items.generate('energy_barrier', 'common');
    const starterEngine = Items.generate('ion_thruster', 'common');
    
    if (starterWeapon) Items.addToStash(starterWeapon);
    if (starterShield) Items.addToStash(starterShield);
    if (starterEngine) Items.addToStash(starterEngine);
    
    if (starterWeapon) Items.equip(starterWeapon.id);
    if (starterShield) Items.equip(starterShield.id);
    if (starterEngine) Items.equip(starterEngine.id);
    
    Stats.calculate();
    Save.save();
    UI.renderAll();
  },
  
  initActUnlocks() {
    // Ensure act unlock state exists
    if (!State.meta.actsUnlocked) {
      State.meta.actsUnlocked = { act1: true };
    }
    // Sync with acts.json unlocked flags
    const acts = State.data.acts;
    if (acts) {
      for (const [actId, actData] of Object.entries(acts)) {
        if (actData.unlocked && !State.meta.actsUnlocked[actId]) {
          State.meta.actsUnlocked[actId] = true;
        }
      }
    }
  },
  
  // ========== MAIN LOOP ==========
  
  loop(time) {
    try {
      // Handle first frame / timer discontinuities (tab switch, iOS, etc.)
      const prev = Number.isFinite(this.lastTime) ? this.lastTime : time;
      let dt = (time - prev) / 1000;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      this.lastTime = time;

      // Runtime guardrails (NaN/Infinity + caps)
      Invariants.preFrame(dt, { phase: 'loop', t: time });
      
      // Update scene transitions
      SceneManager.updateTransition(dt);
      
      // Scene-specific updates
      const scene = SceneManager.getScene();
      
      if (scene === 'combat' && !State.ui.paused) {
        this.updateCombat(dt);
      }

      // Clear edge-triggered inputs (one-shot actions)
      if (State.input) {
        State.input.interactPressed = false;
      }
      // Post-update invariants: caps + core sanity + sampled entity checks
      Invariants.postFrame({ phase: 'postUpdate', act: State.world?.currentAct, zoneIndex: State.world?.zoneIndex });
      
      // Always render
      this.render(dt);
      
    } catch (error) {
      console.error('❌ Error in game loop:', error);
      // Capture deterministic debug dump (console + localStorage)
      Invariants.captureDump(error, {
        phase: 'loopCatch',
        t: time,
        act: State.world?.currentAct,
        zoneIndex: State.world?.zoneIndex,
        inCombat: State.run?.inCombat,
        counts: {
          bullets: State.bullets?.length || 0,
          enemyBullets: State.enemyBullets?.length || 0,
          enemies: State.enemies?.length || 0,
          pickups: State.pickups?.length || 0,
          particles: State.particles?.length || 0
        }
      });
    }
    
    requestAnimationFrame((t) => this.loop(t));
  },
  
  // ========== COMBAT UPDATE ==========
  
  updateCombat(dt) {
    // Don't update if zone not loaded yet
    if (!World.currentZone) return;
    
    State.run.stats.timeElapsed += dt;
    
    // Update camera to follow player
    Camera.update(dt, this.screenW, this.screenH);
    
    // Update world (view-based prewarm spawning to avoid pop-in)
    World.update(dt, this.screenW, this.screenH);
    
    // Update player
    Player.update(dt, this.canvas, true); // true = exploration mode

    // Obstacle/prop collisions (Asteroids, mines, etc.)
    // Runs after player movement, before death check.
    World.resolvePlayerObstacleCollisions(dt, this.screenW, this.screenH);
    
    // Check death
    if (Player.isDead()) {
      this.onDeath();
      return;
    }
    
    // Update enemies (pass camera offset)
    Enemies.update(dt, this.canvas);
    
    // Update bullets
    Bullets.update(dt, this.canvas);
    
    // Update pickups
    Pickups.update(dt, this.canvas);
    
    // Update particles
    Particles.update(dt);
    
    // Update HUD
    this.updateHUD();
  },
  
  // ========== RENDERING ==========
  
  render(dt) {
    const ctx = this.ctx;
    const scene = SceneManager.getScene();
    
    // Clear
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, this.screenW, this.screenH);
    
    // Only render combat if zone is actually loaded
    if ((scene === 'combat' || scene === 'loading') && World.currentZone) {
      this.renderCombat(ctx, dt);
    } else if (scene === 'loading') {
      // Show loading indicator
      ctx.fillStyle = '#00aaff';
      ctx.font = 'bold 24px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('LOADING...', this.screenW / 2, this.screenH / 2);
    }
    
    // Draw scene transitions on top
    SceneManager.drawTransition(ctx, this.screenW, this.screenH);
  },
  
  renderCombat(ctx, dt) {
    // Draw parallax background (world coords)
    World.drawParallax(ctx, this.screenW, this.screenH);
    
    // Apply camera transform for world objects
    ctx.save();
    Camera.applyTransform(ctx);
    
    // Draw world elements (obstacles, decorations, exits, portals)
    World.draw(ctx, this.screenW, this.screenH);
    
    // Draw pickups
    Pickups.draw(ctx);
    
    // Draw enemies
    Enemies.draw(ctx);
    
    // Draw bullets
    Bullets.draw(ctx);
    
    // Draw player
    Player.draw(ctx);
    
    // Draw particles
    Particles.draw(ctx);
    ctx.restore();
    
    // Draw screen-space UI (minimap, etc)
    this.drawMinimap(ctx);
  },
  
  // ========== MINIMAP ==========
  
  drawMinimap(ctx) {
    const zone = World.currentZone;
    if (!zone) return;
    
    const mapSize = 120;
    const mapX = this.screenW - mapSize - 10;
    const mapY = 10;
    const scale = mapSize / Math.max(zone.width, zone.height);
    
    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(mapX, mapY, mapSize, mapSize);
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);
    
    // Map bounds
    const zoneW = zone.width * scale;
    const zoneH = zone.height * scale;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, zoneW, zoneH);
    
    // Enemies (green dots)
    ctx.fillStyle = '#44aa44';
    for (const spawn of zone.enemySpawns) {
      if (!spawn.killed) {
        ctx.fillRect(
          mapX + spawn.x * scale - 1,
          mapY + spawn.y * scale - 1,
          2, 2
        );
      }
    }
    
    // Elites (yellow dots)
    ctx.fillStyle = '#ffaa00';
    for (const spawn of zone.eliteSpawns) {
      if (!spawn.killed) {
        ctx.fillRect(
          mapX + spawn.x * scale - 2,
          mapY + spawn.y * scale - 2,
          4, 4
        );
      }
    }
    
    // Boss (red dot)
    if (zone.bossSpawn && !zone.bossSpawn.killed) {
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(
        mapX + zone.bossSpawn.x * scale - 3,
        mapY + zone.bossSpawn.y * scale - 3,
        6, 6
      );
    }
    
    // Exit (orange)
    if (zone.exit) {
      ctx.fillStyle = '#ff8800';
      ctx.fillRect(
        mapX + zone.exit.x * scale - 3,
        mapY + zone.exit.y * scale - 3,
        6, 6
      );
    }
    
    // Portals (yellow pulse)
    ctx.fillStyle = '#ffdd00';
    for (const portal of zone.portals) {
      ctx.fillRect(
        mapX + portal.x * scale - 4,
        mapY + portal.y * scale - 4,
        8, 8
      );
    }
    
    // Player (cyan dot)
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(
      mapX + State.player.x * scale - 3,
      mapY + State.player.y * scale - 3,
      6, 6
    );
    
    // Viewport rectangle
    const camX = Camera.getX();
    const camY = Camera.getY();
    ctx.strokeStyle = 'rgba(0, 170, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mapX + camX * scale,
      mapY + camY * scale,
      this.screenW * scale,
      this.screenH * scale
    );
    
    // Zone label
    ctx.fillStyle = '#aaa';
    ctx.font = '10px Orbitron';
    ctx.textAlign = 'left';
    ctx.fillText(`Zone ${World.zoneIndex + 1}`, mapX + 4, mapY + mapSize - 4);
  },
  
  // ========== HUB ==========
  
  showHub() {
    // Hub UI is optional at boot, but required if we enter the hub flow.
    Contracts.assertHubUI();
    SceneManager.goToHub();
    this.hideModal('startModal');
    this.showModal('hubModal');
    this.renderHubUI();
  },
  
  renderHubUI() {
    // Update hub stats
    const scrapEl = document.getElementById('hubScrap');
    const levelEl = document.getElementById('hubLevel');
    const actsEl = document.getElementById('actList');
    
    if (scrapEl) scrapEl.textContent = State.meta.scrap;
    if (levelEl) levelEl.textContent = State.meta.level;
    
    // Render act list
    if (actsEl) {
      const acts = State.data.acts;
      if (!acts) {
        actsEl.innerHTML = '<p>No acts loaded</p>';
        return;
      }
      
      let html = '';
      for (const [actId, act] of Object.entries(acts)) {
        const unlocked = State.meta.actsUnlocked?.[actId] || false;
        const completed = State.meta.actsCompleted?.[actId] || false;
        
        html += `
          <div class="act-card ${unlocked ? '' : 'locked'} ${completed ? 'completed' : ''}"
               onclick="${unlocked ? `Game.startAct('${actId}')` : ''}">
            <div class="act-icon">${completed ? '✅' : (unlocked ? '🚀' : '🔒')}</div>
            <div class="act-info">
              <h3>${act.name}</h3>
              <p>${act.description || ''}</p>
              <div class="act-meta">
                <span>${act.zones || 3} Zones</span>
                ${!unlocked ? '<span class="locked-text">LOCKED</span>' : ''}
              </div>
            </div>
          </div>
        `;
      }
      actsEl.innerHTML = html;
    }
    
    // Update UI panels
    UI.renderAll();
  },
  
  // ========== GAME FLOW ==========
  
  startAct(actId) {
    console.log(`🎮 Starting ${actId}...`);

    // Combat HUD is required once we enter combat (updateHUD writes without null-checks).
    Contracts.assertCombatHUD();
    
    // Generate seed (can be customized)
    const seed = SeededRandom.fromString(actId + '_' + Date.now());
    
    // Hide hub modal
    this.hideModal('hubModal');
    
    // Reset run state
    resetRun();
    State.run.active = true;
    State.run.currentAct = actId;
    
    // Calculate stats and init HP
    Stats.calculate();
    Stats.initializeHP();
    
    // Start the act via SceneManager
    SceneManager.startAct(actId, seed);
    
    // Announce
    const actName = State.data.acts?.[actId]?.name || actId;
    this.announce(`⚔️ ${actName.toUpperCase()}`, 'boss');
    
    UI.renderAll();
  },
  
  returnToHub() {
    SceneManager.returnToHub('portal');
    
    // Add earned resources
    State.meta.scrap += State.run.scrapEarned;
    
    Save.save();
    
    setTimeout(() => {
      this.showHub();
    }, 600);
  },
  
  onBossKilled(actId) {
    // Mark act as completed
    if (!State.meta.actsCompleted) State.meta.actsCompleted = {};
    State.meta.actsCompleted[actId] = true;
    
    // Unlock next acts from rewards
    const actData = State.data.acts?.[actId];
    if (actData?.rewards?.unlocks) {
      for (const unlockId of actData.rewards.unlocks) {
        State.meta.actsUnlocked[unlockId] = true;
      }
    }
    
    // Add completion bonus
    if (actData?.rewards?.completionScrap) {
      State.run.scrapEarned += actData.rewards.completionScrap;
    }
    
    Save.save();
    
    this.announce('✨ ACT COMPLETE!', 'boss');
  },
  
  onDeath() {
    Contracts.assertDeathUI();
    State.run.active = false;
    
    // Add earnings (partial)
    State.meta.scrap += Math.floor(State.run.scrapEarned * 0.5);
    State.meta.totalRuns++;
    State.meta.totalKills += State.run.stats.kills;
    State.meta.totalPlaytime += State.run.stats.timeElapsed;
    
    Save.save();
    
    // Update death modal
    document.getElementById('deathWave').textContent = `Zone ${World.zoneIndex + 1}`;
    document.getElementById('deathKills').textContent = State.run.stats.kills;
    document.getElementById('deathDmg').textContent = this.formatNumber(State.run.stats.damageDealt);
    document.getElementById('deathTime').textContent = this.formatTime(State.run.stats.timeElapsed);
    document.getElementById('deathScrapEarned').textContent = Math.floor(State.run.scrapEarned * 0.5);
    document.getElementById('deathXP').textContent = State.run.xpEarned;
    
    this.showModal('deathModal');
  },
  
  restart() {
    this.hideModal('deathModal');
    this.startAct(State.run.currentAct || 'act1');
  },
  
  toHub() {
    this.hideModal('deathModal');
    this.showHub();
  },
  
  // ========== VENDOR ==========
  
  openVendor() {
    Contracts.assertVendorUI();
    State.ui.paused = true;
    UI.renderVendor();
    this.showModal('vendorModal');
  },
  
  closeVendor() {
    this.hideModal('vendorModal');
    State.ui.paused = false;
    Stats.calculate();
    UI.renderShipStats();
  },
  
  // ========== UI HELPERS ==========
  
  announce(text, type = '') {
    const el = document.getElementById('announcement');
    if (el) {
      el.textContent = text;
      el.className = 'show ' + type;
      setTimeout(() => el.className = '', 2500);
    }
  },
  
  updateHUD() {
    const p = State.player;
    const zone = World.currentZone;
    
    document.getElementById('hudCells').textContent = State.run.cells;
    document.getElementById('hudScrap').textContent = State.meta.scrap + State.run.scrapEarned;
    document.getElementById('levelBadge').textContent = State.meta.level;
    
    // Show zone instead of wave
    const zoneText = zone?.isBossZone ? '⚠️ BOSS' : `ZONE ${World.zoneIndex + 1}`;
    document.getElementById('waveDisplay').textContent = zoneText;
    
    // XP
    const xpProgress = Leveling.getProgress();
    const xpNeeded = Leveling.xpForLevel(State.meta.level);
    document.getElementById('xpBar').style.width = (xpProgress * 100) + '%';
    document.getElementById('xpText').textContent = `${State.meta.xp} / ${xpNeeded} XP`;
    
    // HP
    const hpPct = (p.hp / p.maxHP) * 100;
    const hpBar = document.getElementById('hpBar');
    hpBar.style.width = hpPct + '%';
    hpBar.className = 'player-bar-fill hp' + (hpPct < 30 ? ' low' : '');
    document.getElementById('hpText').textContent = `${Math.ceil(p.hp)}/${Math.round(p.maxHP)}`;
    
    // Shield
    const shPct = p.maxShield > 0 ? (p.shield / p.maxShield) * 100 : 0;
    document.getElementById('shieldBar').style.width = shPct + '%';
    document.getElementById('shieldText').textContent = `${Math.ceil(p.shield)}/${Math.round(p.maxShield)}`;
  },
  
  showModal(id) {
    document.getElementById(id)?.classList.add('active');
  },
  
  hideModal(id) {
    document.getElementById(id)?.classList.remove('active');
  },
  
  // ========== DEBUG ==========
  
  debugAddItems() {
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    for (let i = 0; i < 8; i++) {
      const rarity = rarities[Math.floor(Math.random() * rarities.length)];
      const item = Items.generateRandom(rarity);
      if (item) Items.addToStash(item);
    }
    Save.save();
    UI.renderAll();
  },
  
  debugAddResources() {
    State.meta.scrap += 1000;
    State.meta.skillPoints += 10;
    State.meta.statPoints += 20;
    State.run.cells += 500;
    Save.save();
    UI.renderAll();
    this.renderHubUI();
  },
  
  debugUnlockAll() {
    const acts = State.data.acts;
    if (acts) {
      for (const actId of Object.keys(acts)) {
        State.meta.actsUnlocked[actId] = true;
      }
    }
    Save.save();
    this.renderHubUI();
    console.log('🔓 All acts unlocked');
  },
  
  debugTeleport(zoneIndex) {
    if (World.currentZone) {
      World.loadZone(zoneIndex);
      console.log(`📍 Teleported to zone ${zoneIndex}`);
    }
  },
  
  // ========== FORMATTING ==========
  
  formatNumber(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.floor(n).toString();
  },
  
  formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
};

// Global access
window.Game = Game;

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => Game.init());