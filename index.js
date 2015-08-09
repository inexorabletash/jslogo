//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011-2015 Joshua Bell
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

if (!('console' in window)) {
  window.console = { log: function(){}, error: function(){} };
}

var $ = document.querySelector.bind(document);

// Globals
var logo, turtle;
var examples = 'examples.txt';

//
// Storage hooks
//
// TODO: Replace these with events and/or data binding/observers

function hook(orig, func) {
  return function() {
    try {
      func.apply(this, arguments);
    } finally {
      if (orig)
        orig.apply(this, arguments);
    }
  };
}

var savehook;
var historyhook;
var clearhistoryhook;

function initStorage(loadhook) {
  if (!window.indexedDB)
    return;

  var req = indexedDB.open('logo', 3);
  req.onblocked = function() {
    alert("Please close other Logo pages to allow database upgrade to proceed.");
  };
  req.onerror = function(e) {
    console.error(e);
  };
  req.onupgradeneeded = function(e) {
    var db = req.result;
    if (e.oldVersion < 2) {
      db.createObjectStore('procedures');
    }
    if (e.oldVersion < 3) {
      db.createObjectStore('history', {autoIncrement: true});
    }
  };
  req.onsuccess = function() {
    var db = req.result;

    var tx = db.transaction('procedures');
    tx.objectStore('procedures').openCursor().onsuccess = function(e) {
      var cursor = e.target.result;
      if (cursor) {
        try {
          loadhook(cursor.value);
        } catch (ex) {
          console.error("Error loading procedure: " + ex);
        } finally {
          cursor.continue();
        }
      }
    };
    tx = db.transaction('history');
    tx.objectStore('history').openCursor().onsuccess = function(e) {
      var cursor = e.target.result;
      if (cursor) {
        try {
          historyhook(cursor.value);
        } catch (ex) {
          console.error("Error loading procedure: " + ex);
        } finally {
          cursor.continue();
        }
      }
    };

    tx.oncomplete = function() {
      savehook = hook(savehook, function(name, def) {
        var tx = db.transaction('procedures', 'readwrite');
        if (def)
          tx.objectStore('procedures').put(def, name);
        else
          tx.objectStore('procedures')['delete'](name);
      });

      historyhook = hook(historyhook, function(entry) {
        var tx = db.transaction('history', 'readwrite');
        tx.objectStore('history').put(entry);
      });

      clearhistoryhook = hook(clearhistoryhook, function() {
        var tx = db.transaction('history', 'readwrite');
        tx.objectStore('history').clear();
      });
    };
  };
}

//
// Command history
//
var commandHistory = (function() {
  var entries = [], pos = -1;
  return {
    push: function(entry) {
      if (entries.length > 0 && entries[entries.length - 1] === entry) {
        pos = -1;
        return;
      }
      entries.push(entry);
      pos = -1;
      if (historyhook) {
        historyhook(entry);
      }
    },
    next: function() {
      if (entries.length === 0) {
        return undefined;
      }
      if (pos === -1) {
        pos = 0;
      } else {
        pos = (pos === entries.length - 1) ? 0 : pos + 1;
      }
      return entries[pos];
    },
    prev: function() {
      if (entries.length === 0) {
        return undefined;
      }
      if (pos === -1) {
        pos = entries.length - 1;
      } else {
        pos = (pos === 0) ? entries.length - 1 : pos - 1;
      }
      return entries[pos];
    }
  };

  clearhistoryhook = hook(clearhistoryhook, function() {
    entries = [];
    pos = -1;
  });
}());


//
// Input UI
//
var input = {};

