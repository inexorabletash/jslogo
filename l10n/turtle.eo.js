// Esperanto Localization - Turtle Graphics
(function() {

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
