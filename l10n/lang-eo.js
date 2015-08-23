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
    Array.from(document.querySelectorAll('[data-l10n-id]')).forEach(function(element) {
      var id = element.getAttribute('data-l10n-id');
      if (!translation.hasOwnProperty(id)) {
        console.warn('Missing translation: ' + id);
        return;
      }
      // TODO: Generalize this somehow
      if (element.placeholder)
        element.placeholder = translation[id];
      else
        element.textContent = translation[id];
    });
    // TODO: Support localizing attributes (e.g. placeholder, title)
  }({
    // data-l10n-id: replacement-text
    "tl-title": "Logo Interpretisto",
    "tl-byauthor": "Per",
    "tl-tests": "Unuo Testoj",
    "tl-source": "Fonto",
    "start-togetherjs": "Kunlabori",
    "no-canvas": "Via retumilo ne subtenas la kanvaso elemento - Mizera !",
    "ip-button-run": "Run",
    "ip-button-clear": "Klara",
    "logo-ta-single-line": "Tajpu vian kodon ĉi tie...",
    "logo-ta-multi-line": "Tajpu vian kodon ĉi tie...",
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
      'orange': 'oranĝo',
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
