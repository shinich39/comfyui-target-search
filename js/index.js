"use strict";

import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { animate, sortBy } from "./util.js";

// const isInsideRectangle = LiteGraph.isInsideRectangle;

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
  const x = app.canvas.ds.visible_area[0] + app.canvas.ds.visible_area[2] * 0.5;
  const y = app.canvas.ds.visible_area[1] + app.canvas.ds.visible_area[3] * 0.5;
  return [x, y];
}

function getMouseCenter() {
  return [
    app.canvas.graph_mouse[0],
    app.canvas.graph_mouse[1],
  ]
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

function nodeToTarget(node) {
  return {
    id: node.id,
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

function slotToTarget(node, slot, isInput) {
  const slotIndex = isInput ? node.findInputSlot(slot.name) : node.findOutputSlot(slot.name);
  const slotPos = node.getConnectionPos(isInput, slotIndex);
  return {
    id: `${node.id}.${slotIndex}`,
    node: node,
    // nodeCX: node.pos[0] + node.size[0] * 0.5,
    // nodeCY: node.pos[1] + node.size[1] * 0.5,
    // nodeX: node.pos[0],
    // nodeY: node.pos[1],
    // nodeX1: Math.floor(node.pos[0]), // Math.floor(node.pos[0] / 64)
    // nodeY1: Math.floor(node.pos[1]), // Math.floor(node.pos[1] / 64)
    // nodeWidth: node.size[0],
    // nodeHeight: node.size[1],
    slot: slot,
    x: slotPos[0],
    y: slotPos[1],
    index: slotIndex,
    width: 10,
    height: 20,
  }
}

function getValidTargetNodes(node, type, isInput) {
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

function getValidTargetSlots(node, type, isInput) {
  const result = [];
  for (const n of app.graph._nodes) {
    if (n.id === node.id) {
      continue;
    }

    const slots = isInput ?
      n.outputs?.filter(e => isValidType(e.type, type)) ?? [] :
      n.inputs?.filter(e => isValidType(e.type, type)) ?? [];

    if (slots.length < 1) {
      continue;
    }

    result.push(...slots.map((s, i) => {
      return slotToTarget(n, s, !isInput);
    }));
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
    let hTargetNodes = [];
    let vTargetNodes = [];
    let hTargetSlots = [];
    let vTargetSlots = [];
    let animateTimer;
  
    function getNearestTargetNode() {
      const [x, y] = getCanvasCenter();
      return hTargetNodes.reduce((p, c) => {
        const dp = Math.abs(x - p.cx) + Math.abs(y - p.cy);
        const dc = Math.abs(x - c.cx) + Math.abs(y - c.cy);
        return dp < dc ? p : c;
      }, hTargetNodes[0]);
    }

    function getNearestTargetSlot() {
      // const [x, y] = getMouseCenter();
      const [x, y] = getCanvasCenter();
      return hTargetSlots.reduce((p, c) => {
        const dp = Math.abs(x - p.x) + Math.abs(y - p.y);
        const dc = Math.abs(x - c.x) + Math.abs(y - c.y);
        return dp < dc ? p : c;
      }, hTargetSlots[0]);
    }
  
    function getHorizontalNodeIndex(target) {
      return hTargetNodes.findIndex(e => e.id === target.id);
    }
  
    function getVerticalNodeIndex(target) {
      return vTargetNodes.findIndex(e => e.id === target.id);
    }
  
    function getHorizontalSlotIndex(target) {
      return hTargetSlots.findIndex(e => e.id === target.id);
    }
  
    function getVerticalSlotIndex(target) {
      return vTargetSlots.findIndex(e => e.id === target.id);
    }

    function moveCanvasToTarget(x, y) {
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
        // const mouseX = app.canvas.graph_mouse[0];
        // const mouseY = app.canvas.graph_mouse[1];
        const offsetX = canvasW * 0.5 - x;
        const offsetY = canvasH * 0.5 - y;

        requestAnimationFrame(() => {
          animateCanvas(offsetX, offsetY, function([nx, ny], now, timer) {
            animateTimer = timer;
            moveCanvas(nx, ny);
            const diffX = (initialX - nx);
            const diffY = (initialY - ny);
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
      if (!onDrag) {
        return;
      }
      try {
        if (/^Arrow/.test(key)) {
          e.preventDefault();
          const currentTargetNode = getNearestTargetNode();
          let prevIndex, newIndex, newTarget;
          if (key === "ArrowLeft") {
            prevIndex = getHorizontalNodeIndex(currentTargetNode);
            newIndex = Math.max(0, Math.min(hTargetNodes.length - 1, prevIndex - 1));
            newTarget = hTargetNodes[newIndex];
          } else if (key === "ArrowRight") {
            prevIndex = getHorizontalNodeIndex(currentTargetNode);
            newIndex = Math.max(0, Math.min(hTargetNodes.length - 1, prevIndex + 1));
            newTarget = hTargetNodes[newIndex];
          } else if (key === "ArrowDown") {
            prevIndex = getVerticalNodeIndex(currentTargetNode);
            newIndex = Math.max(0, Math.min(vTargetNodes.length - 1, prevIndex + 1));
            newTarget = vTargetNodes[newIndex];
          } else if (key === "ArrowUp") {
            prevIndex = getVerticalNodeIndex(currentTargetNode);
            newIndex = Math.max(0, Math.min(vTargetNodes.length - 1, prevIndex - 1));
            newTarget = vTargetNodes[newIndex];
          }
          if (newTarget) {
            moveCanvasToTarget(newTarget.cx, newTarget.cy);
          }
        } else if (/^[wsad]$/.test(key)) {
          e.preventDefault();
          const currentTargetSlot = getNearestTargetSlot();
          let prevIndex, newIndex, newTarget;
          if (key === "a") {
            prevIndex = getHorizontalSlotIndex(currentTargetSlot);
            newIndex = Math.max(0, Math.min(hTargetSlots.length - 1, prevIndex - 1));
            newTarget = hTargetSlots[newIndex];
          } else if (key === "d") {
            prevIndex = getHorizontalSlotIndex(currentTargetSlot);
            newIndex = Math.max(0, Math.min(hTargetSlots.length - 1, prevIndex + 1));
            newTarget = hTargetSlots[newIndex];
          } else if (key === "s") {
            prevIndex = getVerticalSlotIndex(currentTargetSlot);
            newIndex = Math.max(0, Math.min(vTargetSlots.length - 1, prevIndex + 1));
            newTarget = vTargetSlots[newIndex];
          } else if (key === "w") {
            prevIndex = getVerticalSlotIndex(currentTargetSlot);
            newIndex = Math.max(0, Math.min(vTargetSlots.length - 1, prevIndex - 1));
            newTarget = vTargetSlots[newIndex];
          }
          if (newTarget) {
            moveCanvasToTarget(newTarget.x, newTarget.y);
          }
        }
      } catch(err) {
        console.error(err);
      } 
    }
  
    window.addEventListener("keydown", keydownEvent);
  
    const origProcessMouseDown = LGraphCanvas.prototype.processMouseDown;
    LGraphCanvas.prototype.processMouseDown = function(e) {
      const r = origProcessMouseDown?.apply(this, arguments);

      onDrag = chkDragging.apply(this, [e]);
      if (onDrag) {
        try {
          const { input, output, node, slot } = this.connecting_links[0];
          if (input || output) {
            isInput = !!input;
    
            initialNode = node;
            initialSlot = isInput ? input : output;
            initialType = initialSlot.type;
            initialSlotIndex = slot;

            initialState = {
              clientX: e.clientX,
              clientY: e.clientY,
              canvasX: e.canvasX,
              canvasY: e.canvasY,
              canvas_mouse: this.canvas_mouse,
              canvas_mouse: this.canvas_mouse,
              graph_mouse: this.graph_mouse,
              mouse: this.mouse, 
              last_mouse: this.last_mouse, 
              last_mouse_position: this.last_mouse_position,
              canvas_offset: this.ds.offset,
              canvas_scale: this.ds.scale,
            };
  
            const validTargetNodes = getValidTargetNodes(initialNode, initialType, isInput);
            const validTargetSlots = getValidTargetSlots(initialNode, initialType, isInput);
            const initialTargetNode = nodeToTarget(initialNode);
            const initialTargetSlot = slotToTarget(initialNode, initialSlot, isInput);
            
            hTargetNodes = sortBy([initialTargetNode, ...validTargetNodes], ["x1", "y1"]);
            vTargetNodes = sortBy([initialTargetNode, ...validTargetNodes], ["y1", "x1"]);
  
            hTargetSlots = sortBy([initialTargetSlot, ...validTargetSlots], ["x", "y"]);
            vTargetSlots = sortBy([initialTargetSlot, ...validTargetSlots], ["y", "x"]);
  
            // debug
            // console.log(hTargetNodes)
            // console.log(hTargetSlots)
          }
        } catch(err) {
          console.error(err);
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