(function() {

  input.setMulti = function() {
    // TODO: Collapse these to a single class?
    document.body.classList.remove('single');
    document.body.classList.add('multi');
  };

  input.setSingle = function() {
    // TODO: Collapse these to a single class?
    document.body.classList.remove('multi');
    document.body.classList.add('single');
  };

  var isMulti = function() {
    return document.body.classList.contains('multi');
  };

  function run(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({type: "run"});
    }
    var error = $('#display #error');
    error.classList.remove('shown');

    var v = input.getValue();
    if (v === '') {
      return;
    }
    commandHistory.push(v);
    if (!isMulti()) {
      input.setValue('');
    }
    setTimeout(function() {
      try {
        logo.run(v);
      } catch (e) {
        error.innerHTML = '';
        error.appendChild(document.createTextNode(e.message));
        error.classList.add('shown');
      }
    }, 100);
  }

  input.run = run;

  function clear(remote) {
    if (remote !== true && window.TogetherJS && window.TogetherJS.running) {
      TogetherJS.send({type: "clear"});
    }
    input.setValue('');
  }
  input.clear = clear;

  if (typeof CodeMirror !== 'undefined') {
    var BRACKETS = '()[]{}';

    // Single Line
    CodeMirror.keyMap['single-line'] = {
      'Enter': function(cm) {
         run();
       },
      'Up': function(cm) {
        var v = commandHistory.prev();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({line: 0, ch: v.length});
        }
      },
      'Down': function(cm) {
        var v = commandHistory.next();
        if (v !== undefined) {
          cm.setValue(v);
          cm.setCursor({line: 0, ch: v.length});
        }
      },
      fallthrough: ['default']
    };
    var cm = CodeMirror.fromTextArea($('#logo-ta-single-line'), {
      autoCloseBrackets: { pairs: BRACKETS, explode: false },
      matchBrackets: true,
      lineComment: ';',
      keyMap: 'single-line'
    });
    $('#logo-ta-single-line + .CodeMirror').id = 'logo-cm-single-line';

    // http://stackoverflow.com/questions/13026285/codemirror-for-just-one-line-textfield
    cm.setSize('100%', cm.defaultTextHeight() + 4 + 4); // 4 = theme padding

    // Handle paste - switch to multi-line if input is multiple lines
    cm.on("change", function(cm, change) {
      if (change.text.length > 1) {
        var v = input.getValue();
        input.setMulti();
        input.setValue(v);
        input.setFocus();
      }
    });

    // Multi-Line
    var cm2 = CodeMirror.fromTextArea($('#logo-ta-multi-line'), {
      autoCloseBrackets: { pairs: BRACKETS, explode: BRACKETS },
      matchBrackets: true,
      lineComment: ';',
      lineNumbers: true
    });
    $('#logo-ta-multi-line + .CodeMirror').id = 'logo-cm-multi-line';
    cm2.setSize('100%', '100%');

    input.getValue = function() {
      return (isMulti() ? cm2 : cm).getValue();
    };
    input.setValue = function(v) {
      (isMulti() ? cm2 : cm).setValue(v);
    };
    input.setFocus = function() {
      (isMulti() ? cm2 : cm).focus();
    };

  } else {
    // Fallback in case of no CodeMirror

    $('#logo-ta-single-line').addEventListener('keydown', function(e) {

      var keyNames = { 3: 'Enter', 10: 'Enter', 13: 'Enter',
                       38: 'Up', 40: 'Down', 63232: 'Up', 63233: 'Down' };

      var elem = $('#logo-ta-single-line');

      var keyMap = {
        'Enter': function(elem) {
          run();
        },
        'Up': function(elem) {
          var v = commandHistory.prev();
          if (v !== undefined) {
            elem.value = v;
          }
        },
        'Down': function(elem) {
          var v = commandHistory.next();
          if (v !== undefined) {
            elem.value = v;
          }
        }
      };

      var keyName = keyNames[e.keyCode];
      if (keyName in keyMap && typeof keyMap[keyName] === 'function') {
        keyMap[keyName](elem);
        e.stopPropagation();
        e.preventDefault();
      }
    });

    input.getValue = function() {
      return $(isMulti() ? '#logo-ta-multi-line' : '#logo-ta-single-line').value;
    };
    input.setValue = function(v) {
      $(isMulti() ? '#logo-ta-multi-line' : '#logo-ta-single-line').value = v;
    };
    input.setFocus = function() {
      $(isMulti() ? '#logo-ta-multi-line' : '#logo-ta-single-line').focus();
    };
  }

  input.setFocus();
  $('#input').addEventListener('click', function() {
    input.setFocus();
  });

  $('#toggle').addEventListener('click', function() {
    var v = input.getValue();
    document.body.classList.toggle('single');
    document.body.classList.toggle('multi');
    if (!isMulti()) {
      v = v.replace(/\n/g, '  ');
    } else {
      v = v.replace(/\s\s(\s*)/g, '\n$1');
    }
    input.setValue(v);
    input.setFocus();
  });

  $('#run').addEventListener('click', run);
  $('#clear').addEventListener('click', clear);


  window.addEventListener('message', function(e) {
    if ('example' in e.data) {
      var text = e.data.example;
      input.setSingle();
      input.setValue(text);
      input.setFocus();
    }
  });
}());


