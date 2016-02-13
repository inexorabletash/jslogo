// Esperanto Localization (Sample)
(function() {

  //////////////////////////////////////////////////
  // Page

  // For RTL languages:
  // document.body.dir = 'rtl';

  // Override examples link e.g.:
  // examples = "l10n/examples.txt"

  // UI Text
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
  }({
    // data-l10n-id: replacement-text
    // data-l10n-id.attribute: replacement-text
    "title": "Logo Interpretisto",
    "tl-title": "Logo Interpretisto",
    "tl-contact": "Kontakton",
    "tl-tests": "Testoj",
    "tl-source": "Fonto",
    "tl-reference": "Referenco",
    "start-togetherjs": "Kunlabori",
    "no-canvas": "Via retumilo ne subtenas la kanvaso elemento - Mizera !",
    "ip-button-run": "Run",
    "ip-button-clear": "Klara",
    "logo-ta-single-line.placeholder": "Tajpu vian kodon ĉi tie...",
    "logo-ta-multi-line.placeholder": "Tajpu vian kodon ĉi tie...",
    "sb-link-reference": "Referenco",
    "sb-link-text-reference": "la Logo lingvo",
    "sb-link-library": "Biblioteko",
    "sb-link-text-library": "via proceduroj",
    "sb-link-history": "Historio",
    "sb-link-text-history": "ĉio vi faris tie",
    "sb-link-examples": "Ekzemploj",
    "sb-link-text-examples": "amuzaj aferoj provi ekstere",
    "sb-link-extras": "Ekstraj",
    "sb-link-text-extras": "helpema utilecoj",
    "sb-link-links": "Ligoj",
    "sb-link-text-links": "aliaj Logo rimedoj",
    "extras-download-library": "Download Biblioteko",
    "extras-download-drawing": "Download Desegnaĵo",
    "extras-clear-history": "Klara Historio",
    "extras-clear-library": "Klara Biblioteko",
    "github-forkme": "Forko min sur GitHub"
  }));

  //////////////////////////////////////////////////
  // Interpreter

  // Messages
  logo.localize = function(s) {
    return {
      // default-text: replacement-text
      'Division by zero': 'Divido per nulo',
      'Index out of bounds': 'Indekso ekster limojn'
      // ...
    }[s];
  };

  // Keywords
  logo.keywordAlias = function(name) {
    return {
      // alias: keyword
      'ALIE': 'ELSE',
      'FINO': 'END'
      // ...
    }[name];
  };

  // Procedures
  (function(defs) {
    Object.keys(defs).forEach(function(def) {
      defs[def].forEach(function(alias) {
        logo.copydef(alias, def);
      });
    });
  }({
    // procname: [alias, ...]
    'true': ['vera'],
    'false': ['falsa']
  }));

  //////////////////////////////////////////////////
  // Turtle Graphics

  // Additional color names
  // Colors are specified per https://drafts.csswg.org/css-color-3
  turtle.colorAlias = function(name) {
    return {
      // alias: css-color
      'ruĝa': 'red',
      'oranĝo': 'orange',
      'flava': 'yellow',
      'verda': 'green',
      'bluaj': 'blue',
      'viola': 'violet',
      'blanka': 'white',
      'grizaj': 'gray',
      'nigra': 'black'
    }[name];
  };

}());
