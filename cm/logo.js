
// Really just a lexer

CodeMirror.defineMode('logo', function(config, parserConfig) {

  // states are 'normal', 'defn-name', 'defn-args', 'defn-body'

  // TODO: list literals [ a b c ]
  // TODO: array literals { a b c }@0

  var regexIdentifier = /^\.?[A-Za-z][A-Za-z0-9_.\?]*/;
  var regexStringLiteral = /^"[^ \[\]\(\)\{\}]*/;
  var regexVariable = /^:[A-Za-z][A-Za-z0-9_]*/;
  var regexNumberLiteral = /^[0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?/;
  var regexOperator = /^\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>|\[|\]|\{|\}|\(|\)/;

  return {
    electricChars: "dD", // for enD

    startState: function() {
      return {
        state: 'normal'
      };
    },

    indent: function(state, textAfter) {
      switch(state.state) {
      case 'defn-name': return 2;
      case 'defn-vars':
      case 'defn-body': return /^END\b/i.test(textAfter) ? 0 : 2;
      default: return 0;
      }
    },

    token: function(stream, state) {
      var name, i;

      if (stream.eatSpace()) {
        return null;
      }

      // Comment
      if (stream.match(/^;.*/, true)) {
        return 'logo-comment';
      }

      if (state.state === 'normal') {
        if (stream.match(/^TO\b/i, true)) {
          state.state = 'defn-name';
          return 'logo-defn-start';
        }
        if (stream.match(/^END\b/i, true)) {
          return 'logo-error';
        }
      }

      if (state.state === 'defn-name') {
        if (stream.match(regexIdentifier, true)) {
          state.state = 'defn-vars';
          return 'logo-defn-name';
        }
        stream.next();
        state.state = 'normal';
        return 'logo-error';
      }

      if (state.state === 'defn-vars') {
        if (stream.match(regexVariable, true)) {
          return 'logo-defn-arg';
        }
        state.state = 'defn-body';
      }

      if (state.state === 'defn-body') {

        if (stream.match(/^END\b/i, true)) {
          state.state = 'normal';
          return 'logo-defn-end';
        }
      }

      if (state.state === 'normal' || state.state === 'defn-body') {

        // Number literal
        if (stream.match(regexNumberLiteral, true)) {
          return 'logo-number';
        }

        // String literal
        if (stream.match(regexStringLiteral, true)) {
          return 'logo-string';
        }

        // Operator
        if (stream.match(regexOperator, true)) {
          return 'logo-operator';
        }

        // Variable
        if (stream.match(regexVariable, true)) {
          return 'logo-variable';
        }

        // Identifier
        if (stream.match(regexIdentifier, true)) {
          return 'logo-word';
        }

        stream.next();
        return 'logo-error';
      }

      throw 'WTF?';
    }
  };
});

CodeMirror.defineMIME("text/x-logo", "logo");
