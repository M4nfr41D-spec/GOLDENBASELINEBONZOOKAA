BONZOOKAA! – Full Hotfix Refresh (2026-01-13)
================================================

Fixes
-----
1) UI/ViewPort: "Game only visible as a narrow strip on the left" after moving Inventory/Stats/Skills into pause overlay (Key I).
   - Adds ResizeObserver on #gameContainer and a "collapsed size" guard + retry in Game.resize()
   - Locks CSS grid placement of #leftPanel / #gameContainer / #rightPanel to prevent DOM re-ordering from squeezing the canvas
   - Scene transitions force a layout-settled resize (double-rAF) and clear paused-ui

2) Render Layering: Parallax vs world/collision readability
   - Splits World.drawParallax() into:
       * World.drawParallaxBackground()
       * World.drawParallaxForeground()
     and renders Foreground after world-draw (but before UI).

Files
-----
- index.html
- main.js
- runtime/world/World.js
- runtime/world/SceneManager.js

Apply
-----
Overwrite the files with the ones in this zip (same paths).
If your current branch has diverged, merge these changes manually:
- Ensure grid placement CSS is explicit
- Ensure canvas resize uses #gameContainer rect + retry + ResizeObserver
- Ensure parallax FG renders after ctx.restore()
- Ensure scene transitions remove paused-ui and dispatch resize after layout settles

Notes
-----
If your overlay uses different IDs/classes than the generic list, it's still fine:
- The critical fix is ResizeObserver + explicit grid placement.
