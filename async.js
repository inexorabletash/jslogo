//
// Logo Interpreter in Javascript
//

// Copyright 2009 Joshua Bell
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

var g_logo;

var g_history = [];
var g_historypos = -1;

var g_entry;

function ontoggle() {
  var single = document.getElementById('entry_single');
  var multi  = document.getElementById('entry_multi');
  var toggle = document.getElementById('toggle');

  if( g_entry === multi ) {
    g_entry = single;

    single.style.display = '';
    multi .style.display = 'none';

    single.value = multi.value;
    toggle.value = "+";
  } else {
    g_entry = multi;

    single.style.display = 'none';
    multi .style.display = '';

    multi.value = single.value;
    toggle.value = "-";
  }
}


function onenter() {
  var e = g_entry;
  var v = g_entry.value;
  if( v !== "" ) {
    e.value = '';
    g_history.push( v );
    g_historypos = -1;

    try {
      g_logo.run(v);
    } catch (e) {
      window.alert("Error: " + e.message);
    }
  }
}

var KEY = {
  RETURN: 10,
  ENTER: 13,
  END: 35,
  HOME: 36,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40
};

function onkey(e) {
  e = e ? e : window.event;
  var key = e.keyCode  ? e.keyCode :
        e.charCode ? e.charCode :
        e.which ? e.which : 0;

  var consume = false;

  switch( key ) {
    case KEY.RETURN:
    case KEY.ENTER:
      onenter();
      consume = true;
      break;

    case KEY.UP:
      if( g_history.length > 0 ) {
        if( g_historypos === -1 ) {
          g_historypos = g_history.length - 1;
        } else {
          g_historypos = ( g_historypos === 0 ) ? g_history.length - 1 : g_historypos - 1;
        }
        document.getElementById('entry_single').value = g_history[ g_historypos ];
      }
      consume = true;
      break;

    case KEY.DOWN:
      if( g_history.length > 0 ) {
        if( g_historypos === -1 ) {
          g_historypos = 0;
        } else {
          g_historypos = ( g_historypos === g_history.length - 1 ) ? 0 : g_historypos + 1;
        }
        document.getElementById('entry_single').value = g_history[ g_historypos ];
      }
      consume = true;
      break;
  }

  if( consume ) {
    e.cancelBubble = true; // IE
    e.returnValue = false;
    if( e.stopPropagation ) { e.stopPropagation(); } // W3C
    if( e.preventDefault  ) { e.preventDefault();  } // e.g. to block arrows from scrolling the page
    return false;
  } else {
    return true;
  }
}



window.onload = function() {

  var stream = {
    read: function(s) {
      return window.prompt(s ? s : "");
    },
    write: function() {
      var div = document.getElementById('overlay');
      for (var i = 0; i < arguments.length; i += 1) {
        div.innerHTML += arguments[i];
      }
      div.scrollTop = div.scrollHeight;
    },
    clear: function() {
      var div = document.getElementById('overlay');
      div.innerHTML = "";
    },
    readback: function() {
      var div = document.getElementById('overlay');
      return div.innerHTML;
    }
  };

  var sandbox = document.getElementById("sandbox");

  var proxies = {
    'stream': stream,
    'sandbox': sandbox.getContext('2d'),
    'turtle': document.getElementById("turtle").getContext('2d'),
    'window': window
  };

  var worker = new Worker('worker.js');
  worker.onmessage = function(event) {
    var obj;
    if (event.data.call) {
      obj = proxies[event.data.obj];
      obj[event.data.call].apply(obj, event.data.args);
    } else if (event.data.set) {
      obj = proxies[event.data.obj];
      obj[event.data.set] = event.data.value;
    } else {
      console.log("got this message, dunno what to do:", event.data);
    }
  };

  g_logo = {
    run: function(text) {
      worker.postMessage({
        command: 'run',
        text: text
      });
    }
  };

  worker.postMessage({
    command: 'init',
    width: sandbox.width,
    height: sandbox.height,
    sleep: LOGO_SLEEP
  });


  document.getElementById('toggle').onclick = ontoggle;
  document.getElementById('run').onclick = onenter;

  g_entry = document.getElementById('entry_single');
  g_entry.onkeydown = onkey;
  g_entry.focus();

  // Look for a program to run in the query string
  var param = document.location.search;
  if (typeof param === 'string' && param.length > 0) {
    param = param.replace(/\_/g, ' ');
    param = decodeURIComponent(param.substring(1));
    g_entry.value = param;
    try {
      g_logo.run(param);
    } catch (e) {
      window.alert("Error: " + e.message);
    }
  }
};
