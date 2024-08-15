"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { animate, sortBy } from "./util.js";

const isInsideRectangle = LiteGraph.isInsideRectangle;

function chkDragging(e) {
  // const isLeftClick = e.buttons === 1;
  // const isRightClick = e.buttons === 2;
  // var node = this.graph.getNodeOnPos( e.canvasX, e.canvasY, this.visible_nodes, 5 );
  // var _ = [
  //   !this.graph,
  //   !this.last_mouse_dragging,
  //   this.block_click,
  //   this.dragging_rectangle,
  //   this.selected_group && !this.read_only,
  //   this.dragging_canvas,
  //   !((this.allow_interaction || (node && node.flags.allow_interaction)) && !this.read_only),
  //   this.connecting_links && this.connecting_links.length > 0,
  //   !isLeftClick,
  // ];

  // onDrag = !_.reduce((p, c) => p || c, false);

  return this.connecting_links && this.connecting_links.length > 0;
}

function getVisibleArea() {
  return {
    left: this.ds.visible_area[0],
    top: this.ds.visible_area[1],
    width: this.ds.visible_area[2],
    height: this.ds.visible_area[3],
    right: this.ds.visible_area[0] + this.ds.visible_area[2], 
    bototm: this.ds.visible_area[1] + this.ds.visible_area[3], 
  }
}

function getCanvasCenter() {
  const x = this.ds.visible_area[0] + this.ds.visible_area[2] * 0.5;
  const y = this.ds.visible_area[1] + this.ds.visible_area[3] * 0.5;
  return { x, y };
}

function isValidType(a, b) {
  a = a.toLowerCase();
  if (["any", "*"].indexOf(a) > -1) {
    return true;
  }
  b = b.toLowerCase();
  if (["any", "*"].indexOf(b) > -1) {
    return true;
  }
  return a === b;
}

// get slots
// function getValidTargets(node, type, isInput) {
//   const result = [];
//   for (const n of app.graph._nodes) {
//     if (n.id === node.id) {
//       continue;
//     }

//     const slots = isInput ?
//       n.outputs?.filter(e => isValidType(e.type, type)) ?? [] :
//       n.inputs?.filter(e => isValidType(e.type, type)) ?? [];

//     if (slots.length < 1) {
//       continue;
//     }

//     result.push(...slots.map((s, i) => {
//       const slotIndex = isInput ? n.findOutputSlot(s.name) : n.findInputSlot(s.name);
//       const slotPos = n.getConnectionPos(isInput, slotIndex);
//       return {
//         node: n,
//         nodeX: n.pos[0] + n.size[0] * 0.5,
//         nodeY: n.pos[1] + n.size[1] * 0.5,
//         slot: s,
//         slotX: slotPos[0],
//         slotY: slotPos[1],
//         slotIndex: slotIndex,
//       }
//     }));
//   }
//   return result;
// }

function nodeToTarget(node) {
  return {
    node: node,
    cx: node.pos[0] + node.size[0] * 0.5,
    cy: node.pos[1] + node.size[1] * 0.5,
    x: node.pos[0],
    y: node.pos[1],
    x1: Math.floor(node.pos[0]), // Math.floor(node.pos[0] / 64)
    y1: Math.floor(node.pos[1]), // Math.floor(node.pos[1] / 64)
    width: node.size[0],
    height: node.size[1],
  }
}

// get nodes
function getValidTargets(node, type, isInput) {
  const result = [];
  for (const n of app.graph._nodes) {
    if (n.id === node.id) {
      continue;
    }

    const slots = isInput ?
      n.outputs?.filter(e => isValidType(e.type, type)) ?? [] :
      n.inputs?.filter(e => isValidType(e.type, type)) ?? [];

    if (slots.length > 0) {
      result.push(nodeToTarget(n));
    }
  }
  return result;
}

function moveCanvas(x, y) {
  app.canvas.ds.offset[0] = x;
  app.canvas.ds.offset[1] = y;
  if (app.canvas.ds.onredraw) {
    app.canvas.ds.onredraw(app.canvas.ds);
  }
}

function renderCanvas() {
  app.canvas.draw(true, true);
}

function animateCanvas(dstX, dstY, cb, time = 1000) {
  const srcX = app.canvas.ds.offset[0];
  const srcY = app.canvas.ds.offset[1];
  const data = [
    [srcX, srcY],
    [dstX, dstY],
    [dstX, dstY],
    [dstX, dstY],
  ];

  let tick = 10;

  animate(data, cb, time, tick);
}

