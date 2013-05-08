// Adapted from
// http://www.williammalone.com/articles/html5-canvas-javascript-paint-bucket-tool/#subTitle4

function augmentCanvas(canvas, context) {

  context.floodFill = function floodFill(startX, startY, fillColorR, fillColorG, fillColorB) {

    var canvasWidth = Number(canvas.width),
        canvasHeight = Number(canvas.height);

    var colorLayer = context.getImageData(0, 0, canvasWidth, canvasHeight);

    var startPos = (startY * canvasWidth + x) * 4,
        startR = colorLayer.data[startPos],
        startG = colorLayer.data[startPos + 1],
        startB = colorLayer.data[startPos + 2];

    var pixelStack = [[startX, startY]];

    var newPos, x, y, pixelPos, reachLeft, reachRight;

    while(pixelStack.length) {

      newPos = pixelStack.pop();
      x = newPos[0];
      y = newPos[1];

      pixelPos = (y * canvasWidth + x) * 4;
      while (y-- >= 0 && matchStartColor(pixelPos)) {
        pixelPos -= canvasWidth * 4;
      }
      pixelPos += canvasWidth * 4;
      ++y;
      reachLeft = false;
      reachRight = false;

      while (y++ < canvasHeight - 1 && matchStartColor(pixelPos)) {
        colorPixel(pixelPos);

        if (x > 0) {
          if (matchStartColor(pixelPos - 4)) {
            if (!reachLeft) {
              pixelStack.push([x - 1, y]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }

        if (x < canvasWidth - 1) {
          if (matchStartColor(pixelPos + 4)) {
            if (!reachRight) {
              pixelStack.push([x + 1, y]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }

        pixelPos += canvasWidth * 4;
      }
    }
    context.putImageData(colorLayer, 0, 0);

    function matchStartColor(pixelPos) {
      return startR === colorLayer.data[pixelPos] &&
        startG === colorLayer.data[pixelPos + 1] &&
        startB === colorLayer.data[pixelPos + 2];
    }

    function colorPixel(pixelPos) {
      colorLayer.data[pixelPos] = fillColorR;
      colorLayer.data[pixelPos + 1] = fillColorG;
      colorLayer.data[pixelPos + 2] = fillColorB;
      colorLayer.data[pixelPos + 3] = 0xff;
    }
  };
}
