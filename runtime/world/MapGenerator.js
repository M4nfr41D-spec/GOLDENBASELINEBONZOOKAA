// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// MapGenerator.js - Procedural Map Generation
// ============================================================
// Generates zones from seed + act config
// Same seed = same map layout

import { SeededRandom } from './SeededRandom.js';
import { State } from '../State.js';

export const MapGenerator = {
  
  // Generate a zone from act config and seed
  generate(actConfig, zoneSeed, options = {}) {
    const rng = new SeededRandom(zoneSeed);
    const cfg = actConfig.generation || {};
    const pickRange = (v, fallbackMin, fallbackMax) => {
      if (Array.isArray(v) && v.length >= 2) return rng.int(v[0], v[1]);
      if (typeof v === 'number') return v;
      return rng.int(fallbackMin, fallbackMax);
    };


    const depth = options.depth || 1;
    const mods = options.mods || [];

    // Apply depth & modifiers to generation parameters (combinatorial, no run is the same)
    const modSet = new Set(mods);
    const scale = (v, mult) => v * mult;

    // Base depth ramps (gentle; combat scaling handled elsewhere)
    const depthEnemyMult = 1 + Math.min(depth * 0.012, 1.6);  // up to +160%
    const depthEliteMult = 1 + Math.min(depth * 0.010, 1.2);  // up to +120%
    const depthObsMult   = 1 + Math.min(depth * 0.008, 1.0);  // up to +100%

    let enemyDensity = (cfg.enemyDensity || 0.0005) * depthEnemyMult;
    let eliteDensity = (cfg.eliteDensity || 0.00008) * depthEliteMult;
    let obstacleDensity = (cfg.obstacleDensity || 0.0002) * depthObsMult;

    // Modifier effects (kept small but cumulative)
    if (modSet.has('BULLET_HELL')) enemyDensity = scale(enemyDensity, 1.35);
    if (modSet.has('ELITE_PACKS')) eliteDensity = scale(eliteDensity, 1.55);
    if (modSet.has('FAST_ENEMIES')) enemyDensity = scale(enemyDensity, 1.10);
    if (modSet.has('DENSE_OBSTACLES')) obstacleDensity = scale(obstacleDensity, 1.35);
    if (modSet.has('MINEFIELD')) obstacleDensity = scale(obstacleDensity, 1.15);
    let crampedMult = 1.0;
    if (modSet.has('CRAMPED_ZONE')) crampedMult = 0.85;

    // Global exploration tuning overrides (config.json)
    // These exist to keep the engine testable (lower density / calmer combat) without touching act data.
    const tune = State.data.config?.exploration || {};
    if (typeof tune.enemyDensityMult === 'number') enemyDensity *= tune.enemyDensityMult;
    if (typeof tune.eliteDensityMult === 'number') eliteDensity *= tune.eliteDensityMult;
    
    // Zone dimensions
    let width = pickRange(cfg.width, 1500, 3000);
    let height = pickRange(cfg.height, 1500, 3000);
    if (crampedMult !== 1.0) { width = Math.floor(width * crampedMult); height = Math.floor(height * crampedMult); }

    // Map scale (exploration tuning)
    // NOTE: We intentionally scale the *world size* without scaling enemy counts linearly.
    // Density and hard caps (maxEnemySpawnsPerZone) remain the primary knobs to keep zones testable.
    const mapScale = (typeof tune.mapScale === 'number' && isFinite(tune.mapScale) && tune.mapScale > 0)
      ? tune.mapScale
      : 1.0;
    if (mapScale !== 1.0) {
      width = Math.max(600, Math.floor(width * mapScale));
      height = Math.max(600, Math.floor(height * mapScale));
    }
    
    // Generate zone structure
    const zone = {
      seed: zoneSeed,
      width: width,
      height: height,
      biome: actConfig.biome || 'space',
      
      // Spawn point (usually near edge)
      spawn: this.generateSpawnPoint(rng, width, height, cfg),
      
      // Exit point (opposite side from spawn)
      exit: null,
      
      // Enemy spawn positions
      enemySpawns: [],
      
      // Elite spawn positions  
      eliteSpawns: [],
      
      // Boss spawn (only in boss zones)
      bossSpawn: null,
      
      // Obstacles/Collision
      obstacles: [],
      
      // Decoration (asteroids, debris, etc)
      decorations: [],
      
      // Parallax layers
      parallax: this.generateParallax(rng, actConfig, width, height),
      
      // Pickups placed on map
      pickups: [],
      
      // Portals
      portals: []
    };
    
    // Generate exit opposite to spawn
    zone.exit = this.generateExitPoint(rng, zone.spawn, width, height);
    
    // Generate enemy spawns based on act config
    zone.enemySpawns = this.generateEnemySpawns(
      rng, 
      actConfig.enemies?.pool || ['grunt'],
      enemyDensity,
      width, 
      height,
      zone.spawn,
      zone.exit
    );

    // Optional: apply pack director (v9A0). Packs consume the existing spawn budget.
    // This keeps density/perf stable while adding composition variety.
    zone.enemySpawns = this.applyPackDirector(
      rng,
      zone.enemySpawns,
      actConfig.enemies?.pool || ['grunt'],
      zone.spawn,
      zone.exit
    );
    
    // Generate elite spawns
    zone.eliteSpawns = this.generateEliteSpawns(
      rng,
      actConfig.enemies?.elitePool || ['commander'],
      eliteDensity,
      width,
      height
    );
    
    // Generate obstacles
    zone.obstacles = this.generateObstacles(
      rng,
      obstacleDensity,
      width,
      height,
      { depth, mods }
    );
    
    // Generate decorations
    zone.decorations = this.generateDecorations(
      rng,
      actConfig.biome,
      width,
      height
    );
    
    return zone;
  },
  
  // Generate boss zone
  generateBossZone(actConfig, zoneSeed, options = {}) {
    const rng = new SeededRandom(zoneSeed);
    const cfg = actConfig.boss || {};
    
    // Boss arenas are more structured
    const width = cfg.arenaWidth || 1200;
    const height = cfg.arenaHeight || 1000;
    
    const zone = {
      seed: zoneSeed,
      width: width,
      height: height,
      biome: actConfig.biome,
      isBossZone: true,
      
      spawn: { x: width / 2, y: height - 100 },
      exit: null, // Portal appears after boss kill
      
      bossSpawn: { 
        x: width / 2, 
        y: 200,
        type: cfg.type || 'sentinel'
      },
      
      enemySpawns: [], // Boss spawns adds
      eliteSpawns: [],
      obstacles: this.generateBossArenaObstacles(rng, width, height),
      decorations: [],
      parallax: this.generateParallax(rng, actConfig, width, height),
      pickups: [],
      portals: []
    };
    
    return zone;
  },
  
  // Spawn point generation
  generateSpawnPoint(rng, w, h, cfg) {
    const edge = rng.pick(['bottom', 'left', 'right']);
    const margin = 100;
    
    switch (edge) {
      case 'bottom':
        return { x: rng.range(margin, w - margin), y: h - margin };
      case 'left':
        return { x: margin, y: rng.range(margin, h - margin) };
      case 'right':
        return { x: w - margin, y: rng.range(margin, h - margin) };
      default:
        return { x: w / 2, y: h - margin };
    }
  },
  
  // Exit point (opposite to spawn)
  generateExitPoint(rng, spawn, w, h) {
    const margin = 100;
    
    // If spawn is bottom, exit is top
    if (spawn.y > h / 2) {
      return { x: rng.range(margin, w - margin), y: margin };
    }
    // If spawn is left, exit is right
    if (spawn.x < w / 2) {
      return { x: w - margin, y: rng.range(margin, h - margin) };
    }
    // Otherwise exit is left
    return { x: margin, y: rng.range(margin, h - margin) };
  },
  
  // Enemy spawn positions
  generateEnemySpawns(rng, pool, density, w, h, spawn, exit) {
    const spawns = [];
    // Density is expressed as spawns per pixel^2.
    // We hard-cap the final amount to avoid runaway zones and keep perf + readability stable.
    const tune = State.data.config?.exploration || {};
    const maxSpawns = (typeof tune.maxEnemySpawnsPerZone === 'number') ? tune.maxEnemySpawnsPerZone : 120;
    const countRaw = Math.floor(w * h * density);
    const count = Math.max(0, Math.min(countRaw, maxSpawns));

    const minDistFromSpawn = (typeof tune.enemySpawnMinDistFromSpawn === 'number') ? tune.enemySpawnMinDistFromSpawn : 300;
    const minDistFromExit  = (typeof tune.enemySpawnMinDistFromExit === 'number') ? tune.enemySpawnMinDistFromExit : 200;
    const minDistBetween   = (typeof tune.enemySpawnMinDistBetween === 'number') ? tune.enemySpawnMinDistBetween : 150;
    
    for (let i = 0; i < count * 3 && spawns.length < count; i++) {
      const x = rng.range(100, w - 100);
      const y = rng.range(100, h - 100);
      
      // Check distances
      const distSpawn = Math.hypot(x - spawn.x, y - spawn.y);
      const distExit = Math.hypot(x - exit.x, y - exit.y);
      
      if (distSpawn < minDistFromSpawn) continue;
      if (distExit < minDistFromExit) continue;
      
      // Check distance from other spawns
      let tooClose = false;
      for (const s of spawns) {
        if (Math.hypot(x - s.x, y - s.y) < minDistBetween) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      
      spawns.push({
        x: x,
        y: y,
        type: rng.pick(pool),
        patrol: rng.pick(['static', 'circle', 'line', 'wander']),
        patrolRadius: rng.int(50, 150),
        active: false,
        killed: false
      });
    }
    
    return spawns;
  },

  // ------------------------------------------------------------
  // Pack Director (v9A0)
  // ------------------------------------------------------------
  // Turns a portion of single spawns into small packs (3-5 members)
  // using templates from data/packs.json when available.
  // Invariants:
  // - Does NOT increase total spawn count (consumes existing budget)
  // - Deterministic for a given rng/seed
  // - Keeps spawns away from spawn/exit
  applyPackDirector(rng, spawns, pool, spawnPt, exitPt) {
    const packsData = State.data.packs;
    if (!packsData || !Array.isArray(packsData.templates) || packsData.templates.length === 0) {
      return spawns;
    }

    // Settings (defaults chosen to be safe/testable)
    const packChance = (typeof packsData.packChance === 'number') ? packsData.packChance : 0.7;
    const minSize = (typeof packsData.packSizeMin === 'number') ? packsData.packSizeMin : 3;
    const maxSize = (typeof packsData.packSizeMax === 'number') ? packsData.packSizeMax : 5;
    const maxPacksPerZone = (typeof packsData.maxPacksPerZone === 'number') ? packsData.maxPacksPerZone : 6;
    const spacing = (typeof packsData.memberSpacing === 'number') ? packsData.memberSpacing : 120;
    const minDistFromSpawn = (typeof packsData.minDistFromSpawn === 'number') ? packsData.minDistFromSpawn : 350;
    const minDistFromExit  = (typeof packsData.minDistFromExit === 'number') ? packsData.minDistFromExit : 250;

    if (!Array.isArray(spawns) || spawns.length < minSize) return spawns;

    // Shuffle indices deterministically
    const idx = spawns.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = idx[i];
      idx[i] = idx[j];
      idx[j] = tmp;
    }

    // Helpers
    const pickTemplate = () => {
      // weighted pick
      let total = 0;
      for (const t of packsData.templates) total += (typeof t.weight === 'number' ? t.weight : 1);
      let r = rng.range(0, total);
      for (const t of packsData.templates) {
        r -= (typeof t.weight === 'number' ? t.weight : 1);
        if (r <= 0) return t;
      }
      return packsData.templates[0];
    };

    const validAnchor = (p) => {
      const ds = Math.hypot(p.x - spawnPt.x, p.y - spawnPt.y);
      const de = Math.hypot(p.x - exitPt.x,  p.y - exitPt.y);
      return ds >= minDistFromSpawn && de >= minDistFromExit;
    };

    const used = new Set();
    const out = [];
    let packsMade = 0;

    for (let k = 0; k < idx.length && packsMade < maxPacksPerZone; k++) {
      const i = idx[k];
      if (used.has(i)) continue;
      const anchor = spawns[i];
      if (!anchor || !validAnchor(anchor)) continue;

      if (rng.range(0, 1) > packChance) continue;

      const tpl = pickTemplate();

      // If template defines explicit members, build exact composition.
      let memberTypes = null;
      if (tpl && Array.isArray(tpl.members) && tpl.members.length > 0) {
        memberTypes = [];
        for (const mm of tpl.members) {
          const mi = (typeof mm.min === 'number') ? mm.min : 1;
          const ma = (typeof mm.max === 'number') ? mm.max : mi;
          const cnt = rng.int(mi, ma);
          for (let c = 0; c < cnt; c++) memberTypes.push(mm.type);
        }
        // Ensure minimal size
        if (memberTypes.length < 1) memberTypes = null;
      }

      const size = memberTypes ? memberTypes.length : rng.int(minSize, maxSize);

      // consume 'size' spawns from budget (anchor + size-1 additional)
      used.add(i);
      let consumed = 1;
      for (let kk = k + 1; kk < idx.length && consumed < size; kk++) {
        const j = idx[kk];
        if (used.has(j)) continue;
        used.add(j);
        consumed++;
      }

      // Create pack members around anchor
      for (let m = 0; m < size; m++) {
        const angle = rng.range(0, Math.PI * 2);
        const dist = rng.range(30, spacing);
        const px = anchor.x + Math.cos(angle) * dist;
        const py = anchor.y + Math.sin(angle) * dist;

        // Template can force composition via members, or allow random types via tpl.types; otherwise use pool
        let type = null;
        if (memberTypes && memberTypes.length === size) {
          type = memberTypes[m];
        } else if (tpl && Array.isArray(tpl.types) && tpl.types.length > 0) {
          type = rng.pick(tpl.types);
        }
        if (!type) type = rng.pick(pool);

        out.push({
          x: px,
          y: py,
          type,
          patrol: anchor.patrol,
          patrolRadius: anchor.patrolRadius,
          active: false,
          killed: false,
          packId: tpl?.id || 'pack'
        });
      }

      packsMade++;
    }

    // Add remaining singles (not consumed)
    for (let i = 0; i < spawns.length; i++) {
      if (used.has(i)) continue;
      out.push(spawns[i]);
    }

    return out;
  },
  
  // Elite spawn positions
  generateEliteSpawns(rng, pool, density, w, h) {
    const spawns = [];
    const tune = State.data.config?.exploration || {};
    const maxElites = (typeof tune.maxEliteSpawnsPerZone === 'number') ? tune.maxEliteSpawnsPerZone : 8;
    const countRaw = Math.floor(w * h * density);
    const count = Math.max(1, Math.min(countRaw, maxElites));
    
    for (let i = 0; i < count; i++) {
      spawns.push({
        x: rng.range(200, w - 200),
        y: rng.range(200, h - 200),
        type: rng.pick(pool),
        active: false,
        killed: false
      });
    }
    
    return spawns;
  },
  
  // Obstacles (collision)
  generateObstacles(rng, density, w, h, options = {}) {
    const obstacles = [];
    const tune = State.data.config?.exploration || {};
    const maxObs = (typeof tune.maxObstaclesPerZone === 'number') ? tune.maxObstaclesPerZone : 2500;
    const depth = options.depth || 1;
    const mods = options.mods || [];
    const modSet = new Set(mods);

    const countRaw = Math.floor(w * h * density);
    const count = Math.min(countRaw, maxObs);

    for (let i = 0; i < count; i++) {
      const typePool = modSet.has('MINEFIELD') ? ['asteroid','debris','mine','mine'] : ['asteroid','debris'];
      const type = rng.pick(typePool);
      obstacles.push({
        x: rng.range(100, w - 100),
        y: rng.range(100, h - 100),
        type: type,
        radius: type === 'asteroid' ? rng.int(30, 80) : rng.int(15, 30),
        rotation: rng.range(0, Math.PI * 2),
        destructible: true,
        hp: type === 'asteroid' ? rng.int(25, 60) : (type === 'mine' ? 6 : 12),
        damage: type === 'mine' ? (8 + Math.floor(depth * 0.25)) : 0
      });
    }
    
    return obstacles;
  },
  
  // Boss arena obstacles
  generateBossArenaObstacles(rng, w, h) {
    const obstacles = [];
    // Pillars for cover
    const pillarCount = rng.int(2, 4);
    
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2;
      const dist = rng.range(200, 350);
      obstacles.push({
        x: w / 2 + Math.cos(angle) * dist,
        y: h / 2 + Math.sin(angle) * dist,
        type: 'pillar',
        radius: 40,
        destructible: false
      });
    }
    
    return obstacles;
  },
  
  // Decorations (no collision, just visual)
  generateDecorations(rng, biome, w, h) {
    const decorations = [];
    const tune = State.data.config?.exploration || {};
    const maxDec = (typeof tune.maxDecorationsPerZone === 'number') ? tune.maxDecorationsPerZone : 6000;
    const countRaw = Math.floor(w * h * 0.001); // Sparse
    const count = Math.min(countRaw, maxDec);
    
    const types = {
      'space': ['star_cluster', 'nebula_wisp', 'dust_cloud'],
      'asteroid': ['rock_small', 'crystal', 'ice_chunk'],
      'station': ['debris', 'panel', 'wire']
    };
    
    const pool = types[biome] || types['space'];
    
    for (let i = 0; i < count; i++) {
      decorations.push({
        x: rng.range(0, w),
        y: rng.range(0, h),
        type: rng.pick(pool),
        scale: rng.range(0.5, 1.5),
        rotation: rng.range(0, Math.PI * 2),
        alpha: rng.range(0.3, 0.7)
      });
    }
    
    return decorations;
  },
  
  // Parallax layer generation
  generateParallax(rng, actConfig, w, h) {
    const cfg = actConfig.parallax || {};
    const tune = State.data.config?.exploration || {};
    const maxBgStars = (typeof tune.maxStarsBackground === 'number') ? tune.maxStarsBackground : 1800;
    const maxMidStars = (typeof tune.maxStarsMidground === 'number') ? tune.maxStarsMidground : 1200;
    
    return {
      // Layer 0: Deep background (slowest)
      background: {
        color: cfg.bgColor || '#0a0a15',
        stars: this.generateStarfield(rng, w * 1.5, h * 1.5, 0.0003, maxBgStars),
        scrollSpeed: 0.1
      },
      // Layer 1: Mid stars
      midground: {
        stars: this.generateStarfield(rng, w * 1.3, h * 1.3, 0.0002, maxMidStars),
        scrollSpeed: 0.3
      },
      // Layer 2: Near stars/nebula
      foreground: {
        objects: this.generateNebulaWisps(rng, w, h, cfg.nebula),
        scrollSpeed: 0.6
      },
      // Layer 3: Very close particles (fastest, optional)
      particles: {
        scrollSpeed: 0.9
      }
    };
  },
  
  // Generate starfield
  generateStarfield(rng, w, h, density, maxCount = null) {
    const stars = [];
    const countRaw = Math.floor(w * h * density);
    const cap = (typeof maxCount === 'number' && Number.isFinite(maxCount) && maxCount > 0)
      ? Math.floor(maxCount)
      : null;
    const count = cap ? Math.min(countRaw, cap) : countRaw;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rng.range(0, w),
        y: rng.range(0, h),
        size: rng.range(0.5, 2),
        brightness: rng.range(0.3, 1),
        twinkle: rng.chance(0.3)
      });
    }
    
    return stars;
  },
  
  // Generate nebula wisps
  generateNebulaWisps(rng, w, h, nebulaConfig) {
    if (!nebulaConfig?.enabled) return [];
    
    const wisps = [];
    const count = nebulaConfig.count || rng.int(3, 8);
    const color = nebulaConfig.color || '#4400aa';
    
    for (let i = 0; i < count; i++) {
      wisps.push({
        x: rng.range(0, w),
        y: rng.range(0, h),
        width: rng.range(200, 500),
        height: rng.range(100, 300),
        color: color,
        alpha: rng.range(0.05, 0.15),
        rotation: rng.range(0, Math.PI * 2)
      });
    }
    
    return wisps;
  },
  
  // Create zone seed from act + zone index
  createZoneSeed(actSeed, zoneIndex) {
    const a = (actSeed >>> 0);
    const z = ((zoneIndex + 1) >>> 0);
    return (a ^ Math.imul(z, 0x9E3779B9)) >>> 0;
  }
};

export default MapGenerator;