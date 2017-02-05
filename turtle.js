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
    var r = a % b;
    return r < 0 ? r + b : r;
  }

  function CanvasTurtle(canvas_ctx, turtle_ctx, w, h, events) {
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

    this._clickx = this._clicky = 0;
    this._mousex = this._mousey = 0;
    this._buttons = 0;

    this._init();
    this._tick();

    if (events) {
      events.addEventListener('mousemove', function(e) {
        var rect = events.getBoundingClientRect();
        this._mousemove(e.clientX - rect.left, e.clientY - rect.top, e.buttons);
      }.bind(this));
      events.addEventListener('mousedown', function(e) {
        var rect = events.getBoundingClientRect();
        this._mouseclick(e.clientX - rect.left, e.clientY - rect.top, e.buttons);
      }.bind(this));
    }
  }

  Object.defineProperties(CanvasTurtle.prototype, {

    // Internal methods

    _init: {value: function() {
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

      [this.turtle_ctx, this.canvas_ctx].forEach(function(ctx) {
        ctx.setTransform(this.sx, 0, 0, -this.sy, this.width / 2, this.height / 2);
      }.bind(this));
    }},

    _tick: {value: function() {
      function invert(p) { return [-p[0], p[1]]; }

      requestAnimationFrame(this._tick.bind(this));
      var cur = JSON.stringify([this.x, this.y, this.r, this.visible,
                                this.sx, this.sy, this.width, this.height]);
      if (cur === this._last_state) return;
      this._last_state = cur;

      this.turtle_ctx.save();
      this.turtle_ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.turtle_ctx.clearRect(0, 0, this.width, this.height);
      this.turtle_ctx.restore();

      if (this.visible) {
        var ctx = this.turtle_ctx;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.PI/2 + this.r);
        ctx.beginPath();

        var points = [
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
          .forEach(function(pair, index) {
            ctx[index ? 'lineTo' : 'moveTo'](pair[0], pair[1]);
          });

        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }
    }},

    _moveto: {value: function(x, y, setpos) {

      var _go = function(x1, y1, x2, y2) {
        if (this.filling) {
          this.canvas_ctx.lineTo(x1, y1);
          this.canvas_ctx.lineTo(x2, y2);
        } else if (this.pendown) {
          this.canvas_ctx.beginPath();
          this.canvas_ctx.moveTo(x1, y1);
          this.canvas_ctx.lineTo(x2, y2);
          this.canvas_ctx.stroke();
        }
      }.bind(this);

      var w = this.width / this.sx, h = this.height / this.sy;

      var left = -w / 2, right = w / 2,
          bottom = -h / 2, top = h / 2;

      var ix, iy, wx, wy, fx, fy, less;

      // Hack to match UCBLogo: don't draw line across viewport on
      // `SETXY 250 10  SETXY 300 20  SETXY 350 30`
      if (setpos && this.turtlemode === 'wrap') {
        var oob = (x < left || x >= right || y < bottom || y >= top);
        var px = x, py = y;
        if (this.was_oob) {
          var dx = mod(x + w / 2, w) - (x + w / 2);
          var dy = mod(y + h / 2, h) - (y + h / 2);
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
          fx = 1;
          fy = 1;

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
          ix = x;
          iy = y;

          // endpoint after wrapping (next "here")
          wx = x;
          wy = y;

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
    }},

    _mousemove: {value: function(x, y, b) {
      this._mousex = (x - this.width / 2) / this.sx;
      this._mousey = (y - this.height / 2) / -this.sy;
      this._buttons = b;
    }},

    _mouseclick: {value: function(x, y, b) {
      this._clickx = (x - this.width / 2) / this.sx;
      this._clicky = (y - this.height / 2) / -this.sy;
      this._buttons = b;
    }},

    // API methods

    resize: {value: function(w, h) {
      this.width = w;
      this.height = h;
      this._init();
    }},

    move: {value: function(distance) {
      var x, y, point, saved_x, saved_y, EPSILON = 1e-3;

      point = Math.abs(distance) < EPSILON;

      if (point) {
        saved_x = this.x;
        saved_y = this.y;
        distance = EPSILON;
      }

      // Mostly for tests: limit precision
      var PRECISION = 10;
      function precision(n) {
        var f = Math.pow(10, PRECISION);
        return Math.round(n * f) / f;
      }

      x = precision(this.x + distance * Math.cos(this.r));
      y = precision(this.y + distance * Math.sin(this.r));
      this._moveto(x, y);

      if (point) {
        this.x = this.px = saved_x;
        this.y = this.px = saved_y;
      }
    }},

    turn: {value: function(angle) {
      this.r -= deg2rad(angle);
    }},

    towards: {value: function(x, y) {
      x = x;
      y = y;

      return 90 - rad2deg(Math.atan2(y - this.y, x - this.x));
    }},

    clearscreen: {value: function() {
      this.home();
      this.clear();
    }},

    clear: {value: function() {
      this.canvas_ctx.save();
      try {
        this.canvas_ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.canvas_ctx.clearRect(0, 0, this.width, this.height);
        this.canvas_ctx.fillStyle = this.bgcolor;
        this.canvas_ctx.fillRect(0, 0, this.width, this.height);
      } finally {
        this.canvas_ctx.restore();
      }
    }},

    home: {value: function() {
      this._moveto(0, 0);
      this.r = deg2rad(90);
    }},

    drawtext: {value: function(text) {
      this.canvas_ctx.save();
      this.canvas_ctx.translate(this.x, this.y);
      this.canvas_ctx.scale(1, -1);
      this.canvas_ctx.rotate(-this.r);
      this.canvas_ctx.fillText(text, 0, 0);
      this.canvas_ctx.restore();
    }},

    beginpath: {value: function() {
      if (this.filling === 0) {
        this.saved_turtlemode = this.turtlemode;
        this.turtlemode = 'window';
        ++this.filling;
        this.canvas_ctx.beginPath();
      }
    }},

    fillpath: {value: function(fillcolor) {
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
    }},

    fill: {value: function() {
      this.canvas_ctx.save();
      this.canvas_ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.canvas_ctx.floodFill(this.x*this.sx + this.width/2,
                                - this.y*this.sy + this.height/2);
      this.canvas_ctx.restore();
    }},

    arc: {value: function(angle, radius) {
      if (this.turtlemode == 'wrap') {
        [this.x,
         this.x + this.width / this.sx,
         this.x - this.width / this.sx].forEach(function(x) {
           [this.y,
            this.y + this.height / this.sy,
            this.y - this.height / this.sy].forEach(function(y) {
              if (!this.filling)
                this.canvas_ctx.beginPath();
              this.canvas_ctx.arc(x, y, radius, this.r, this.r - deg2rad(angle), angle > 0);
              if (!this.filling)
                this.canvas_ctx.stroke();
            }.bind(this));
         }.bind(this));
      } else {
        if (!this.filling)
          this.canvas_ctx.beginPath();
        this.canvas_ctx.arc(this.x, this.y, radius, this.r, this.r - deg2rad(angle), angle > 0);
        if (!this.filling)
          this.canvas_ctx.stroke();
      }
    }},

    getstate: {value: function() {
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
    }},

    setstate: {value: function(state) {
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
    }},

    // Properties

    pendown: {
      set: function(down) { this._down = down; },
      get: function() { return this._down; }
    },

    penmode: {
      get: function() { return this._penmode; },
      set: function(penmode) {
        this._penmode = penmode;
        this.canvas_ctx.globalCompositeOperation =
          (this.penmode === 'erase') ? 'destination-out' :
          (this.penmode === 'reverse') ? 'difference' : 'source-over';
        if (penmode === 'paint')
          this.canvas_ctx.strokeStyle = this.canvas_ctx.fillStyle = this.color;
        else
          this.canvas_ctx.strokeStyle = this.canvas_ctx.fillStyle = '#ffffff';
      }
    },

    turtlemode: {
      set: function(turtlemode) { this._turtlemode = turtlemode; },
      get: function() { return this._turtlemode; }
    },

    color: {
      get: function() { return this._color; },
      set: function(color) {
        this._color = color;
        this.canvas_ctx.strokeStyle = this._color;
        this.canvas_ctx.fillStyle = this._color;
      }
    },

    bgcolor: {
      get: function() { return this._bgcolor; },
      set: function(color) {
        this._bgcolor = color;
        this.clear();
      }
    },

    penwidth: {
      set: function(width) {
        this._penwidth = width;
        this.canvas_ctx.lineWidth = this._penwidth;
      },
      get: function() { return this._penwidth; }
    },


    fontsize: {
      set: function(size) {
        this._fontsize = size;
        this.canvas_ctx.font = font(this.fontsize, this.fontname);
      },
      get: function() { return this._fontsize; }
    },

    fontname: {
      set: function(name) {
        this._fontname = name;
        this.canvas_ctx.font = font(this.fontsize, this.fontname);
      },
      get: function() { return this._fontname; }
    },

    position: {
      set: function(coords) {
        var x = coords[0], y = coords[1];
        x = (x === undefined) ? this.x : x;
        y = (y === undefined) ? this.y : y;
        this._moveto(x, y, /*setpos*/true);
      },
      get: function() {
        return [this.x, this.y];
      }
    },

    heading: {
      get: function() {
        return 90 - rad2deg(this.r);
      },
      set: function(angle) {
        this.r = deg2rad(90 - angle);
      }
    },

    visible: {
      set: function(visible) { this._visible = visible; },
      get: function() { return this._visible; }
    },

    scrunch: {
      set: function(sc) {
        var sx = sc[0], sy = sc[1];
        this.x = this.px = this.x / sx * this.sx;
        this.y = this.py = this.y / sy * this.sy;

        this.sx = sx;
        this.sy = sy;

        [this.turtle_ctx, this.canvas_ctx].forEach(function(ctx) {
          ctx.setTransform(this.sx, 0, 0, -this.sy, this.width / 2, this.height / 2);
        }.bind(this));
      },
      get: function() {
        return [this.sx, this.sy];
      }
    },

    mousepos: {
      get: function() { return [this._mousex, this._mousey]; }
    },

    clickpos: {
      get: function() { return [this._clickx, this._clicky]; }
    },

    button: {
      get: function() { return this._buttons; }
    }

  });

  global.CanvasTurtle = CanvasTurtle;
}(self));
