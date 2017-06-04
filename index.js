/*global CodeMirror,TogetherJS,LogoInterpreter,CanvasTurtle,Dialog*/
//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011-2015 Joshua Bell
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

if (!('console' in window)) {
  window.console = { log: function(){}, error: function(){} };
}

function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }

// Globals
var logo, turtle;

// Later scripts may override this to customize the examples.
// Leave it exposed as a global.
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
    Dialog.alert("Please close other Logo pages to allow database upgrade to proceed.");
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

  clearhistoryhook = hook(clearhistoryhook, function() {
    entries = [];
    pos = -1;
  });

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
}());


//
// Input UI
//
var input = {};
function initInput() {

  function keyNameForEvent(e) {
    window.ke = e;
    return e.key ||
      ({ 3: 'Enter', 10: 'Enter', 13: 'Enter',
         38: 'ArrowUp', 40: 'ArrowDown', 63232: 'ArrowUp', 63233: 'ArrowDown' })[e.keyCode];
  }

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
      document.body.classList.add('running');
      logo.run(v).catch(function (e) {
        error.innerHTML = '';
        error.appendChild(document.createTextNode(e.message));
        error.classList.add('shown');
      }).then(function() {
        document.body.classList.remove('running');
      });
    }, 100);
  }

  function stop() {
    logo.bye();
    document.body.classList.remove('running');
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

    // https://stackoverflow.com/questions/13026285/codemirror-for-just-one-line-textfield
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

    // Handle ctrl+enter in Multi-Line
    cm2.on('keydown', function(instance, event) {
      if (keyNameForEvent(event) === 'Enter' && event.ctrlKey) {
        event.preventDefault();
        run();
      }
    });

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

     var elem = $('#logo-ta-single-line');

      var keyMap = {
        'Enter': function(elem) {
          run();
        },
        'ArrowUp': function(elem) {
          var v = commandHistory.prev();
          if (v !== undefined) {
            elem.value = v;
          }
        },
        'ArrowDown': function(elem) {
          var v = commandHistory.next();
          if (v !== undefined) {
            elem.value = v;
          }
        }
      };

      var keyName = keyNameForEvent(e);
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
  $('#stop').addEventListener('click', stop);
  $('#clear').addEventListener('click', clear);

  window.addEventListener('message', function(e) {
    if ('example' in e.data) {
      var text = e.data.example;
      input.setSingle();
      input.setValue(text);
      input.setFocus();
    }
  });
}


//
// Canvas resizing
//
(function() {
  window.addEventListener('resize', resize);
  window.addEventListener('DOMContentLoaded', resize);
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
// Hook up sidebar links
//
(function() {
  var sidebars = Array.from($$('#sidebar .choice')).map(
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
    var parent = $('#library .snippets');
    if (def)
      insertSnippet(def, parent, name);
    else
      removeSnippet(parent, name);
  });

  historyhook = hook(historyhook, function(entry) {
    var parent = $('#history .snippets');
    insertSnippet(entry, parent);
  });

  clearhistoryhook = hook(clearhistoryhook, function() {
    var parent = $('#history .snippets');
    while (parent.firstChild)
      parent.removeChild(parent.firstChild);
  });
}());


//
// Code snippets
//
var snippets = new Map();
function insertSnippet(text, parent, key, options) {
  options = options || {};

  var snippet;
  if (key && snippets.has(key)) {
    snippet = snippets.get(key);
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
      snippets.set(key, snippet);
    }
  }

  var container = document.createElement('pre');
  snippet.appendChild(container);
  if (typeof CodeMirror !== 'undefined') {
    CodeMirror.runMode(text, 'logo', container);
  } else {
    container.appendChild(document.createTextNode(text));
  }

  if (!options.noScroll) {
    if (parent.scrollTimeoutId)
      clearTimeout(parent.scrollTimeoutId);
    parent.scrollTimeoutId = setTimeout(function() {
      parent.scrollTimeoutId = null;
      parent.scrollTop = snippet.offsetTop;
    }, 100);
  }

  if (snippet.parentElement !== parent)
    parent.appendChild(snippet);
}
function removeSnippet(parent, key) {
  var snippet;
  if (!key || !snippets.has(key))
    return;
  snippet = snippets.get(key);
  parent.removeChild(snippet);
  snippets.delete(key);
}


