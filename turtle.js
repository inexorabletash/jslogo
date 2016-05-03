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

function CanvasTurtle(canvas_ctx, turtle_ctx, width, height) {
  'use strict';

  // Stub for old browsers w/ canvas but no text functions
  canvas_ctx.fillText = canvas_ctx.fillText || function fillText(string, x, y) { };

  width = Number(width);
  height = Number(height);

  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }
  function font(px, name) {
    px = Number(px);
    name = String(name).toLowerCase();
    if (['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace'].indexOf(name) === -1)
      name = JSON.stringify(name);
    return String(px) + 'px ' + name;
  }

  var self = this;
  function moveto(x, y) {
    function _go(x1, y1, x2, y2) {
      if (self.filling) {
        canvas_ctx.lineTo(x1, y1);
        canvas_ctx.lineTo(x2, y2);
      } else if (self.down) {
        canvas_ctx.beginPath();
        canvas_ctx.moveTo(x1, y1);
        canvas_ctx.lineTo(x2, y2);
        canvas_ctx.stroke();
      }
    }

    var ix, iy, wx, wy, fx, fy, less;

    while (true) {
      // TODO: What happens if we switch modes and turtle is outside bounds?

      switch (self.turtlemode) {
        case 'window':
          _go(self.x, self.y, x, y);
          self.x = x;
          self.y = y;
          return;

        default:
        case 'wrap':
        case 'fence':

          // fraction before intersecting
          fx = 1;
          fy = 1;

          if (x < 0) {
            fx = (self.x - 0) / (self.x - x);
          } else if (x >= width) {
            fx = (self.x - width) / (self.x - x);
          }

          if (y < 0) {
            fy = (self.y - 0) / (self.y - y);
          } else if (y >= height) {
            fy = (self.y - height) / (self.y - y);
          }

          // intersection point (draw current to here)
          ix = x;
          iy = y;

          // endpoint after wrapping (next "here")
          wx = x;
          wy = y;

          if (fx < 1 && fx <= fy) {
            less = (x < 0);
            ix = less ? 0 : width;
            iy = self.y - fx * (self.y - y);
            x += less ? width : -width;
            wx = less ? width : 0;
            wy = iy;
          } else if (fy < 1 && fy <= fx) {
            less = (y < 0);
            ix = self.x - fy * (self.x - x);
            iy = less ? 0 : height;
            y += less ? height : -height;
            wx = ix;
            wy = less ? height : 0;
          }

          _go(self.x, self.y, ix, iy);

          if (self.turtlemode === 'fence') {
            // FENCE - stop on collision
            self.x = ix;
            self.y = iy;
            return;
          } else {
            // WRAP - keep going
            self.x = wx;
            self.y = wy;
            if (fx === 1 && fy === 1) {
              return;
            }
          }

          break;
      }
    }
  }

  this.move = function(distance) {
    var x, y, point, saved_x, saved_y, EPSILON = 1e-3;

    point = Math.abs(distance) < EPSILON;

    if (point) {
      saved_x = this.x;
      saved_y = this.y;
      distance = EPSILON;
    }

    x = this.x + distance * Math.cos(this.r);
    y = this.y - distance * Math.sin(this.r);
    moveto(x, y);

    if (point) {
      this.x = saved_x;
      this.y = saved_y;
    }
  };

  this.turn = function(angle) {
    this.r -= deg2rad(angle);
  };

  this.penup = function() { this.down = false; };
  this.pendown = function() { this.down = true; };

  this.setpenmode = function(penmode) {
    this.penmode = penmode;
    canvas_ctx.globalCompositeOperation =
                (this.penmode === 'erase') ? 'destination-out' :
                (this.penmode === 'reverse') ? 'xor' : 'source-over';
  };
  this.getpenmode = function() { return this.penmode; };

  this.setturtlemode = function(turtlemode) { this.turtlemode = turtlemode; };
  this.getturtlemode = function() { return this.turtlemode; };

  this.ispendown = function() { return this.down; };

  // To handle additional color names (localizations, etc):
  // turtle.colorAlias = function(name) {
  //   return {internationalorange: '#FF4F00', ... }[name];
  // };
  this.colorAlias = null;

  var STANDARD_COLORS = {
    0: "black", 1: "blue", 2: "lime", 3: "cyan",
    4: "red", 5: "magenta", 6: "yellow", 7: "white",
    8: "brown", 9: "tan", 10: "green", 11: "aquamarine",
    12: "salmon", 13: "purple", 14: "orange", 15: "gray"
  };

  function parseColor(color) {
    color = String(color);
    if (STANDARD_COLORS.hasOwnProperty(color))
      return STANDARD_COLORS[color];
    if (self.colorAlias)
      return self.colorAlias(color) || color;
    return color;
  }

  this.setcolor = function(color) {
    this.color = color;
    canvas_ctx.strokeStyle = parseColor(this.color);
    canvas_ctx.fillStyle = parseColor(this.color);
  };
  this.getcolor = function() { return this.color; };

  this.setwidth = function(width) {
    this.width = width;
    canvas_ctx.lineWidth = this.width;
  };
  this.getwidth = function() { return this.width; };

  this.setfontsize = function(size) {
    this.fontsize = size;
    canvas_ctx.font = font(this.fontsize, this.fontname);
  };
  this.getfontsize = function() { return this.fontsize; };

  this.setfontname = function(name) {
    this.fontname = name;
    canvas_ctx.font = font(this.fontsize, this.fontname);
  };
  this.getfontname = function() { return this.fontname; };

  this.setposition = function(x, y) {
    x = (x === undefined) ? this.x : x + (width / 2);
    y = (y === undefined) ? this.y : -y + (height / 2);

    moveto(x, y);
  };

  this.towards = function(x, y) {
    x = x + (width / 2);
    y = -y + (height / 2);

    return 90 - rad2deg(Math.atan2(this.y - y, x - this.x));
  };

  this.setheading = function(angle) {
    this.r = deg2rad(90 - angle);
  };

  this.clearscreen = function() {
    this.home();
    this.clear();
  };

  this.clear = function() {
    canvas_ctx.clearRect(0, 0, width, height);
    canvas_ctx.save();
    try {
      canvas_ctx.fillStyle = parseColor(this.bgcolor);
      canvas_ctx.fillRect(0, 0, width, height);
    } finally {
      canvas_ctx.restore();
    }
  };

  this.home = function() {
    moveto(width / 2, height / 2);
    this.r = deg2rad(90);
  };

  this.showturtle = function() {
    this.visible = true;
  };

  this.hideturtle = function() {
    this.visible = false;
  };

  this.isturtlevisible = function() {
    return this.visible;
  };

  this.getheading = function() {
    return 90 - rad2deg(this.r);
  };

  this.getxy = function() {
    return [this.x - (width / 2), -this.y + (height / 2)];
  };

  this.drawtext = function(text) {
    canvas_ctx.save();
    canvas_ctx.translate(this.x, this.y);
    canvas_ctx.rotate(-this.r);
    canvas_ctx.fillText(text, 0, 0);
    canvas_ctx.restore();
  };

  this.filling = 0;
  this.beginpath = function() {
    if (this.filling === 0) {
      this.saved_turtlemode = this.turtlemode;
      this.turtlemode = 'window';
      ++this.filling;
      canvas_ctx.beginPath();
    }
  };

  this.fillpath = function(fillcolor) {
    --this.filling;
    if (this.filling === 0) {
      canvas_ctx.closePath();
      canvas_ctx.fillStyle = parseColor(fillcolor);
      canvas_ctx.fill();
      canvas_ctx.fillStyle = this.color;
      if (this.down)
        canvas_ctx.stroke();
      this.turtlemode = this.saved_turtlemode;
    }
  };

  this.fill = function() {
    canvas_ctx.floodFill(this.x, this.y);
  };

  this.arc = function(angle, radius) {
    var self = this;

    if (self.turtlemode == 'wrap') {
      [self.x, self.x + width, self.x - width].forEach(function(x) {
        [self.y, self.y + height, self.y - height].forEach(function(y) {
          if (!self.filling)
            canvas_ctx.beginPath();
          canvas_ctx.arc(x, y, radius, -self.r, -self.r + deg2rad(angle), false);
          if (!self.filling)
            canvas_ctx.stroke();
        });
      });
    } else {
      if (!self.filling)
        canvas_ctx.beginPath();
      canvas_ctx.arc(self.x, self.y, radius, -self.r, -self.r + deg2rad(angle), false);
      if (!self.filling)
        canvas_ctx.stroke();
    }
  };

  this.getstate = function() {
    return {
      isturtlestate: true,
      color: this.getcolor(),
      xy: this.getxy(),
      heading: this.getheading(),
      penmode: this.getpenmode(),
      turtlemode: this.getturtlemode(),
      width: this.getwidth(),
      fontsize: this.getfontsize(),
      fontname: this.getfontname(),
      visible: this.isturtlevisible(),
      pendown: this.down
    };
  };

  this.setstate = function(state) {
    if ((! state) || ! state.isturtlestate) {
      throw new Error("Tried to restore a state that is not a turtle state");
    }
    this.penup();
    this.hideturtle();
    this.setturtlemode(state.turtlemode);
    this.setcolor(state.color);
    this.setwidth(state.width);
    this.setfontsize(state.fontsize);
    this.setfontname(state.fontname);
    this.setposition(state.xy[0], state.xy[1]);
    this.setheading(state.heading);
    this.setpenmode(state.penmode);
    if (state.visible) {
      this.showturtle();
    }
    if (state.pendown) {
      this.pendown();
    }
  };

  var last_x, last_y, last_r, last_visible;

  this.tick = function() {
    function invert(p) { return [-p[0], p[1]]; }

    requestAnimationFrame(this.tick.bind(this));
    if (this.x === last_x &&
        this.y === last_y &&
        this.r === last_r &&
        this.visible === last_visible)
      return;

    last_x = this.x;
    last_y = this.y;
    last_r = this.r;
    last_visible = this.visible;

    turtle_ctx.clearRect(0, 0, width, height);
    if (this.visible) {
      var ctx = turtle_ctx;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.PI/2 - this.r);
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
  };

  this.x = width / 2;
  this.y = height / 2;
  this.r = Math.PI / 2;

  this.bgcolor = '#ffffff';
  this.color = '#000000';
  this.width = 1;
  this.penmode = 'paint';
  this.fontsize = 14;
  this.fontname = 'sans-serif';
  this.turtlemode = 'wrap';
  this.visible = true;
  this.down = true;

  function init() {
    turtle_ctx.lineCap = 'round';
    turtle_ctx.strokeStyle = 'green';
    turtle_ctx.lineWidth = 2;

    canvas_ctx.lineCap = 'round';

    canvas_ctx.strokeStyle = parseColor(self.color);
    canvas_ctx.fillStyle = parseColor(self.color);
    canvas_ctx.lineWidth = self.width;
    canvas_ctx.font = font(self.fontsize, self.fontname);
    canvas_ctx.globalCompositeOperation =
      (self.penmode === 'erase') ? 'destination-out' :
      (self.penmode === 'reverse') ? 'xor' : 'source-over';
  }

  this.resize = function(w, h) {
    width = w;
    height = h;
    init();
  };

  init();
  this.tick();
}
