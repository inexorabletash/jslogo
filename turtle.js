//
// Turtle Graphics in Javascript
//

// Copyright (C) 2011 Joshua Bell
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

function CanvasTurtle(canvas_ctx, turtle_ctx, width, height) {
  width = Number(width);
  height = Number(height);

  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  var self = this;
  function moveto(x, y) {

    function _go(x1, y1, x2, y2) {
      if (self.down) {
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

  var STANDARD_COLORS = {
    0: "black", 1: "blue", 2: "lime", 3: "cyan",
    4: "red", 5: "magenta", 6: "yellow", 7: "white",
    8: "brown", 9: "tan", 10: "green", 11: "aquamarine",
    12: "salmon", 13: "purple", 14: "orange", 15: "gray"
  };

  this.setcolor = function(color) {
    if (STANDARD_COLORS[color] !== undefined) {
      this.color = STANDARD_COLORS[color];
    } else {
      this.color = color;
    }
    canvas_ctx.strokeStyle = this.color;
    canvas_ctx.fillStyle = this.color;
  };
  this.getcolor = function() { return this.color; };

  this.setwidth = function(width) {
    this.width = width;
    canvas_ctx.lineWidth = this.width;
  };
  this.getwidth = function() { return this.width; };

  this.setfontsize = function(size) {
    this.fontsize = size;
    canvas_ctx.font = this.fontsize + 'px sans-serif';
  };
  this.getfontsize = function() { return this.fontsize; };

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

  this.arc = function(angle, radius) {
    var self = this;
    if (this.turtlemode == 'wrap') {
      [self.x, self.x + width, this.x - width].forEach(function(x) {
        [self.y, self.y + height, this.y - height].forEach(function(y) {
          canvas_ctx.beginPath();
          canvas_ctx.arc(x, y, radius, -self.r, -self.r + deg2rad(angle), false);
          canvas_ctx.stroke();
        });
      });
    } else {
      canvas_ctx.beginPath();
      canvas_ctx.arc(this.x, this.y, radius, -this.r, -this.r + deg2rad(angle), false);
      canvas_ctx.stroke();
    }
  };

  this.begin = function() {
    // Erase turtle
    turtle_ctx.clearRect(0, 0, width, height);

    // Stub for old browsers w/ canvas but no text functions
    canvas_ctx.fillText = canvas_ctx.fillText || function fillText(string, x, y) { };
  };

  this.end = function() {
    if (this.visible) {
      var ctx = turtle_ctx;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(this.r) * 20, this.y - Math.sin(this.r) * 20);
      ctx.lineTo(this.x + Math.cos(this.r - Math.PI * 2 / 3) * 10, this.y - Math.sin(this.r - Math.PI * 2 / 3) * 10);
      ctx.lineTo(this.x + Math.cos(this.r + Math.PI * 2 / 3) * 10, this.y - Math.sin(this.r + Math.PI * 2 / 3) * 10);
      ctx.lineTo(this.x + Math.cos(this.r) * 20, this.y - Math.sin(this.r) * 20);
      ctx.stroke();
    }
  };


  canvas_ctx.lineCap = 'round';

  turtle_ctx.lineCap = 'round';
  turtle_ctx.strokeStyle = 'green';
  turtle_ctx.lineWidth = 2;

  this.setcolor('#000000');
  this.setwidth(1);
  this.setpenmode('paint');
  this.setfontsize(14);
  this.setturtlemode('wrap');
  this.showturtle(true);
  this.pendown(true);

  this.x = width / 2;
  this.y = height / 2;
  this.r = Math.PI / 2;

  this.begin();
  this.end();
}