//
// Canvas resizing
//
(function() {
  window.addEventListener('resize', resize);
  window.addEventListener('load', resize);
  function resize() {
    var box = $('#display-panel .inner'), rect = box.getBoundingClientRect(),
        w = rect.width, h = rect.height;
    $('#sandbox').width = w; $('#sandbox').height = h;
    $('#turtle').width = w; $('#turtle').height = h;
    $('#overlay').width = w; $('#overlay').height = h;

    if (logo && turtle) {
      turtle.resize(w, h);
      logo.run('cs');
    }
  }
}());


//
// Populate "Examples" sidebar via XHR
//
window.addEventListener('load', function() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', examples, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200 || xhr.status === 0) {
         var parent = $('#examples');
         xhr.responseText.split(/\n\n/g).forEach(function(line) {
           insertSnippet(line, parent);
         });
        }
      }
    };
  xhr.send();
});


//
// Hook up sidebar links
//
(function() {
  var sidebars = [].slice.call(document.querySelectorAll('#sidebar .choice')).map(
    function(elem) { return elem.id; });
  sidebars.forEach(function(k) {
    $('#sb-link-' + k).addEventListener('click', function() {
      var cl = $('#sidebar').classList;
      sidebars.forEach(function(sb) { cl.remove(sb); });
      cl.add(k);
    });
  });
}());


//
// Hooks for Library and History sidebars
//
(function() {
  savehook = hook(savehook, function(name, def) {
    var parent = $('#library');
    if (def)
      insertSnippet(def, parent, name);
    else
      removeSnippet(parent, name);
  });

  historyhook = hook(historyhook, function(entry) {
    var parent = $('#history');
    insertSnippet(entry, parent);
  });

  clearhistoryhook = hook(clearhistoryhook, function() {
    var parent = $('#history');
    while (parent.firstChild)
      parent.removeChild(parent.firstChild);
  });
}());


//
// Code snippets
//
var snippets = {};
function insertSnippet(text, parent, key) {
  var snippet;
  if (key && snippets.hasOwnProperty(key)) {
    snippet = snippets[key];
    snippet.innerHTML = '';
  } else {
    snippet = document.createElement('div');
    snippet.className = 'snippet';
    snippet.title = "Click to edit";
    snippet.addEventListener('click', function() {
      input.setMulti();
      input.setValue(text);
    });
    if (key) {
      snippets[key] = snippet;
    }
  }

  var container = document.createElement('pre');
  snippet.appendChild(container);
  if (typeof CodeMirror !== 'undefined') {
    CodeMirror.runMode(text, 'logo', container);
  } else {
    container.appendChild(document.createTextNode(text));
  }

  if (parent.scrollTimeoutId) {
    clearTimeout(parent.scrollTimeoutId);
  }
  parent.scrollTimeoutId = setTimeout(function() {
    parent.scrollTimeoutId = null;
    parent.scrollTop = snippet.offsetTop;
  }, 100);
  if (snippet.parentElement !== parent) {
    parent.appendChild(snippet);
  }
}
function removeSnippet(parent, key) {
  var snippet;
  if (!key || !snippets.hasOwnProperty(key))
    return;
  snippet = snippets[key];
  parent.removeChild(snippet);
  delete snippets[key];
}


