// Esperanto Localization - Logo Interpreter
(function() {

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

  // Procedures - alias, keyword
  logo.copydef('vera', 'true');
  logo.copydef('falsa', 'false');

}());
