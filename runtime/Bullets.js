// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// BULLETS.js - Projectile System
// ============================================================

import { State } from './State.js';
import { Enemies } from './Enemies.js';
import { Player } from './Player.js';

export const Bullets = {
  // Spawn a new bullet
  spawn(config) {
    State.bullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || -500,
      damage: config.damage || 10,
      size: config.size || 4,
      pierce: config.piercing || 0,
      hits: 0,
      isCrit: config.crit || false,
      isPlayer: config.isPlayer !== false
    });
  },
  
  // Spawn enemy bullet
  spawnEnemy(config) {
    State.enemyBullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || 200,
      damage: config.damage || 10,
      size: config.size || 6
    });
  },
  
  // Update all bullets
  update(dt, canvas) {
    // Player bullets
    for (let i = State.bullets.length - 1; i >= 0; i--) {
      const b = State.bullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.bullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.bullets.splice(i, 1);
          continue;
        }
      }
      // Check collision with asteroid props (player bullets only)
      const zoneAsteroids = zone?.asteroids;
      if (b.isPlayer && Array.isArray(zoneAsteroids) && zoneAsteroids.length) {
        let hitAsteroid = false;
        for (const a of zoneAsteroids) {
          if (!a || a.destroyed) continue;
          const distA = Math.hypot(b.x - a.x, b.y - a.y);
          if (distA < (b.size + (a.radius || 50))) {
            // Damage asteroid
            a.hp = (typeof a.hp === 'number') ? a.hp - b.damage : 0;

            // Small impact feedback (keep it cheap)
            State.particles.push({
              x: b.x,
              y: b.y,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              life: 0.18,
              maxLife: 0.18,
              color: '#cccccc',
              size: 2
            });

            // Destroyed -> drop scrap pickup
            if (a.hp <= 0) {
              a.destroyed = true;
              const acfg = State.data.config?.asteroids || {};
              const sMin = (typeof acfg.scrapMin === 'number') ? acfg.scrapMin : 2;
              const sMax = (typeof acfg.scrapMax === 'number') ? acfg.scrapMax : 6;
              const sizeFactor = Math.max(0.7, Math.min(1.6, (a.radius || 50) / 50));
              const value = Math.floor((sMin + Math.random() * (sMax - sMin + 1)) * sizeFactor);
              State.pickups.push({
                type: 'scrap',
                x: a.x,
                y: a.y,
                vx: (Math.random() - 0.5) * 60,
                vy: (Math.random() - 0.5) * 60,
                life: 12,
                value: Math.max(1, value)
              });
            }

            // Player bullets stop on impact (per your default)
            State.bullets.splice(i, 1);
            hitAsteroid = true;
            break;
          }
        }
        if (hitAsteroid) continue;
      }

      // Check collision with enemies
      for (const e of State.enemies) {
        if (e.dead) continue;
        
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        if (dist < b.size + e.size) {
          // Hit!
          const killData = Enemies.damage(e, b.damage, b.isCrit);
          
          // Spawn damage number
          this.spawnDamageNumber(b.x, b.y, b.damage, b.isCrit);
          
          // Handle kill rewards
          if (killData) {
            this.onEnemyKilled(killData);
          }
          
          b.hits++;
          if (b.hits > b.pierce) {
            State.bullets.splice(i, 1);
          }
          break;
        }
      }
    }
    
    // Enemy bullets
    for (let i = State.enemyBullets.length - 1; i >= 0; i--) {
      const b = State.enemyBullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      }
      // Check collision with player
      const p = State.player;
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist < b.size + 15) {
        Player.takeDamage(b.damage);
        if (b.dot) Player.applyDot(b.dot);
        State.enemyBullets.splice(i, 1);
      }
    }
  },
  
  // Spawn floating damage number
  spawnDamageNumber(x, y, damage, isCrit) {
    const cfg = State.data.config?.effects?.damageNumbers || {};
    
    // Config values with Diablo-style defaults
    const baseSize = cfg.baseSize || 16;
    const critSize = cfg.critSize || 28;
    const normalColor = cfg.normalColor || '#ffffff';
    const critColor = cfg.critColor || '#ffcc00';
    const bigHitColor = cfg.bigHitColor || '#ff6600';
    const floatSpeed = cfg.floatSpeed || 120;
    const duration = cfg.duration || 0.9;
    const spread = cfg.spread || 30;
    
    // Big hit threshold (relative to player damage)
    const bigHitThreshold = State.player.damage * 3;
    const isBigHit = damage >= bigHitThreshold;
    
    let color = normalColor;
    let size = baseSize;
    
    if (isCrit) {
      color = critColor;
      size = critSize;
    }
    if (isBigHit) {
      color = bigHitColor;
      size = critSize + 4;
    }
    
    State.particles.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y,
      vx: (Math.random() - 0.5) * 50,
      vy: -floatSpeed,
      life: duration,
      maxLife: duration,
      text: Math.round(damage).toString(),
      isText: true,
      color: color,
      size: size,
      isCrit: isCrit,
      scale: isCrit ? 1.5 : 1.0  // For punch animation
    });
  },
  
  // Handle enemy kill rewards
  onEnemyKilled(killData) {
    const cfg = State.data.config;
    
    // XP
    import('./Leveling.js').then(module => {
      module.Leveling.addXP(killData.xp);
    });
    
    // Cells
    const baseCells = cfg?.economy?.cellsPerKill || 3;
    let cells = baseCells;
    if (killData.isElite) cells *= 3;
    if (killData.isBoss) cells *= 10;
    State.run.cells += Math.floor(cells);
    
    // Scrap
    const baseScrap = cfg?.economy?.scrapPerKill || 5;
    let scrap = baseScrap;
    if (killData.isElite) scrap *= (cfg?.economy?.eliteScrapMult || 3);
    if (killData.isBoss) scrap *= (cfg?.economy?.bossScrapMult || 10);
    State.run.scrapEarned += Math.floor(scrap);
    
    // Loot drop check
    this.checkLootDrop(killData);
  },
  
  // Check for item drop
  checkLootDrop(killData) {
    const cfg = State.data.config?.loot;
    if (!cfg) return;
    
    let dropChance = cfg.baseDropChance || 0.03;
    if (killData.isElite) dropChance = cfg.eliteDropChance || 0.25;
    if (killData.isBoss) dropChance = cfg.bossDropChance || 1.0;
    
    // Apply luck
    dropChance *= (1 + State.player.luck * 0.02);
    
    if (Math.random() < dropChance) {
      // Spawn pickup
      State.pickups.push({
        type: 'item',
        x: killData.x,
        y: killData.y,
        vx: (Math.random() - 0.5) * 50,
        vy: -50 + Math.random() * 30,
        life: 10,
        rarity: killData.isBoss ? 'legendary' : null,
        rarityFloor: killData.isElite ? 'rare' : null
      });
    }
    
    // Always drop cells pickup
    State.pickups.push({
      type: 'cells',
      x: killData.x + (Math.random() - 0.5) * 20,
      y: killData.y,
      vx: (Math.random() - 0.5) * 40,
      vy: -30 + Math.random() * 20,
      value: killData.isBoss ? 50 : (killData.isElite ? 20 : 5),
      life: 8
    });
    
    // Chance for scrap pickup
    if (Math.random() < 0.3 || killData.isElite || killData.isBoss) {
      State.pickups.push({
        type: 'scrap',
        x: killData.x + (Math.random() - 0.5) * 20,
        y: killData.y,
        vx: (Math.random() - 0.5) * 40,
        vy: -30 + Math.random() * 20,
        value: killData.isBoss ? 100 : (killData.isElite ? 30 : 10),
        life: 10
      });
    }
  },
  
  // Draw all bullets
  draw(ctx) {
    // Player bullets
    ctx.fillStyle = '#00ffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 10;
    
    for (const b of State.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Trail
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = b.size * 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    
    ctx.shadowBlur = 0;
    
    // Enemy bullets
    ctx.fillStyle = '#ff4444';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 8;
    
    for (const b of State.enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.shadowBlur = 0;
  }
};

export default Bullets;