//
// Main page logic
//
window.addEventListener('DOMContentLoaded', function() {

  // Parse query string
  var queryParams = {}, queryRest;
  (function() {
    if (document.location.search) {
      document.location.search.substring(1).split('&').forEach(function(entry) {
        var match = /^(\w+)=(.*)$/.exec(entry);
        if (match)
          queryParams[decodeURIComponent(match[1])] = decodeURIComponent(match[2]);
        else
          queryRest = '?' + entry;
      });
    }
  }());


  $('#overlay').style.fontSize = '13px';
  $('#overlay').style.fontFamily = 'monospace';
  $('#overlay').style.color = 'black';

  var stream = {
    read: function(s) {
      return Dialog.prompt(s ? s : "");
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
    },
    get textsize() {
      return parseFloat($('#overlay').style.fontSize.replace('px', ''));
    },
    set textsize(height) {
      $('#overlay').style.fontSize = Math.max(height, 1) + 'px';
    },
    get font() {
      return $('#overlay').style.fontFamily;
    },
    set font(name) {
      if (['serif', 'sans-serif', 'cursive', 'fantasy', 'monospace'].indexOf(name) === -1)
        name = JSON.stringify(name);
      $('#overlay').style.fontFamily = name;
    },
    get color() {
      return $('#overlay').style.color;
    },
    set color(color) {
      $('#overlay').style.color = color;
    }
  };

  var canvas_element = $("#sandbox"), canvas_ctx = canvas_element.getContext('2d'),
      turtle_element = $("#turtle"), turtle_ctx = turtle_element.getContext('2d');
  turtle = new CanvasTurtle(
    canvas_ctx,
    turtle_ctx,
    canvas_element.width, canvas_element.height, $('#overlay'));

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
      Dialog.alert("Sorry, not supported by your browser");
  });
  $('#screenshot').addEventListener('click', function() {
    var canvas = document.querySelector('#sandbox');
    var url = canvas.toDataURL('image/png');
    if (!saveDataAs(url, 'logo_drawing.png'))
      Dialog.alert("Sorry, not supported by your browser");
  });
  $('#clearhistory').addEventListener('click', function() {
    if (!confirm('Clear history: Are you sure?')) return;
    clearhistoryhook();
  });
  $('#clearlibrary').addEventListener('click', function() {
    if (!confirm('Clear library: Are you sure?')) return;
    logo.run('erall');
  });


  //
  // Localization
  //
  var localizationComplete = (function() {
    function localize(data) {
      if ('page' in data) {
        if ('dir' in data.page)
          document.body.dir = data.page.dir;
        if ('examples' in data.page)
          examples = data.page.examples;

        if ('translations' in data.page) {
          (function(translation) {
            var ids = new Set();
            Object.keys(translation).forEach(function(key) {
              var parts = key.split('.'), id = parts[0], attr = parts[1], s = translation[key];
              ids.add(id);
              var elem = document.querySelector('[data-l10n-id="'+id+'"]');
              if (!elem)
                console.warn('Unused translation: ' + id);
              else if (attr)
                elem.setAttribute(attr, s);
              else
                elem.textContent = s;
            });
            Array.from(document.querySelectorAll('[data-l10n-id]'))
              .map(function(element) { return element.getAttribute('data-l10n-id'); })
              .filter(function(id) { return !ids.has(id); })
              .forEach(function(id) { console.warn('Missing translation: ' + id); });
          }(data.page.translations));
        }
      }

      if ('interpreter' in data) {
        if ('messages' in data.interpreter) {
          logo.localize = function(s) {
            return data.interpreter.messages[s];
          };
        }

        if ('keywords' in data.interpreter) {
          logo.keywordAlias = function(s) {
            return data.interpreter.keywords[s];
          };
        }

        if ('procedures' in data.interpreter) {
          (function(aliases) {
            Object.keys(aliases).forEach(function(alias) {
              logo.copydef(alias, aliases[alias]);
            });
          }(data.interpreter.procedures));
        }
      }

      if ('graphics' in data) {
        if ('colors' in data.graphics) {
          turtle.colorAlias = function(s) {
            return data.graphics.colors[s];
          };
        }
      }
    }

    var lang = queryParams.lang || navigator.language || navigator.userLanguage;
    if (!lang) return Promise.resolve();

    // TODO: Support locale/fallback
    lang = lang.split('-')[0];
    document.body.lang = lang;

    if (lang === 'en') return Promise.resolve();
    return fetch('l10n/lang-' + lang + '.json')
      .then(function(response) {
        if (!response.ok) throw Error(response.statusText);
        return response.text();
      })
      .then(function(text) {
        window.json = text;
        localize(JSON.parse(text));
      })
      .catch(function(reason) {
        console.warn('Error loading localization file for "' +
                     lang + '": ' + reason.message);
      });
  }());

  // Populate languages selection list
  fetch('l10n/languages.txt')
    .then(function(response) {
      if (!response.ok) throw Error(response.statusText);
      return response.text();
    })
    .then(function(text) {
      var select = $('#select-lang');
      text.split(/\r?\n/g).forEach(function(entry) {
        var match = /^(\w+)\s+(.*)$/.exec(entry);
        if (!match) return;
        var opt = document.createElement('option');
        opt.value = match[1];
        opt.textContent = match[2];
        select.appendChild(opt);
      });
      select.value = document.body.lang;
      select.addEventListener('change', function() {
        var url = String(document.location);
        url = url.replace(/[\?#].*/, '');
        document.location = url + '?lang=' + select.value;
      });
    });

  localizationComplete.then(initInput);

  //
  // Populate "Examples" sidebar
  // (URL may be overwritten by localization file)
  //
  localizationComplete.then(function() {
    fetch(examples)
      .then(function(response) {
        if (!response.ok) throw Error(response.statusText);
        return response.text();
      })
      .then(function(text) {
        var parent = $('#examples');
        text.split(/\n\n/g).forEach(function(line) {
          insertSnippet(line, parent, undefined, {
            noScroll: true
          });
        });
      });
  });

  //
  // Demo
  //

  function demo(param) {
    param = String(param);
    if (param.length > 0) {
      param = decodeURIComponent(param.substring(1).replace(/\_/g, ' '));
      input.setValue(param);
      logo.run(param).catch(function (e) {
        Dialog.alert("Error: " + e.message);
      });
    }
  }

  // Look for a program to run in the query string / hash
  var param = queryRest || document.location.hash;
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
      var image = document.createElement('image');
      image.src = msg.image;
      context.drawImage(image, 0, 0);
      turtle.setstate(msg.turtle);
    },

    run: function (msg) {
      input.run(true);
    },

    clear: function (msg) {
      input.clear(true);
    }
  }

};
