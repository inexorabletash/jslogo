importScripts('logo.js?update=2013-02-04', 'turtle.js?update=2013-02-04');

// Sleazy sleep - make an HTTP request that will fail. This causes the JavaScript
// thread to sleep for a few milliseconds.
var xhr = new XMLHttpRequest();
function sleep() {
  try {
    xhr.open("GET", "does_not_exist/" + Math.random(), false); // synchronous
    xhr.send();
  } catch (e) {
    // ignore
  }
}

// For converting arguments into something that can posted
function toArray(o) {
  var a = [], i, len = o.length;
  for (i = 0; i < len; i += 1) {
    a[i] = o[i];
  }
  return a;
}

// Make a remote method call
function remote_call(obj, method, args) {
  postMessage({ 'obj': obj, 'call': method, 'args': args });
}

// Make a remote property set
function remote_set(obj, prop, value) {
  postMessage({ 'obj': obj, 'set': prop, 'value': value });
}


// Create a new proxy class for the given methods and properties (lists of names)
function makeProxyClass(methods, properties, protofunc) {

  var ctor = function(name) {
    this.name = name;
  };

  ctor.prototype = {};


  function proxy_method(obj, name) {
    obj[name] = function() {
      remote_call(this.name, name, toArray(arguments));
    };
  }

  function proxy_property(obj, name) {

    var getter = function() { return this['$' + name]; };
    var setter = function(s) { this['$' + name] = s; remote_set(this.name, name, s); };

    Object.defineProperty(obj, name, { 'get': getter, 'set': setter });
  }


  if (methods && methods.length) {
    methods.forEach(function(x) {
      proxy_method(ctor.prototype, x);
    });
  }

  if (properties && properties.length) {
    properties.forEach(function(x) {
      proxy_property(ctor.prototype, x);
    });
  }

  if (protofunc && typeof protofunc === 'function') {
    protofunc(ctor.prototype);
  }

  return ctor;
}



// Inject delay to let graphics operations be asynchronous
function make_sleep(obj, funcname) {
  var func = obj[funcname];
  obj[funcname] = function() { sleep(); func.apply(this, arguments); };
}


var g_logo;

var CANVAS_METHODS = ['beginPath', 'moveTo', 'lineTo', 'clearRect', 'fillText',
                      'stroke', 'fill', 'save', 'translate', 'rotate', 'restore',
                      'arc'];
var CANVAS_PROPERTIES = ['lineCap', 'lineWidth', 'strokeStyle', 'fillStyle',
                         'globalCompositeOperation', 'font'];

onmessage = function(event) {

  var CanvasProxy, StreamProxy;

  switch (event.data.command) {

  case 'init':

    // Define CanvasProxy class
    if (event.data.sleep) {
      CanvasProxy = makeProxyClass(
        CANVAS_METHODS, CANVAS_PROPERTIES,
        function(proto) {
          make_sleep(proto, 'stroke');
        }
      );
    } else {
      CanvasProxy = makeProxyClass(CANVAS_METHODS, CANVAS_PROPERTIES);
    }

    // Define StreamProxy class
    StreamProxy = makeProxyClass(['read', 'write', 'clear']);
    // TODO: "read" will need to poll for a response message

    g_logo = new LogoInterpreter(
      new CanvasTurtle(new CanvasProxy('sandbox'),
                       new CanvasProxy('turtle'),
                       event.data.width, event.data.height),
      new StreamProxy('stream'));
    break;

  case 'run':
    try {
      g_logo.run(event.data.text);
    } catch (e) {
      remote_call('window', 'alert', ['Error: ' + e]);
    }
    break;

    // TODO: Responses to READ, etc.
  }
};
