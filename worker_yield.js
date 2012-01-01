importScripts('../polyfill/polyfill.js?2011-12-24', 'logo.js?2011-12-31', 'turtle.js?2010-08-07');

// Sleazy yield - make an HTTP request that will fail. This causes the JavaScript
// thread to yield for a few milliseconds.
var xhr = new XMLHttpRequest()
function yield() {
  try {
    xhr.open("GET", "does_not_exist/" + Math.random(), false); // synchronous
    xhr.send();
  }
  catch (e) {
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
function make_yield(obj, funcname) {
  var func = obj[funcname];
  obj[funcname] = function() { yield(); func.apply(this, arguments); };
}


// Define CanvasProxy class
var CanvasProxy = makeProxyClass(
  ['beginPath', 'moveTo', 'lineTo', 'clearRect', 'fillText', 'stroke', 'fill',
   'save', 'translate', 'rotate', 'restore', 'arc'],
  ['lineCap', 'lineWidth', 'strokeStyle', 'fillStyle', 'globalCompositeOperation', 'font'],
  function(proto) {
    // Tweak the prototype to make drawing operations yield
    make_yield(proto, 'stroke');
  }
);


// Define StreamProxy class
var StreamProxy = makeProxyClass(['read', 'write', 'clear']);
// TODO: "read" will need to poll for a response message


var g_logo;

onmessage = function(event) {

  switch (event.data.command) {

  case 'init':
    g_logo = new LogoInterpreter(
      new CanvasTurtle(new CanvasProxy('sandbox'),
                       new CanvasProxy('turtle'),
                       event.data.width, event.data.height),
      new StreamProxy('stream'));
    break;

  case 'run':
    try {
      g_logo.run(event.data.text);
    }
    catch (e) {
      remote_call('window', 'alert', ['Error: ' + e]);
    }
    break;

    // TODO: Responses to READ, etc.
  }
};
