// Esperanto Localization - main page
(function() {

  // For RTL languages:
  //document.body.dir = 'rtl';

  // Override examples link e.g.:
  // examples = "l10n/examples.txt"

  (function(translation) {
    Array.from(document.querySelectorAll('[data-l10n-id]')).forEach(function(element) {
      var id = element.getAttribute('data-l10n-id');
      if (!translation.hasOwnProperty(id)) {
        console.warn('Missing translation: ' + id);
        return;
      }
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

}());
