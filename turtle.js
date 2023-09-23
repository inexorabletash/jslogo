//
// Turtle Graphics in Javascript
//

// Copyright (C) 2011 Joshua Bell
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

(function(global) {
  'use strict';

  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  function font(px, name) {
    px = Number(px);
    name = String(name).toLowerCase();
    if (['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace'].indexOf(name) === -1)
      name = JSON.stringify(name);
    return String(px) + 'px ' + name;
  }

  function mod(a, b) {
    const r = a % b;
    return r < 0 ? r + b : r;
  }

  class CanvasTurtle {
    // --------------------------------------------------
    // Private state
    #clickx = 0;
    #clicky = 0;
    #mousex = 0;
    #mousey = 0;
    #buttons = 0;
    #touches = [];
    #down = false;
    #last_state;
    #turtles;
    #currentturtle;
    #clipboard;

    // For properties
    #penmode;
    #turtlemode;
    #color;
    #bgcolor;
    #penwidth;
    #fontsize;
    #fontname;
    #visible;


    // --------------------------------------------------

    constructor(canvas_ctx, turtle_ctx, w, h, events) {
      // Stub for old browsers w/ canvas but no text functions
      canvas_ctx.fillText = canvas_ctx.fillText || function fillText(string, x, y) { };

      this.canvas_ctx = canvas_ctx;
      this.turtle_ctx = turtle_ctx;
      this.width = Number(w);
      this.height = Number(h);

      this.x = this.py = 0;
      this.y = this.py = 0;
      this.r = Math.PI / 2;

      this.sx = this.sy = 1;

      this.color = '#000000';
      this.bgcolor = '#ffffff';
      this.penwidth = 1;
      this.penmode = 'paint';
      this.fontsize = 14;
      this.fontname = 'sans-serif';
      this.turtlemode = 'wrap';
      this.visible = true;
      this.pendown = true;

      this.was_oob = false;
      this.filling = 0;

      this.#turtles = [{}];
      this.#currentturtle = 0;

      this.#init();
      this.#tick();

      if (events) {
        const mouse_handler = e => {
          const rect = events.getBoundingClientRect();
          this.#mousemove(e.clientX - rect.left, e.clientY - rect.top, e.buttons);
        };
        ['mousemove', 'mousedown', 'mouseup'].forEach(e => {
          events.addEventListener(e, mouse_handler);
        });

        const touch_handler = e => {
          const rect = events.getBoundingClientRect();
          const touches = [...e.touches].map(t => {
            return {x: t.clientX - rect.left, y: t.clientY - rect.top};
          });
          this.#touch(touches);
        };
        ['touchstart', 'touchmove', 'touchend'].forEach(e => {
          events.addEventListener(e, touch_handler);
        });

      }
    }

    // Internal methods

    #init() {
      this.turtle_ctx.lineCap = 'round';
      this.turtle_ctx.strokeStyle = 'green';
      this.turtle_ctx.lineWidth = 2;

      this.canvas_ctx.lineCap = 'round';

      // Restore canvas state controlled by properties:
      this.color = this.color;
      this.fontname = this.fontname;
      this.fontsize = this.fontsize;
      this.penmode = this.penmode;
      this.penwidth = this.penwidth;

      [this.turtle_ctx, this.canvas_ctx].forEach(ctx => {
        ctx.setTransform(this.sx, 0, 0, -this.sy, this.width / 2, this.height / 2);
      });
    }

    #tick() {
      function invert(p) { return [-p[0], p[1]]; }

      requestAnimationFrame(this.#tick.bind(this));
      const cur = JSON.stringify([this.x, this.y, this.r, this.visible,
                                  this.sx, this.sy, this.width, this.height, this.#turtles]);
      if (cur === this.#last_state) return;
      this.#last_state = cur;

      this.turtle_ctx.save();
      this.turtle_ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.turtle_ctx.clearRect(0, 0, this.width, this.height);
      this.turtle_ctx.restore();

      function _draw(ctx, turtle) {
        if (turtle.visible) {
          ctx.save();
          ctx.translate(turtle.x, turtle.y);
          ctx.rotate(Math.PI/2 + turtle.r);
          ctx.beginPath();

          const points = [
            [0, -20], // Head
            [2.5, -17],
            [3, -12],

            [6, -10],
            [9, -13], // Arm
            [13, -12],
            [18, -4],
            [18, 0],
            [14, -1],
            [10, -7],

            [8, -6], // Shell
            [10, -2],
            [9, 3],
            [6, 10],

            [9, 13], // Foot
            [6, 15],
            [3, 12],

            [0, 13],
          ];

          points.concat(points.slice(1, -1).reverse().map(invert))
            .forEach((pair, index) => {
              ctx[index ? 'lineTo' : 'moveTo'](pair[0], pair[1]);
            });

          ctx.closePath();
          ctx.stroke();

          ctx.restore();
        }
      }

      _draw(this.turtle_ctx, this);

      for (let i = 0; i < this.#turtles.length; ++i) {
        if (this.#turtles[i] === undefined || i === this.currentturtle) {
          continue;
        }
        _draw(this.turtle_ctx, this.#turtles[i]);
      }
    }

    #moveto(x, y, setpos) {

      const _go = (x1, y1, x2, y2) => {
        if (this.pendown) {
          if (this.filling) {
            this.canvas_ctx.lineTo(x1, y1);
            this.canvas_ctx.lineTo(x2, y2);
          } else {
            this.canvas_ctx.beginPath();
            this.canvas_ctx.moveTo(x1, y1);
            this.canvas_ctx.lineTo(x2, y2);
            this.canvas_ctx.stroke();
          }
        }
      };

      const w = this.width / this.sx, h = this.height / this.sy;

      const left = -w / 2, right = w / 2,
          bottom = -h / 2, top = h / 2;

      // Hack to match UCBLogo: don't draw line across viewport on
      // `SETXY 250 10  SETXY 300 20  SETXY 350 30`
      if (setpos && this.turtlemode === 'wrap') {
        const oob = (x < left || x >= right || y < bottom || y >= top);
        const px = x, py = y;
        if (this.was_oob) {
          const dx = mod(x + w / 2, w) - (x + w / 2);
          const dy = mod(y + h / 2, h) - (y + h / 2);
          x += dx;
          y += dy;
          this.x = this.px + dx;
          this.y = this.py + dy;
        }
        this.was_oob = oob;
        this.px = px;
        this.py = py;
      } else {
        this.was_oob = false;
      }

      while (true) {
        // TODO: What happens if we switch modes and turtle is outside bounds?

        switch (this.turtlemode) {
        case 'window':
          _go(this.x, this.y, x, y);
          this.x = this.px = x;
          this.y = this.py = y;
          return;

        default:
        case 'wrap':
        case 'fence':

          // fraction before intersecting
          let fx = 1;
          let fy = 1;

          if (x < left) {
            fx = (this.x - left) / (this.x - x);
          } else if (x > right) {
            fx = (this.x - right) / (this.x - x);
          }

          if (y < bottom) {
            fy = (this.y - bottom) / (this.y - y);
          } else if (y > top) {
            fy = (this.y - top) / (this.y - y);
          }

          if (!isFinite(fx) || !isFinite(fy)) {
            console.log('x', x, 'left', left, 'right', right);
            console.log('y', y, 'bottom', bottom, 'top', top);
            console.log('fx', fx, 'fy', fy);
            throw new Error("Wrapping error: non-finite fraction");
          }

          // intersection point (draw current to here)
          let ix = x;
          let iy = y;

          // endpoint after wrapping (next "here")
          let wx = x;
          let wy = y;
          let less;

          if (fx < 1 && fx <= fy) {
            less = (x < left);
            ix = less ? left : right;
            iy = this.y - fx * (this.y - y);
            x += less ? w : -w;
            wx = less ? right : left;
            wy = iy;
          } else if (fy < 1 && fy <= fx) {
            less = (y < bottom);
            ix = this.x - fy * (this.x - x);
            iy = less ? bottom : top;
            y += less ? h : -h;
            wx = ix;
            wy = less ? top : bottom;
          }

          _go(this.x, this.y, ix, iy);

          if (this.turtlemode === 'fence') {
            // FENCE - stop on collision
            this.x = this.px = ix;
            this.y = this.py = iy;
            return;
          } else {
            // WRAP - keep going
            this.x = wx;
            this.y = wy;
            if (fx >= 1 && fy >= 1)
              return;
          }

          break;
        }
      }
    }

    #mousemove(x, y, b) {
      this.#mousex = (x - this.width / 2) / this.sx;
      this.#mousey = (y - this.height / 2) / -this.sy;
      this.#buttons = b;
    }

    #mouseclick(x, y, b) {
      this.#clickx = (x - this.width / 2) / this.sx;
      this.#clicky = (y - this.height / 2) / -this.sy;
      this.#buttons = b;
    }

    #touch(touches) {
      this.#touches = touches.map(touch => {
        return [
          (touch.x - this.width / 2) / this.sx,
          (touch.y - this.height / 2) / -this.sy
        ];
      });
    }

    // API methods

    resize(w, h) {
      this.width = w;
      this.height = h;
      this.#init();
    }

    move(distance) {
      const EPSILON = 1e-3;

      let point = Math.abs(distance) < EPSILON;

      let saved_x, saved_y;
      if (point) {
        saved_x = this.x;
        saved_y = this.y;
        distance = EPSILON;
      }

      // Mostly for tests: limit precision
      const PRECISION = 10;
      function precision(n) {
        const f = Math.pow(10, PRECISION);
        return Math.round(n * f) / f;
      }

      let x = precision(this.x + distance * Math.cos(this.r));
      let y = precision(this.y + distance * Math.sin(this.r));
      this.#moveto(x, y);

      if (point) {
        this.x = this.px = saved_x;
        this.y = this.px = saved_y;
      }
    }

    turn(angle) {
      this.r -= deg2rad(angle);
    }

    towards(x, y) {
      x = x;
      y = y;

      return 90 - rad2deg(Math.atan2(y - this.y, x - this.x));
    }

    clearscreen() {
      this.home();
      this.clearturtles();
      this.clear();
    }

    clear() {
      this.canvas_ctx.save();
      try {
        this.canvas_ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.canvas_ctx.clearRect(0, 0, this.width, this.height);
        this.canvas_ctx.fillStyle = this.bgcolor;
        this.canvas_ctx.fillRect(0, 0, this.width, this.height);
      } finally {
        this.canvas_ctx.restore();
      }
    }

    clearturtles() {
      this.#turtles = [{}];
      this.#currentturtle = 0;
    }

    home() {
      this.#moveto(0, 0);
      this.r = deg2rad(90);
    }

    drawtext(text) {
      this.canvas_ctx.save();
      this.canvas_ctx.translate(this.x, this.y);
      this.canvas_ctx.scale(1, -1);
      this.canvas_ctx.rotate(-this.r);
      this.canvas_ctx.fillText(text, 0, 0);
      this.canvas_ctx.restore();
    }

    beginpath() {
      if (this.filling === 0) {
        this.saved_turtlemode = this.turtlemode;
        this.turtlemode = 'window';
        ++this.filling;
        this.canvas_ctx.beginPath();
      }
    }

    fillpath(fillcolor) {
      --this.filling;
      if (this.filling === 0) {
        this.canvas_ctx.closePath();
        this.canvas_ctx.fillStyle = fillcolor;
        this.canvas_ctx.fill();
        this.canvas_ctx.fillStyle = this.color;
        if (this.pendown)
          this.canvas_ctx.stroke();
        this.turtlemode = this.saved_turtlemode;
      }
    }

    fill() {
      this.canvas_ctx.save();
      this.canvas_ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.canvas_ctx.floodFill(this.x*this.sx + this.width/2,
                                - this.y*this.sy + this.height/2);
      this.canvas_ctx.restore();
    }

    arc(angle, radius) {
      if (this.turtlemode == 'wrap') {
        [this.x,
         this.x + this.width / this.sx,
         this.x - this.width / this.sx].forEach(x => {
           [this.y,
            this.y + this.height / this.sy,
            this.y - this.height / this.sy].forEach(y => {
              if (!this.filling)
                this.canvas_ctx.beginPath();
              this.canvas_ctx.arc(x, y, radius, this.r, this.r - deg2rad(angle), angle > 0);
              if (!this.filling)
                this.canvas_ctx.stroke();
            });
         });
      } else {
        if (!this.filling)
          this.canvas_ctx.beginPath();
        this.canvas_ctx.arc(this.x, this.y, radius, this.r, this.r - deg2rad(angle), angle > 0);
        if (!this.filling)
          this.canvas_ctx.stroke();
      }
    }

    getstate() {
      return {
        isturtlestate: true,
        color: this.color,
        bgcolor: this.bgcolor,
        position: this.position,
        heading: this.heading,
        penmode: this.penmode,
        turtlemode: this.turtlemode,
        width: this.width,
        fontsize: this.fontsize,
        fontname: this.fontname,
        visible: this.visible,
        pendown: this.pendown,
        scrunch: this.scrunch
      };
    }

    setstate(state) {
      if ((! state) || ! state.isturtlestate) {
        throw new Error("Tried to restore a state that is not a turtle state");
      }
      this.turtlemode = state.turtlemode;
      this.color = state.color;
      this.bgcolor = state.bgcolor;
      this.penwidth = state.penwidth;
      this.fontsize = state.fontsize;
      this.fontname = state.fontname;
      this.position = state.position;
      this.heading = state.heading;
      this.penmode = state.penmode;
      this.scrunch = state.scrunch;
      this.visible = state.visible;
      this.pendown = state.pendown;
    }

    copy(w, h) {
      const x = this.width / 2 + this.x * this.sx;
      const y = this.height / 2 - this.y * this.sy;
      w *= this.sx;
      h *= this.sy;
      this.#clipboard = this.canvas_ctx.getImageData(x, y, w, h);
    }

    paste() {
      if (!this.#clipboard)
        return;

      const x = this.width / 2 + this.x * this.sx;
      const y = this.height / 2 - this.y * this.sy;
      this.canvas_ctx.putImageData(this.#clipboard, x, y);
    }

    // Properties

    set pendown(down) { this.#down = down; }
    get pendown() { return this.#down; }

    get penmode() { return this.#penmode; }
    set penmode(penmode) {
      this.#penmode = penmode;
      this.canvas_ctx.globalCompositeOperation =
        (this.penmode === 'erase') ? 'destination-out' :
        (this.penmode === 'reverse') ? 'difference' : 'source-over';
      if (penmode === 'paint')
        this.canvas_ctx.strokeStyle = this.canvas_ctx.fillStyle = this.color;
      else
        this.canvas_ctx.strokeStyle = this.canvas_ctx.fillStyle = '#ffffff';
    }

    set turtlemode(turtlemode) { this.#turtlemode = turtlemode; }
    get turtlemode() { return this.#turtlemode; }

    get color() { return this.#color; }
    set color(color) {
      this.#color = color;
      this.canvas_ctx.strokeStyle = this.#color;
      this.canvas_ctx.fillStyle = this.#color;
    }

    get bgcolor() { return this.#bgcolor; }
    set bgcolor(color) {
      this.#bgcolor = color;
      this.clear();
    }

    set penwidth(width) {
      this.#penwidth = width;
      this.canvas_ctx.lineWidth = this.#penwidth;
    }
    get penwidth() { return this.#penwidth; }

    set fontsize(size) {
      this.#fontsize = size;
      this.canvas_ctx.font = font(this.fontsize, this.fontname);
    }
    get fontsize() { return this.#fontsize; }

    set fontname(name) {
      this.#fontname = name;
      this.canvas_ctx.font = font(this.fontsize, this.fontname);
    }
    get fontname() { return this.#fontname; }

    set position(coords) {
      let x = coords[0], y = coords[1];
      x = (x === undefined) ? this.x : x;
      y = (y === undefined) ? this.y : y;
      this.#moveto(x, y, /*setpos*/true);
    }
    get position() {
      return [this.x, this.y];
    }

    get heading() {
      return 90 - rad2deg(this.r);
    }
    set heading(angle) {
      this.r = deg2rad(90 - angle);
    }

    set visible(visible) { this.#visible = visible; }
    get visible() { return this.#visible; }

    set scrunch(sc) {
      const sx = sc[0], sy = sc[1];
      this.x = this.px = this.x / sx * this.sx;
      this.y = this.py = this.y / sy * this.sy;

      for (let i = 0; i < this.#turtles.length; ++i) {
        if (this.#turtles[i] === undefined || i == this.currentturtle) {
          continue;
        }
        let t = this.#turtles[i];
        t.x = t.x / sx * this.sx;
        t.y = t.y / sy * this.sy;
      }

      this.sx = sx;
      this.sy = sy;

      [this.turtle_ctx, this.canvas_ctx].forEach(ctx => {
        ctx.setTransform(this.sx, 0, 0, -this.sy, this.width / 2, this.height / 2);
      });
    }
    get scrunch() {
      return [this.sx, this.sy];
    }

    get bounds() {
      // xmin, xmax, ymin, ymax
      return [
        -this.width/2/this.sx, this.width/2/this.sx,
        -this.height/2/this.sy, this.height/2/this.sy
      ];
    }

    get mousepos() { return [this.#mousex, this.#mousey]; }

    get clickpos() { return [this.#clickx, this.#clicky]; }

    get button() { return this.#buttons; }

    get touches() { return this.#touches; }

    get currentturtle() { return this.#currentturtle; }
    set currentturtle(newturtle) {
      if (newturtle === this.#currentturtle) return;
      this.#turtles[this.#currentturtle] = {
        x: this.x,
        y: this.y,
        r: this.r,
        pendown: this.pendown,
        visible: this.visible,
      };
      this.#currentturtle = newturtle;
      if (this.#turtles[this.#currentturtle] !== undefined) {
        this.x = this.#turtles[this.#currentturtle].x;
        this.y = this.#turtles[this.#currentturtle].y;
        this.r = this.#turtles[this.#currentturtle].r;
        this.pendown = this.#turtles[this.#currentturtle].pendown;
        this.visible = this.#turtles[this.#currentturtle].visible;
      } else {
        this.x = 0;
        this.y = 0;
        this.r = Math.PI / 2;
        this.pendown = true;
        this.visible = true;
      }
      this.#turtles[this.#currentturtle] = {};
    }

    get turtles() { return this.#turtles.length; }
  }

  global.CanvasTurtle = CanvasTurtle;
}(self));