//
// Main page logic
//
window.addEventListener('load', function() {

  var stream = {
    read: function(s) {
      return window.prompt(s ? s : "");
    },
    write: function() {
      var div = $('#overlay');
      for (var i = 0; i < arguments.length; i += 1) {
        div.innerHTML += arguments[i];
      }
      div.scrollTop = div.scrollHeight;
    },
    clear: function() {
      var div = $('#overlay');
      div.innerHTML = "";
    },
    readback: function() {
      var div = $('#overlay');
      return div.innerHTML;
    }
  };

  var canvas_element = $("#sandbox"), canvas_ctx = canvas_element.getContext('2d'),
      turtle_element = $("#turtle"), turtle_ctx = turtle_element.getContext('2d');
  turtle = new CanvasTurtle(
    canvas_ctx,
    turtle_ctx,
    canvas_element.width, canvas_element.height);

  logo = new LogoInterpreter(
    turtle, stream,
    function (name, def) {
      if (savehook) {
        savehook(name, def);
      }
    });
  logo.run('cs');
  initStorage(function (def) {
    logo.run(def);
  });

  function saveDataAs(dataURL, filename) {
    if (!('download' in document.createElement('a')))
      return false;
    var anchor = document.createElement('a');
    anchor.href = dataURL;
    anchor.download = filename;
    var event = document.createEvent('MouseEvents');
    event.initMouseEvent('click', true, true, window, null,
                         0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(event);
    return true;
  }

  $('#savelibrary').addEventListener('click', function() {
    var library = logo.procdefs().replace('\n', '\r\n');
    var url = 'data:text/plain,' + encodeURIComponent(library);
    if (!saveDataAs(url, 'logo_library.txt'))
      alert("Sorry, not supported by your browser");
  });
  $('#screenshot').addEventListener('click', function() {
    var canvas = document.querySelector('#sandbox');
    var url = canvas.toDataURL('image/png');
    if (!saveDataAs(url, 'logo_drawing.png'))
      alert("Sorry, not supported by your browser");
  });
  $('#clearhistory').addEventListener('click', function() {
    if (!confirm('Clear history: Are you sure?')) return;
    clearhistoryhook();
  });
  $('#clearlibrary').addEventListener('click', function() {
    if (!confirm('Clear library: Are you sure?')) return;
    logo.run('erall');
  });

  function demo(param) {
    param = String(param);
    if (param.length > 0) {
      param = decodeURIComponent(param.substring(1).replace(/\_/g, ' '));
      input.setValue(param);
      try {
        logo.run(param);
      } catch (e) {
        window.alert("Error: " + e.message);
      }
    }
  }

  // Look for a program to run in the query string / hash
  var param = document.location.search || document.location.hash;
  demo(param);
  window.addEventListener('hashchange', function() { demo(document.location.hash); } );
});

window.TogetherJSConfig ={

  hub_on: {
    "togetherjs.hello": function () {
      var visible = turtle.isturtlevisible();
      TogetherJS.send({
        type: "init",
        image: $("#sandbox").toDataURL("image/png"),
        turtle: turtle.getstate()
      });
    },

    // FIXME: we don't align the height/width of the canvases
    "init": function (msg) {
      var context = $("#sandbox").getContext("2d");
      var image = new Image();
      image.src = msg.image;
      context.drawImage(image, 0, 0);
      turtle.begin();
      turtle.setstate(msg.turtle);
      turtle.end();
    },

    run: function (msg) {
      input.run(true);
    },

    clear: function (msg) {
      input.clear(true);
    }
  }

};
