
// Flood Fill
// https://github.com/eleks/canvasPaint/blob/master/js/index.js

CanvasRenderingContext2D.prototype.floodFill = function(x, y) {
  var context = this,
      canvas = context.canvas,
      w = canvas.width,
      h = canvas.height;

  x = x|0;
  y = y|0;

  // Putting the offsets in such an order as to minimize the
  // possibility of cache miss during array access.
  var dx = [ 0, -1, +1,  0];
  var dy = [-1,  0,  0, +1];

  // returns ARGB
  function getColorAt(x, y) {
    var img = context.getImageData(x, y, w, h);
    var data = img.data;
    return (data[3]<<24) | (data[0]<<16) | (data[1]<<8) | (data[2]);
  }
  var seedARGB = getColorAt(x, y);
  context.fillRect(x, y, 1, 1);
  var fillARGB = getColorAt(x, y);
  if (seedARGB === fillARGB)
    return;

  var sa = (seedARGB >> 24) & 0xff,
      sr = (seedARGB >> 16) & 0xff,
      sg = (seedARGB >> 8) & 0xff,
      sb = (seedARGB) & 0xff;

  var fa = (fillARGB >> 24) & 0xff,
      fr = (fillARGB >> 16) & 0xff,
      fg = (fillARGB >> 8) & 0xff,
      fb = (fillARGB) & 0xff;

  var img = context.getImageData(0, 0, w, h);
  var imgData = img.data;

  var stack = [];
  stack.push(x);
  stack.push(y);

  while (stack.length > 0) {
    var curPointY = stack.pop();
    var curPointX = stack.pop();

    for (var i = 0; i < 4; i++) {
      var nextPointX = curPointX + dx[i];
      var nextPointY = curPointY + dy[i];

      if (nextPointX < 0 || nextPointY < 0 || nextPointX >= w || nextPointY >= h) {
        continue;
      }

      var nextPointOffset = (nextPointY * w + nextPointX) * 4;
      if (imgData[nextPointOffset + 0] == sr &&
          imgData[nextPointOffset + 1] == sg &&
          imgData[nextPointOffset + 2] == sb &&
          imgData[nextPointOffset + 3] == sa) {

        imgData[nextPointOffset++] = fr;
        imgData[nextPointOffset++] = fg;
        imgData[nextPointOffset++] = fb;
        imgData[nextPointOffset]   = fa;

        stack.push(nextPointX);
        stack.push(nextPointY);
      }
    }
  }

  context.putImageData(img, 0, 0);
};