;(() => {
  try {
    let onDrag = false;
    let isInput;
    let initialState;
    let initialNode;
    let initialType;
    let initialSlot;
    let initialSlotIndex;
    let initialTargets = [];
    let vTargets = [];
    let hTargets = [];
    let currentTarget;
    let animateTimer;
  
    function getNearestTarget(x, y) {
      return initialTargets.reduce((p, c) => {
        const dp = Math.abs(x - p.x) + Math.abs(y - p.y);
        const dc = Math.abs(x - c.x) + Math.abs(y - c.y);
        return dp < dc ? p : c;
      }, initialTargets[0]);
    }
  
    function getHorizontalIndex(target) {
      return hTargets.findIndex(e => e.node.id === target.node.id);
    }
  
    function getVerticalIndex(target) {
      return vTargets.findIndex(e => e.node.id === target.node.id);
    }
  
    function moveCanvasToTarget(target) {
      try {
        if (animateTimer) {
          clearTimeout(animateTimer);
        }
  
        const initialGraphMouseX = app.canvas.graph_mouse[0];
        const initialGraphMouseY = app.canvas.graph_mouse[1];
        const initialMouseX = app.canvas.mouse[0];
        const initialMouseY = app.canvas.mouse[1];
        const initialX = app.canvas.ds.offset[0];
        const initialY = app.canvas.ds.offset[1];
        const canvasW = app.canvas.ds.visible_area[2];
        const canvasH = app.canvas.ds.visible_area[3];
        const offsetX = canvasW * 0.5 - target.cx;
        const offsetY = canvasH * 0.5 - target.cy;

        requestAnimationFrame(() => {
          animateCanvas(offsetX, offsetY, function([x, y], now, timer) {
            animateTimer = timer;
            moveCanvas(x, y);
            const diffX = (initialX - x);
            const diffY = (initialY - y);
            const mouse = [initialMouseX + diffX, initialMouseY + diffY];
            app.canvas.mouse[0] = mouse[0];
            app.canvas.mouse[1] = mouse[1];
            app.canvas.last_mouse = mouse;
            app.canvas.graph_mouse[0] = initialGraphMouseX + diffX;
            app.canvas.graph_mouse[1] = initialGraphMouseY + diffY;
            renderCanvas();
          }, 384);
        });
      } catch(err) {
        console.error(err);
      }
    }
  
    function keydownEvent(e) {
      const { key } = e;
      if (onDrag && /^Arrow/.test(key)) {
        e.preventDefault();
        let prevIndex, newIndex, newTarget;
        if (key === "ArrowLeft") {
          prevIndex = getHorizontalIndex(currentTarget);
          newIndex = Math.max(0, Math.min(hTargets.length - 1, prevIndex - 1));
          newTarget = hTargets[newIndex];
        } else if (key === "ArrowRight") {
          prevIndex = getHorizontalIndex(currentTarget);
          newIndex = Math.max(0, Math.min(hTargets.length - 1, prevIndex + 1));
          newTarget = hTargets[newIndex];
        } else if (key === "ArrowDown") {
          prevIndex = getVerticalIndex(currentTarget);
          newIndex = Math.max(0, Math.min(vTargets.length - 1, prevIndex + 1));
          newTarget = vTargets[newIndex];
        } else if (key === "ArrowUp") {
          prevIndex = getVerticalIndex(currentTarget);
          newIndex = Math.max(0, Math.min(vTargets.length - 1, prevIndex - 1));
          newTarget = vTargets[newIndex];
        }
        if (newTarget) {
          currentTarget = newTarget;
          moveCanvasToTarget(currentTarget);
        }
      }
    }
  
    window.addEventListener("keydown", keydownEvent);
  
    const origProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
    LGraphCanvas.prototype.processMouseDown = function(e) {
      const r = origProcessMouseDown?.apply(this, arguments);
  
      onDrag = chkDragging.apply(this, [e]);
      if (onDrag) {
        const { input, output, node, slot } = this.connecting_links[0];
        if (input || output) {
          isInput = !!input;
  
          // initialState = {
          //   clientX: e.clientX,
          //   clientY: e.clientY,
          //   canvasX: e.canvasX,
          //   canvasY: e.canvasY,
          //   canvas_mouse: this.canvas_mouse,
          //   canvas_mouse: this.canvas_mouse,
          //   graph_mouse: this.graph_mouse,
          //   mouse: this.mouse, 
          //   last_mouse: this.last_mouse, 
          //   last_mouse_position: this.last_mouse_position,
          //   canvas_offset: this.ds.offset,
          //   canvas_scale: this.ds.scale,
          // };
  
          initialNode = node;
          initialSlot = isInput ? input : output;
          initialType = initialSlot.type;
          initialSlotIndex = slot;
  
          const validTargets = getValidTargets(initialNode, initialType, isInput);
          const initialTarget = nodeToTarget(initialNode);
          
          hTargets = sortBy([initialTarget, ...validTargets], ["x1", "y1"]);
          vTargets = sortBy([initialTarget, ...validTargets], ["y1", "x1"]);
  
          initialTargets = hTargets;
  
          // get canvas center
          const cc = getCanvasCenter.apply(this);
  
          // get nearest slot in targets
          currentTarget = getNearestTarget(cc.x, cc.y);
        }
      }
  
      return r;
    }
  
    // const origProcessMouseMove = LGraphCanvas.prototype.processMouseMove;
    // LGraphCanvas.prototype.processMouseMove = function(e) {
    //   const r = origProcessMouseMove?.apply(this, arguments);
  
    //   if (onDrag) {
    //     // console.log(e.clientX - initialClientX, e.clientY - initialClientY);
    //   }
  
    //   return r;
    // }
  
    const origProcessMouseUp = LGraphCanvas.prototype.processMouseUp;
    LGraphCanvas.prototype.processMouseUp = function(e) {
      const r = origProcessMouseUp?.apply(this, arguments);
      if (onDrag) {
        onDrag = false;
      }
      return r;
    }
  } catch(err) {
    console.error(err);
  }
})();

app.registerExtension({
	name: `shinich39.TargetSearch`,
});