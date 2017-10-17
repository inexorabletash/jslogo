//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011 Joshua Bell
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

function LogoInterpreter(turtle, stream, savehook)
{
  'use strict';

  var self = this;

  var UNARY_MINUS = '<UNARYMINUS>'; // Must not parse as a word

  var ERRORS = {
    BAD_INPUT: 4,
    NO_OUTPUT: 5,
    NOT_ENOUGH_INPUTS: 6,
    TOO_MANY_INPUTS: 8,
    BAD_OUTPUT: 9,
    MISSING_PAREN: 10,
    BAD_VAR: 11,
    BAD_PAREN: 12,
    ALREADY_DEFINED: 15,
    THROW_ERROR: 21,
    IS_PRIMITIVE: 22,
    BAD_PROC: 24,
    NO_TEST: 25,
    BAD_BRACKET: 26,
    BAD_BRACE: 27,
    USER_GENERATED: 35,
    MISSING_SPACE: 39
  };

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, function(m, n, o) {
      var s = (n === '_PROC_') ? self.stack[self.stack.length - 1] : String(params[n]);
      switch (o) {
        case ':U': return s.toUpperCase();
        case ':L': return s.toLowerCase();
        default: return s;
      }
    });
  }

  // To support localized/customized messages, assign a lookup function:
  // instance.localize = function(s) {
  //   return {
  //     'Division by zero': 'Divido per nulo',
  //     'Index out of bounds': 'Indekso ekster limojn',
  //     ...
  //   }[s];
  // };
  this.localize = null;
  function __(string) {
    if (self.localize)
      return self.localize(string) || string;
    return string;
  }

  // Shortcut for common use of format() and __()
  function err(string, params, code) {
    // Allow callng as err(string, code)
    if (typeof params === 'number') {
      code = params;
      params = undefined;
    }
    var error = new LogoError('ERROR', undefined, format(__(string), params));
    if (code !== undefined)
      error.code = code;
    return error;
  }

  function LogoError(tag, value, message) {
    this.name = 'LogoError';
    this.message = message || format(__('No CATCH for tag {tag}'), {tag: tag});
    this.tag = tag;
    this.value = value;
    this.proc = self.stack[self.stack.length - 1];
    this.code = -1; // TODO: Support code.
    this.line = -1; // TODO: Support line.
  }

  // To handle additional keyword aliases (localizations, etc), assign
  // a function to keywordAlias. Input will be the uppercased word,
  // output must be one of the keywords (ELSE or END), or undefined.
  // For example:
  // logo.keywordAlias = function(name) {
  //   return {
  //     'ALIE': 'ELSE',
  //     'FINO': 'END'
  //     ...
  //   }[name];
  // };
  this.keywordAlias = null;
  function isKeyword(atom, match) {
    if (Type(atom) !== 'word')
      return false;
    atom = String(atom).toUpperCase();
    if (self.keywordAlias)
      atom = self.keywordAlias(atom) || atom;
    return atom === match;
  }

  // Returns a promise; calls the passed function with (loop, resolve,
  // reject). Calling resolve or reject (or throwing) settles the
  // promise, calling loop repeats.
  function promiseLoop(func) {
    return new Promise(function(resolve, reject) {
      (function loop() {
        try {
          func(loop, resolve, reject);
        } catch (e) {
          reject(e);
        }
      }());
    });
  }

  // Takes a list of (possibly async) closures. Each is called in
  // turn, waiting for its result to resolve before the next is
  // executed. Resolves to an array of results, or rejects if any
  // closure rejects.
  function serialExecute(funcs) {
    var results = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!funcs.length) {
        resolve(results);
        return;
      }
      Promise.resolve(funcs.shift()())
        .then(function(result) {
          results.push(result);
          loop();
        }, reject);
    });
  }

  // Returns a promise with the same result as the passed promise, but
  // that executes finalBlock before it resolves, regardless of
  // whether it fulfills or rejects.
  function promiseFinally(promise, finalBlock) {
    return promise
      .then(function(result) {
        return Promise.resolve(finalBlock())
          .then(function() {
            return result;
          });
      }, function(err) {
        return Promise.resolve(finalBlock())
          .then(function() {
            throw err;
          });
      });
  }

  // Returns a Promise that will resolve after yielding control to the
  // event loop.
  function promiseYield() {
    return new Promise(function(resolve) {
      setTimeout(resolve, 0);
    });
  }

  // Based on: https://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  // Argument is `$$func$$` to avoid issue if passed function is named `func`.
  function to_arity($$func$$, arity) {
    var parms = [];

    if ($$func$$.length === arity)
      return $$func$$;

    for (var i = 0; i < arity; ++i)
      parms.push('a' + i);

    var f = eval('(function ' + $$func$$.name + '(' + parms.join(',') + ')' +
                 '{ return $$func$$.apply(this, arguments); })');
    return f;
  }


  //----------------------------------------------------------------------
  //
  // Classes
  //
  //----------------------------------------------------------------------

  // Adapted from:
  // https://stackoverflow.com/questions/424292/how-to-create-my-own-javascript-random-number-generator-that-i-can-also-set-the-s
  function PRNG(seed) {
    var S = seed & 0x7fffffff, // seed
        A = 48271, // const
        M = 0x7fffffff, // const
        Q = M / A, // const
        R = M % A; // const

    this.next = function PRNG_next() {
      var hi = S / Q,
          lo = S % Q,
          t = A * lo - R * hi;
      S = (t > 0) ? t : t + M;
      this.last = S / M;
      return this.last;
    };
    this.seed = function PRNG_seed(x) {
      S = x & 0x7fffffff;
    };
    this.next();
  }

  function StringMap(case_fold) {
    this._map = new Map();
    this._case_fold = case_fold;
  }
  Object.defineProperties(StringMap.prototype, {
    get: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.get(key);
    }},
    set: {value: function(key, value) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      this._map.set(key, value);
    }},
    has: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.has(key);
    }},
    delete: {value: function(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.delete(key);
    }},
    keys: {value: function() {
      var keys = [];
      this._map.forEach(function(value, key) { keys.push(key); });
      return keys;
    }},
    empty: {value: function() {
      return this._map.size === 0;
    }},
    forEach: {value: function(fn) {
      return this._map.forEach(function(value, key) {
        fn(key, value);
      });
    }}
  });

  function LogoArray(size, origin) {
    this._array = [];
    this._array.length = size;
    for (var i = 0; i < this._array.length; ++i)
      this._array[i] = [];
    this._origin = origin;
  }
  LogoArray.from = function(list, origin) {
    var array = new LogoArray(0, origin);
    array._array = Array.from(list);
    return array;
  };
  Object.defineProperties(LogoArray.prototype, {
    item: {value: function(i) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return this._array[i];
    }},
    setItem: {value: function(i, v) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      this._array[i] = v;
    }},
    list: {get: function() {
      return this._array;
    }},
    origin: {get: function() {
      return this._origin;
    }},
    length: {get: function() {
      return this._array.length;
    }}
  });

  function Stream(string) {
    this._string = string;
    this._index = 0;
    this._skip();
  }
  Object.defineProperties(Stream.prototype, {
    eof: {get: function() {
      return this._index >= this._string.length;
    }},
    peek: {value: function() {
      var c = this._string.charAt(this._index);
      if (c === '\\')
        c += this._string.charAt(this._index + 1);
      return c;
    }},
    get: {value: function() {
      var c = this._next();
      this._skip();
      return c;
    }},
    _next: {value: function() {
      var c = this._string.charAt(this._index++);
      if (c === '\\')
        c += this._string.charAt(this._index++);
      return c;
    }},
    _skip: {value: function() {
      while (!this.eof) {
        var c = this.peek();
        if (c === '~' && this._string.charAt(this._index + 1) === '\n') {
          this._index += 2;
        } else if (c === ';') {
          do {
            c = this._next();
          } while (!this.eof && this.peek() !== '\n');
          if (c === '~')
            this._next();
        } else {
          return;
        }
      }
    }},
    rest: {get: function() {
      return this._string.substring(this._index);
    }}
  });

  //----------------------------------------------------------------------
  //
  // Interpreter State
  //
  //----------------------------------------------------------------------

  self.turtle = turtle;
  self.stream = stream;
  self.routines = new StringMap(true);
  self.scopes = [new StringMap(true)];
  self.plists = new StringMap(true);
  self.prng = new PRNG(Math.random() * 0x7fffffff);
  self.forceBye = false;

  //----------------------------------------------------------------------
  //
  // Parsing
  //
  //----------------------------------------------------------------------

  // Used to return values from routines (thrown/caught)
  function Output(output) { this.output = output; }
  Output.prototype.toString = function() { return this.output; };
  Output.prototype.valueOf = function() { return this.output; };

  // Used to stop processing cleanly
  function Bye() { }

  function Type(atom) {
    if (atom === undefined) {
      // TODO: Should be caught higher upstream than this
      throw err("No output from procedure", ERRORS.NO_OUTPUT);
    } else if (typeof atom === 'string' || typeof atom === 'number') {
      return 'word';
    } else if (Array.isArray(atom)) {
      return 'list';
    } else if (atom instanceof LogoArray) {
      return 'array';
    } else if ('then' in Object(atom)) {
      throw new Error("Internal error: Unexpected value: a promise");
    } else if (!atom) {
      throw new Error("Internal error: Unexpected value: null");
    } else {
      throw new Error("Internal error: Unexpected value: unknown type");
    }
  }


  //
  // Tokenize into atoms / lists
  //
  // Input: string
  // Output: atom list (e.g. "to", "jump", "repeat", "random", 10, [ "fd", "10", "rt", "10" ], "end"
  //

  function parse(string) {
    if (string === undefined) {
      return undefined; // TODO: Replace this with ...?
    }

    var atoms = [],
        prev, r;

    var stream = new Stream(string);
    while (stream.peek()) {
      var atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      var leading_space = isWS(stream.peek());
      while (isWS(stream.peek()))
        stream.get();
      if (!stream.peek())
        break;

      if (stream.peek() === '[') {
        stream.get();
        atom = parseList(stream);
      } else if (stream.peek() === ']') {
        throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
      } else if (stream.peek() === '{') {
        stream.get();
        atom = parseArray(stream);
      } else if (stream.peek() === '}') {
        throw err("Unexpected '}'", ERRORS.BAD_BRACE);
      } else if (stream.peek() === '"') {
        atom = parseQuoted(stream);
      } else if (isOwnWord(stream.peek())) {
        atom = stream.get();
      } else if (inRange(stream.peek(), '0', '9')) {
        atom = parseNumber(stream);
      } else if (inChars(stream.peek(), OPERATOR_CHARS)) {
        atom = parseOperator(stream);
        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by a
        // space and followed by a nonspace.

        if (atom === '-') {
          var trailing_space = isWS(stream.peek());
          if (prev === undefined ||
              (Type(prev) === 'word' && isInfix(prev)) ||
              (Type(prev) === 'word' && prev === '(') ||
              (leading_space && !trailing_space)) {
            atom = UNARY_MINUS;
          }
        }
      } else if (!inChars(stream.peek(), WORD_DELIMITER)) {
        atom = parseWord(stream);
      } else {
        // NOTE: This shouldn't be reachable.
        throw err("Couldn't parse: '{string}'", { string: stream.rest });
      }
      atoms.push(atom);
      prev = atom;
    }

    return atoms;
  }

  function inRange(x, a, b) {
    return a <= x && x <= b;
  }

  function inChars(x, chars) {
    return x && chars.indexOf(x) !== -1;
  }

  var WS_CHARS = ' \f\n\r\t\v';
  function isWS(c) {
    return inChars(c, WS_CHARS);
  }

  // "After a quotation mark outside square brackets, a word is
  // delimited by a space, a square bracket, or a parenthesis."
  var QUOTED_DELIMITER = WS_CHARS + '[](){}';
  function parseQuoted(stream) {
    var word = '';
    while (!stream.eof && QUOTED_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // Non-standard: U+2190 ... U+2193 are arrows, parsed as own-words.
  var OWNWORD_CHARS = '\u2190\u2191\u2192\u2193';
  function isOwnWord(c) {
    return inChars(c, OWNWORD_CHARS);
  }

  // "A word not after a quotation mark or inside square brackets is
  // delimited by a space, a bracket, a parenthesis, or an infix
  // operator +-*/=<>. Note that words following colons are in this
  // category. Note that quote and colon are not delimiters."
  var WORD_DELIMITER = WS_CHARS + '[](){}+-*/%^=<>';
  function parseWord(stream) {
    var word = '';
    while (!stream.eof && WORD_DELIMITER.indexOf(stream.peek()) === -1) {
      var c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // "Each infix operator character is a word in itself, except that
  // the two-character sequences <=, >=, and <> (the latter meaning
  // not-equal) with no intervening space are recognized as a single
  // word."
  var OPERATOR_CHARS = '+-*/%^=<>[]{}()';
  function parseOperator(stream) {
    var word = '';
    if (inChars(stream.peek(), OPERATOR_CHARS))
      word += stream.get();
    if ((word === '<' && stream.peek() === '=') ||
        (word === '>' && stream.peek() === '=') ||
        (word === '<' && stream.peek() === '>')) {
      word += stream.get();
    }
    return word;
  }

  function isInfix(word) {
    return ['+', '-', '*', '/', '%', '^', '=', '<', '>', '<=', '>=', '<>']
      .includes(word);
  }

  function isOperator(word) {
    return isInfix(word) || ['[', ']', '{', '}', '(', ')'].includes(word);
  }

  // Non-standard: Numbers support exponential notation (e.g. 1.23e-45)
  function parseNumber(stream) {
    var word = '';
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    if (stream.peek() === '.')
      word += stream.get();
    if (inRange(stream.peek(), '0', '9')) {
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    if (stream.peek() === 'E' || stream.peek() === 'e') {
      word += stream.get();
      if (stream.peek() === '-' || stream.peek() === '+')
        word += stream.get();
      while (inRange(stream.peek(), '0', '9'))
        word += stream.get();
    }
    return word;
  }

  // Includes leading - sign, unlike parseNumber().
  function isNumber(s) {
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE][\-+]?[0-9]+)?)$/);
  }

  function parseInteger(stream) {
    var word = '';
    if (stream.peek() === '-')
      word += stream.get();
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    return word;
  }

  function parseList(stream) {
    var list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c)
        throw err("Expected ']'", ERRORS.BAD_BRACKET);
      if (isWS(c))
        continue;
      if (c === ']')
        return list;
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      if (c === '}')
        throw err("Unexpected '}'", ERRORS.BAD_BRACE);
      throw err("Unexpected '{c}'", {c: c});
    }
  }

  function parseArray(stream) {
    var list = [],
        origin = 1,
        atom = '',
        c, r;

    while (true) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = stream.get();
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c)
        throw err("Expected '}'", ERRORS.BAD_BRACE);
      if (isWS(c))
        continue;
      if (c === '}') {
        while (isWS(stream.peek()))
          stream.get();
        if (stream.peek() === '@') {
          stream.get();
          while (isWS(stream.peek()))
            stream.get();
          origin = Number(parseInteger(stream) || 0);
        }
        return LogoArray.from(list, origin);
      }
      if (c === '[') {
        list.push(parseList(stream));
        continue;
      }
      if (c === ']')
        throw err("Unexpected ']'", ERRORS.BAD_BRACKET);
      if (c === '{') {
        list.push(parseArray(stream));
        continue;
      }
      throw err("Unexpected '{c}'", {c: c});
    }
  }

  function reparse(list) {
    return parse(stringify_nodecorate(list).replace(/([\\;])/g, '\\$1'));
  }

  function maybegetvar(name) {
    var lval = lvalue(name);
    return lval ? lval.value : undefined;
  }

  function getvar(name) {
    var value = maybegetvar(name);
    if (value !== undefined)
      return value;
    throw err("Don't know about variable {name:U}", {name: name}, ERRORS.BAD_VAR);
  }

  function lvalue(name) {
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name);
      }
    }
    return undefined;
  }

  function setvar(name, value) {
    value = copy(value);

    // Find the variable in existing scope
    var lval = lvalue(name);
    if (lval) {
      lval.value = value;
    } else {
      // Otherwise, define a global
      lval = {value: value};
      self.scopes[0].set(name, lval);
    }
  }

  function local(name) {
    var scope = self.scopes[self.scopes.length - 1];
    scope.set(sexpr(name), {value: undefined});
  }

  function setlocal(name, value) {
    value = copy(value);
    var scope = self.scopes[self.scopes.length - 1];
    scope.set(sexpr(name), {value: value});
  }

  //----------------------------------------------------------------------
  //
  // Expression Evaluation
  //
  //----------------------------------------------------------------------

  // Expression               := RelationalExpression
  // RelationalExpression     := AdditiveExpression [ ( '=' | '<' | '>' | '<=' | '>=' | '<>' ) AdditiveExpression ... ]
  // AdditiveExpression       := MultiplicativeExpression [ ( '+' | '-' ) MultiplicativeExpression ... ]
  // MultiplicativeExpression := PowerExpression [ ( '*' | '/' | '%' ) PowerExpression ... ]
  // PowerExpression          := UnaryExpression [ '^' UnaryExpression ]
  // UnaryExpression          := ( '-' ) UnaryExpression
  //                           | FinalExpression
  // FinalExpression          := string-literal
  //                           | number-literal
  //                           | list
  //                           | variable-reference
  //                           | procedure-call
  //                           | '(' Expression ')'

  // Peek at the list to see if there are additional atoms from a set
  // of options.
  function peek(list, options) {
    if (list.length < 1) { return false; }
    var next = list[0];
    return options.some(function(x) { return next === x; });

  }

  function evaluateExpression(list) {
    return (expression(list))();
  }

  function expression(list) {
    return relationalExpression(list);
  }

  function relationalExpression(list) {
    var lhs = additiveExpression(list);
    var op;
    while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = additiveExpression(list);

        switch (op) {
          case "<": return defer(function(lhs, rhs) { return (aexpr(lhs) < aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case ">": return defer(function(lhs, rhs) { return (aexpr(lhs) > aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case "=": return defer(function(lhs, rhs) { return equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);

          case "<=": return defer(function(lhs, rhs) { return (aexpr(lhs) <= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case ">=": return defer(function(lhs, rhs) { return (aexpr(lhs) >= aexpr(rhs)) ? 1 : 0; }, lhs, rhs);
          case "<>": return defer(function(lhs, rhs) { return !equal(lhs, rhs) ? 1 : 0; }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }


  // Takes a function and list of (possibly async) closures. Returns a
  // closure that, when executed, evaluates the closures serially then
  // applies the function to the results.
  function defer(func /*, input...*/) {
    var input = [].slice.call(arguments, 1);
    return function() {
      return serialExecute(input.slice())
        .then(function(args) {
          return func.apply(null, args);
        });
    };
  }

  function additiveExpression(list) {
    var lhs = multiplicativeExpression(list);
    var op;
    while (peek(list, ['+', '-'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = multiplicativeExpression(list);
        switch (op) {
          case "+": return defer(function(lhs, rhs) { return aexpr(lhs) + aexpr(rhs); }, lhs, rhs);
          case "-": return defer(function(lhs, rhs) { return aexpr(lhs) - aexpr(rhs); }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function multiplicativeExpression(list) {
    var lhs = powerExpression(list);
    var op;
    while (peek(list, ['*', '/', '%'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = powerExpression(list);
        switch (op) {
          case "*": return defer(function(lhs, rhs) { return aexpr(lhs) * aexpr(rhs); }, lhs, rhs);
          case "/": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n / d;
          }, lhs, rhs);
          case "%": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
            return n % d;
          }, lhs, rhs);
          default: throw new Error("Internal error in expression parser");
        }
      } (lhs);
    }

    return lhs;
  }

  function powerExpression(list) {
    var lhs = unaryExpression(list);
    var op;
    while (peek(list, ['^'])) {
      op = list.shift();
      lhs = function(lhs) {
        var rhs = unaryExpression(list);
        return defer(function(lhs, rhs) { return Math.pow(aexpr(lhs), aexpr(rhs)); }, lhs, rhs);
      } (lhs);
    }

    return lhs;
  }

  function unaryExpression(list) {
    var rhs, op;

    if (peek(list, [UNARY_MINUS])) {
      op = list.shift();
      rhs = unaryExpression(list);
      return defer(function(rhs) { return -aexpr(rhs); }, rhs);
    } else {
      return finalExpression(list);
    }
  }

  function finalExpression(list) {
    if (!list.length)
      throw err("Unexpected end of instructions", ERRORS.MISSING_PAREN);

    var atom = list.shift();

    var result, literal, varname;

    switch (Type(atom)) {
    case 'array':
    case 'list':
      return function() { return atom; };

    case 'word':
      if (isNumber(atom)) {
        // number literal
        atom = parseFloat(atom);
        return function() { return atom; };
      }

      atom = String(atom);
      if (atom.charAt(0) === '"' || atom.charAt(0) === "'") {
        // string literal
        literal = atom.substring(1);
        return function() { return literal; };
      }
      if (atom.charAt(0) === ':') {
        // variable
        varname = atom.substring(1);
        return function() { return getvar(varname); };
      }
      if (atom === '(') {
        // parenthesized expression/procedure call
        if (list.length && Type(list[0]) === 'word' && self.routines.has(String(list[0])) &&
            !(list.length > 1 && Type(list[1]) === 'word' && isInfix(String(list[1])))) {
          // Lisp-style (procedure input ...) calling syntax
          atom = list.shift();
          return self.dispatch(atom, list, false);
        }
        // Standard parenthesized expression
        result = expression(list);

        if (!list.length)
          throw err("Expected ')'", ERRORS.MISSING_PAREN);
        if (!peek(list, [')']))
          throw err("Expected ')', saw {word}", { word: list.shift() }, ERRORS.MISSING_PAREN);
        list.shift();
        return result;
      }
      if (atom === ')')
        throw err("Unexpected ')'", ERRORS.BAD_PAREN);
      // Procedure dispatch
      return self.dispatch(atom, list, true);

    default: throw new Error("Internal error in expression parser");
    }
  }

  self.stack = [];

  self.dispatch = function(name, tokenlist, natural) {
    name = name.toUpperCase();
    var procedure = self.routines.get(name);
    if (!procedure) {

      // Give a helpful message in a common error case.
      var m;
      if ((m = /^(\w+?)(\d+)$/.exec(name)) && self.routines.get(m[1])) {
        throw err("Need a space between {name:U} and {value}",
                  { name: m[1], value: m[2] }, ERRORS.MISSING_SPACE);
      }

      throw err("Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    }

    if (procedure.special) {
      // Special routines are built-ins that get handed the token list:
      // * workspace modifiers like TO that special-case varnames
      self.stack.push(name);
      try {
        procedure.call(self, tokenlist);
        return function() { };
      } finally {
        self.stack.pop();
      }
    }

    var args = [];
    if (natural) {
      // Natural arity of the function
      for (var i = 0; i < procedure.default; ++i) {
        args.push(expression(tokenlist));
      }
    } else {
      // Caller specified argument count
      while (tokenlist.length && !peek(tokenlist, [')'])) {
        args.push(expression(tokenlist));
      }
      tokenlist.shift(); // Consume ')'

      if (args.length < procedure.minimum)
        throw err("Not enough inputs for {name:U}", {name: name}, ERRORS.NOT_ENOUGH_INPUTS);
      if (procedure.maximum !== -1 && args.length > procedure.maximum)
        throw err("Too many inputs for {name:U}", {name: name}, ERRORS.TOO_MANY_INPUTS);
    }

    if (procedure.noeval) {
      return function() {
        self.stack.push(name);
        return promiseFinally(procedure.apply(self, args),
                              function() { self.stack.pop(); });
      };
    }

    return function() {
      self.stack.push(name);
      return promiseFinally(serialExecute(args.slice()).then(function(args) {
        return procedure.apply(self, args);
      }), function() { self.stack.pop(); });
    };
  };

  //----------------------------------------------------------------------
  // Arithmetic expression convenience function
  //----------------------------------------------------------------------
  function aexpr(atom) {
    if (atom === undefined) {
      throw err("Expected number", ERRORS.BAD_INPUT);
    }
    switch (Type(atom)) {
    case 'word':
      if (isNumber(atom))
        return parseFloat(atom);
      break;
    }
    throw err("Expected number", ERRORS.BAD_INPUT);
  }

  //----------------------------------------------------------------------
  // String expression convenience function
  //----------------------------------------------------------------------
  function sexpr(atom) {
    if (atom === undefined) throw err("Expected string", ERRORS.BAD_INPUT);
    if (atom === UNARY_MINUS) return '-';
    if (Type(atom) === 'word') return String(atom);

    throw new err("Expected string", ERRORS.BAD_INPUT);
  }

  //----------------------------------------------------------------------
  // List expression convenience function
  //----------------------------------------------------------------------

  // 'list expression'
  // Takes an atom - if it is a list is is returned unchanged. If it
  // is a word a list of the characters is returned. If the procedure
  // returns a list, the output type should match the input type, so
  // use sifw().
  function lexpr(atom) {
    if (atom === undefined)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
    switch (Type(atom)) {
    case 'word':
      return Array.from(String(atom));
    case 'list':
      return copy(atom);
    }

    throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
  }

  // 'stringify if word'
  // Takes an atom which is to be the subject of lexpr() and a result
  // list. If the atom is a word, returns a word, otherwise a list.
  function sifw(atom, list) {
    return (Type(atom) === 'word') ? list.join('') : list;
  }

  //----------------------------------------------------------------------
  // Returns a deep copy of a value (word or list). Arrays are copied
  // by reference.
  //----------------------------------------------------------------------
  function copy(value) {
    switch (Type(value)) {
    case 'list': return value.map(copy);
    default: return value;
    }
  }

  //----------------------------------------------------------------------
  // Deep compare of values (numbers, strings, lists)
  //----------------------------------------------------------------------
  function equal(a, b) {
    if (Type(a) !== Type(b)) return false;
    switch (Type(a)) {
    case 'word':
      if (typeof a === 'number' || typeof b === 'number')
        return Number(a) === Number(b);
      else
        return String(a) === String(b);
    case 'list':
      if (a.length !== b.length)
        return false;
      for (var i = 0; i < a.length; ++i) {
        if (!equal(a[i], b[i]))
          return false;
      }
      return true;
    case 'array':
      return a === b;
    }
    return undefined;
  }

  //----------------------------------------------------------------------
  //
  // Execute a script
  //
  //----------------------------------------------------------------------

  //----------------------------------------------------------------------
  // Execute a sequence of statements
  //----------------------------------------------------------------------
  self.execute = function(statements, options) {
    options = Object(options);
    // Operate on a copy so the original is not destroyed
    statements = statements.slice();

    var lastResult;
    return promiseLoop(function(loop, resolve, reject) {
      if (self.forceBye) {
        self.forceBye = false;
        reject(new Bye);
        return;
      }
      if (!statements.length) {
        resolve(lastResult);
        return;
      }
      Promise.resolve(evaluateExpression(statements))
        .then(function(result) {
          if (result !== undefined && !options.returnResult) {
            reject(err("Don't know what to do with {result}", {result: result},
                  ERRORS.BAD_OUTPUT));
            return;
          }
          lastResult = result;
          loop();
        }, reject);
    });
  };

  // FIXME: should this confirm that something is running?
  self.bye = function() {
    self.forceBye = true;
  };

  var lastRun = Promise.resolve();

  // Call to insert an arbitrary task (callback) to be run in sequence
  // with pending calls to run. Useful in tests to do work just before
  // a subsequent assertion.
  self.queueTask = function(task) {
    var promise = lastRun.then(function() {
      return Promise.resolve(task());
    });
    lastRun = promise.catch(function(){});
    return promise;
  };

  self.run = function(string, options) {
    options = Object(options);
    return self.queueTask(function() {
      // Parse it
      var atoms = parse(string);

      // And execute it!
      return self.execute(atoms, options)
        .catch(function(err) {
          if (!(err instanceof Bye))
            throw err;
        });
    });
  };

  self.definition = function(name, proc) {

    function defn(atom) {
      switch (Type(atom)) {
      case 'word': return String(atom);
      case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
      case 'array': return '{ ' + atom.list.map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error("Internal error: unknown type");
      }
    }

    var def = "to " + name;

    def += proc.inputs.map(function(i) {
      return ' :' + i;
    }).join('');
    def += proc.optional_inputs.map(function(op) {
      return ' [:' + op[0] + ' ' + op[1].map(defn).join(' ') + ']';;
    }).join('');
    if (proc.rest)
      def += ' [:' + proc.rest + ']';
    if (proc.def !== undefined)
      def += ' ' + proc.def;

    def += "\n";
    def += "  " + proc.block.map(defn).join(" ").replace(new RegExp(UNARY_MINUS + ' ', 'g'), '-');
    def += "\n" + "end";

    return def;
  };

  // API to allow pages to persist definitions
  self.procdefs = function() {
    var defs = [];
    self.routines.forEach(function(name, proc) {
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n\n");
  };

  // API to allow aliasing. Can be used for localization. Does not
  // check for errors.
  self.copydef = function(newname, oldname) {
    self.routines.set(newname, self.routines.get(oldname));
  };

  //----------------------------------------------------------------------
  //
  // Built-In Proceedures
  //
  //----------------------------------------------------------------------

  // Basic form:
  //
  //  def("procname", function(input1, input2, ...) { ... return output; });
  //   * inputs are JavaScript strings, numbers, or Arrays
  //   * output is string, number, Array or undefined/no output
  //
  // Special forms:
  //
  //  def("procname", function(tokenlist) { ... }, {special: true});
  //   * input is Array (list) of tokens (words, numbers, Arrays)
  //   * used for implementation of special forms (e.g. TO inputs... statements... END)
  //
  //  def("procname", function(fin, fin, ...) { ... return op; }, {noeval: true});
  //   * inputs are arity-0 functions that evaluate to string, number Array
  //   * used for short-circuiting evaluation (AND, OR)
  //   * used for repeat evaluation (DO.WHILE, WHILE, DO.UNTIL, UNTIL)
  //

  function stringify(thing) {
    switch (Type(thing)) {
    case 'list':
      return "[" + thing.map(stringify).join(" ") + "]";
    case 'array':
      return "{" + thing.list.map(stringify).join(" ") + "}" +
        (thing.origin === 1 ? '' : '@' + thing.origin);
    default:
      return sexpr(thing);
    }
  }

  function stringify_nodecorate(thing) {
    switch (Type(thing)) {
    case 'list':
      return thing.map(stringify).join(" ");
    case 'array':
      return thing.list.map(stringify).join(" ");
    default:
      return sexpr(thing);
    }
  }

  function def(name, fn, props) {
    fn.minimum = fn.default = fn.maximum = fn.length;
    if (props) {
      Object.keys(props).forEach(function(key) {
        fn[key] = props[key];
      });
    }
    fn.primitive = true;
    if (Array.isArray(name)) {
      name.forEach(function(name) {
        self.routines.set(name, fn);
      });
    } else {
      self.routines.set(name, fn);
    }
  }

  //
  // Procedures and Flow Control
  //
  def("to", function(list) {
    var name = sexpr(list.shift());
    if (isNumber(name) || isOperator(name))
      throw err("TO: Expected identifier", ERRORS.BAD_INPUT);

    var inputs = []; // [var, ...]
    var optional_inputs = []; // [[var, [expr...]], ...]
    var rest = undefined; // undefined or var
    var length = undefined; // undefined or number
    var block = [];

    // Process inputs, then the statements of the block
    var REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, BLOCK = 4;
    var state = REQUIRED, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (isKeyword(atom, 'END')) {
        sawEnd = true;
        break;
      }

      if (state === REQUIRED) {
        if (Type(atom) === 'word' && String(atom).charAt(0) === ':') {
          inputs.push(atom.substring(1));
          continue;
        }
        state = OPTIONAL;
      }

      if (state === OPTIONAL) {
        if (Type(atom) === 'list' && atom.length > 1 &&
            String(atom[0]).charAt(0) === ':') {
          optional_inputs.push([atom.shift().substring(1), atom]);
          continue;
        }
        state = REST;
      }

      if (state === REST) {
        state = DEFAULT;
        if (Type(atom) === 'list' && atom.length === 1 &&
            String(atom[0]).charAt(0) === ':') {
          rest = atom[0].substring(1);
          continue;
        }
      }

      if (state === DEFAULT) {
        state = BLOCK;
        if (Type(atom) === 'word' && isNumber(atom)) {
          length = parseFloat(atom);
          continue;
        }
      }

      block.push(atom);
    }
    if (!sawEnd)
      throw err("TO: Expected END", ERRORS.BAD_INPUT);

    defineProc(name, inputs, optional_inputs, rest, length, block);
  }, {special: true});

  function defineProc(name, inputs, optional_inputs, rest, def, block) {
    if (self.routines.has(name) && self.routines.get(name).primitive)
      throw err("{_PROC_}: Can't redefine primitive {name:U}", { name: name },
                ERRORS.IS_PRIMITIVE);

    if (def !== undefined &&
        (def < inputs.length || (!rest && def > inputs.length + optional_inputs.length))) {
      throw err("{_PROC_}: Bad default number of inputs for {name:U}", {name: name},
               ERRORS.BAD_INPUT);
    }

    var length = (def === undefined) ? inputs.length : def;

    // Closure over inputs and block to handle scopes, arguments and outputs
    var func = function() {
      // Define a new scope
      var scope = new StringMap(true);
      self.scopes.push(scope);

      var i = 0, op;
      for (; i < inputs.length && i < arguments.length; ++i)
        scope.set(inputs[i], {value: arguments[i]});
      for (; i < inputs.length + optional_inputs.length && i < arguments.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: arguments[i]});
      }
      for (; i < inputs.length + optional_inputs.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: evaluateExpression(reparse(op[1]))});
      }
      if (rest)
        scope.set(rest, {value: [].slice.call(arguments, i)});

      return promiseFinally(self.execute(block).then(promiseYield, function(err) {
        if (err instanceof Output)
          return err.output;
        throw err;
      }), function() {
        self.scopes.pop();
      });
    };

    var proc = to_arity(func, length);
    self.routines.set(name, proc);

    // For DEF de-serialization
    proc.inputs = inputs;
    proc.optional_inputs = optional_inputs;
    proc.rest = rest;
    proc.def = def;
    proc.block = block;

    proc.minimum = inputs.length;
    proc.default = length;
    proc.maximum = rest ? -1 : inputs.length + optional_inputs.length;

    if (savehook)
      savehook(name, self.definition(name, proc));
  }


  def("def", function(list) {

    var name = sexpr(list);
    var proc = this.routines.get(name);
    if (!proc)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (!proc.inputs) {
      throw err("{_PROC_}: Can't show definition of primitive {name:U}", { name: name },
               ERRORS.IS_PRIMITIVE);
    }

    return this.definition(name, proc);
  });


  //----------------------------------------------------------------------
  //
  // 2. Data Structure Primitives
  //
  //----------------------------------------------------------------------

  //
  // 2.1 Constructors
  //

  def("word", function(word1, word2) {
    return arguments.length ?
      Array.from(arguments).map(sexpr).reduce(function(a, b) { return a + b; }) : "";
  }, {minimum: 0, maximum: -1});

  def("list", function(thing1, thing2) {
    return Array.from(arguments).map(function(x) { return x; }); // Make a copy
  }, {minimum: 0, maximum: -1});

  def(["sentence", "se"], function(thing1, thing2) {
    var list = [];
    for (var i = 0; i < arguments.length; ++i) {
      var thing = arguments[i];
      if (Type(thing) === 'list') {
        thing = lexpr(thing);
        list = list.concat(thing);
      } else {
        list.push(thing);
      }
    }
    return list;
  }, {minimum: 0, maximum: -1});

  def("fput", function(thing, list) {
    var l = lexpr(list); l.unshift(thing); return sifw(list, l);
  });

  def("lput", function(thing, list) {
    var l = lexpr(list); l.push(thing); return sifw(list, l);
  });

  def("array", function(size) {
    size = aexpr(size);
    if (size < 1)
      throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
    var origin = (arguments.length < 2) ? 1 : aexpr(arguments[1]);
    return new LogoArray(size, origin);
  }, {maximum: 2});

  def("mdarray", function(sizes) {
    sizes = lexpr(sizes).map(aexpr).map(function(n) { return n|0; });
    if (sizes.some(function(size) { return size < 1; }))
      throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
    var origin = (arguments.length < 2) ? 1 : aexpr(arguments[1]);

    function make(index) {
      var n = sizes[index], a = new LogoArray(n, origin);
      if (index + 1 < sizes.length) {
        for (var i = 0; i < n; ++i)
          a.setItem(i + origin, make(index + 1));
      }
      return a;
    }

    return make(0);
  }, {maximum: 2});

  def("listtoarray", function(list) {
    list = lexpr(list);
    var origin = 1;
    if (arguments.length > 1)
      origin = aexpr(arguments[1]);
    return LogoArray.from(list, origin);
  }, {maximum: 2});

  def("arraytolist", function(array) {
    if (Type(array) !== 'array') {
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    }
    return array.list.slice();
  });

  def("combine", function(thing1, thing2) {
    if (Type(thing2) !== 'list') {
      return this.routines.get('word')(thing1, thing2);
    } else {
      return this.routines.get('fput')(thing1, thing2);
    }
  });

  def("reverse", function(list) {
    var tail = (arguments.length > 1) ? arguments[1] : (Type(list) === 'list' ? [] : '');
    return sifw(tail, lexpr(list).reverse().concat(lexpr(tail)));
  }, {maximum: 2});

  this.gensym_index = 0;
  def("gensym", function() {
    ++this.gensym_index;
    return 'G' + this.gensym_index;
  });

  //
  // 2.2 Data Selectors
  //

  def("first", function(list) { return lexpr(list)[0]; });

  def("firsts", function(list) {
    return lexpr(list).map(function(x) { return x[0]; });
  });

  def("last", function(list) { list = lexpr(list); return list[list.length - 1]; });

  def(["butfirst", "bf"], function(list) {
    return sifw(list, lexpr(list).slice(1));
  });

  def(["butfirsts", "bfs"], function(list) {
    return lexpr(list).map(function(x) { return sifw(x, lexpr(x).slice(1)); });
  });

  def(["butlast", "bl"], function(list) {
    return Type(list) === 'word' ? String(list).slice(0, -1) : lexpr(list).slice(0, -1);
  });

  function item(index, thing) {
    switch (Type(thing)) {
    case 'list':
      if (index < 1 || index > thing.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return thing[index - 1];
    case 'array':
      return thing.item(index);
    default:
      thing = sexpr(thing);
      if (index < 1 || index > thing.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return thing.charAt(index - 1);
    }
  }

  def("item", function(index, thing) {
    index = aexpr(index)|0;
    return item(index, thing);
  });

  def("mditem", function(indexes, thing) {
    indexes = lexpr(indexes).map(aexpr).map(function(n) { return n|0; });
    while (indexes.length)
      thing = item(indexes.shift(), thing);
    return thing;
  });

  def("pick", function(list) {
    list = lexpr(list);
    var i = Math.floor(this.prng.next() * list.length);
    return list[i];
  });

  def("remove", function(thing, list) {
    return sifw(list, lexpr(list).filter(function(x) { return !equal(x, thing); }));
  });

  def("remdup", function(list) {
    // TODO: This only works with JS equality. Use equalp.
    var set = new Set();
    return sifw(list, lexpr(list).filter(function(x) {
      if (set.has(x)) { return false; } else { set.add(x); return true; }
    }));
  });

  def("split", function(thing, list) {
    var l = lexpr(list);
    return lexpr(list)
      .reduce(function(ls, i) {
        return (equal(i, thing) ? ls.push([]) : ls[ls.length - 1].push(i), ls);
      }, [[]])
      .filter(function(l) { return l.length > 0; })
      .map(function(e) { return sifw(list, e); });
  });

  def("quoted", function(thing) {
    if (Type(thing) === 'word')
      return '"' + thing;
    return thing;
  });


  //
  // 2.3 Data Mutators
  //

  function contains(atom, value) {
    if (atom === value) return true;
    switch (Type(atom)) {
    case 'list':
      return atom.some(function(a) { return contains(a, value); });
    case 'array':
      return atom.list.some(function(a) { return contains(a, value); });
    default:
      return false;
    }
  }

  def("setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    if (contains(value, array))
      throw err("{_PROC_}: Can't create circular array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("mdsetitem", function(indexes, thing, value) {
    indexes = lexpr(indexes).map(aexpr).map(function(n) { return n|0; });
    if (Type(thing) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    if (contains(value, thing))
      throw err("{_PROC_}: Can't create circular array", ERRORS.BAD_INPUT);
    while (indexes.length > 1) {
      thing = item(indexes.shift(), thing);
      if (Type(thing) !== 'array')
        throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    }
    thing.setItem(indexes.shift(), value);
  });

  def(".setfirst", function(list, value) {
     if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
    list[0] = value;
  });

  def(".setbf", function(list, value) {
    if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    if (list.length < 1)
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    value = lexpr(value);
    list.length = 1;
    list.push.apply(list, value);
  });

  def(".setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("push", function(stackname, thing) {
    var got = getvar(stackname);
    var stack = lexpr(got);
    stack.unshift(thing);
    setvar(stackname, sifw(got, stack));
  });

  def("pop", function(stackname) {
    var got = getvar(stackname);
    var stack = lexpr(got);
    var atom = stack.shift();
    setvar(stackname, sifw(got, stack));
    return atom;
  });

  def("queue", function(stackname, thing) {
    var got = getvar(stackname);
    var queue = lexpr(got);
    queue.push(thing);
    setvar(stackname, sifw(got, queue));
  });

  def("dequeue", function(stackname) {
    var got = getvar(stackname);
    var queue = lexpr(got);
    var atom = queue.pop();
    setvar(stackname, sifw(got, queue));
    return atom;
  });


  //
  // 2.4 Predicates
  //

  def(["wordp", "word?"], function(thing) { return Type(thing) === 'word' ? 1 : 0; });
  def(["listp", "list?"], function(thing) { return Type(thing) === 'list' ? 1 : 0; });
  def(["arrayp", "array?"], function(thing) { return Type(thing) === 'array' ? 1 : 0; });
  def(["numberp", "number?"], function(thing) {
    return Type(thing) === 'word' && isNumber(thing) ? 1 : 0;
  });
  def(["numberwang"], function(thing) { return this.prng.next() < 0.5 ? 1 : 0; });

  def(["equalp", "equal?"], function(a, b) { return equal(a, b) ? 1 : 0; });
  def(["notequalp", "notequal?"], function(a, b) { return !equal(a, b) ? 1 : 0; });

  def(["emptyp", "empty?"], function(thing) {
    switch (Type(thing)) {
    case 'word': return String(thing).length === 0 ? 1 : 0;
    case 'list': return thing.length === 0 ? 1 : 0;
    default: return 0;
    }
  });
  def(["beforep", "before?"], function(word1, word2) {
    return sexpr(word1) < sexpr(word2) ? 1 : 0;
  });

  def(".eq", function(a, b) { return a === b && a && typeof a === 'object'; });

  // Not Supported: vbarredp

  def(["memberp", "member?"], function(thing, list) {
    return lexpr(list).some(function(x) { return equal(x, thing); }) ? 1 : 0;
  });


  def(["substringp", "substring?"], function(word1, word2) {
    return sexpr(word2).indexOf(sexpr(word1)) !== -1 ? 1 : 0;
  });

  //
  // 2.5 Queries
  //

  def("count", function(thing) {
    if (Type(thing) === 'array')
      return thing.length;
    return lexpr(thing).length;
  });
  def("ascii", function(chr) { return sexpr(chr).charCodeAt(0); });
  // Not Supported: rawascii
  def("char", function(integer) { return String.fromCharCode(aexpr(integer)); });

  def("member", function(thing, input) {
    var list = lexpr(input);
    var index = list.findIndex(function(x) { return equal(x, thing); });
    list = (index === -1) ? [] : list.slice(index);
    return sifw(input, list);
 });

  def("lowercase", function(word) { return sexpr(word).toLowerCase(); });
  def("uppercase", function(word) { return sexpr(word).toUpperCase(); });

  def("standout", function(word) {
    // Hack: Convert English alphanumerics to Mathematical Bold
    return sexpr(word)
      .split('')
      .map(function(c) {
        var u = c.charCodeAt(0);
        if ('A' <= c && c <= 'Z') {
          u = u - 0x41 + 0x1D400;
        } else if ('a' <= c && c <= 'z') {
          u = u - 0x61 + 0x1D41A;
        } else if ('0' <= c && c <= '9') {
          u = u - 0x30 + 0x1D7CE;
        } else {
          return c;
        }
        var lead = ((u - 0x10000) >> 10) + 0xD800;
        var trail = ((u - 0x10000) & 0x3FF) + 0xDC00;
        return String.fromCharCode(lead, trail);
      })
      .join('');
  });

  def("parse", function(word) {
    return parse('[' + sexpr(word) + ']')[0];
  });

  def("runparse", function(word) {
    return parse(sexpr(word));
  });

  //----------------------------------------------------------------------
  //
  // 3. Communication
  //
  //----------------------------------------------------------------------

  // 3.1 Transmitters

  def(["print", "pr"], function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join(" ");
    this.stream.write(s, "\n");
  }, {minimum: 0, maximum: -1});
  def("type", function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join("");
    this.stream.write(s);
  }, {minimum: 0, maximum: -1});
  def("show", function(thing) {
    var s = Array.from(arguments).map(stringify).join(" ");
    this.stream.write(s, "\n");
  }, {minimum: 0, maximum: -1});

  // 3.2 Receivers

  def("readlist", function() {
    return (
      (arguments.length > 0)
        ? stream.read(stringify_nodecorate(arguments[0]))
        : stream.read()
    ).then(function(word) {
      return parse('[' + word + ']')[0];
    });
  }, {maximum: 1});

  def("readword", function() {
    if (arguments.length > 0)
      return stream.read(stringify_nodecorate(arguments[0]));
    else
      return stream.read();
  }, {maximum: 1});


  // Not Supported: readrawline
  // Not Supported: readchar
  // Not Supported: readchars
  // Not Supported: shell

  // 3.3 File Access

  // Not Supported: setprefix
  // Not Supported: prefix
  // Not Supported: openread
  // Not Supported: openwrite
  // Not Supported: openappend
  // Not Supported: openupdate
  // Not Supported: close
  // Not Supported: allopen
  // Not Supported: closeall
  // Not Supported: erasefile
  // Not Supported: dribble
  // Not Supported: nodribble
  // Not Supported: setread
  // Not Supported: setwrite
  // Not Supported: reader
  // Not Supported: writer
  // Not Supported: setreadpos
  // Not Supported: setwritepos
  // Not Supported: readpos
  // Not Supported: writepos
  // Not Supported: eofp
  // Not Supported: filep

  // 3.4 Terminal Access

  // Not Supported: keyp

  def(["cleartext", "ct"], function() {
    this.stream.clear();
  });

  // Not Supported: setcursor
  // Not Supported: cursor
  // Not Supported: setmargins

  def('settextcolor', function(color) {
    this.stream.color = parseColor(color);
  });

  def('textcolor', function() {
    return this.stream.color;
  });

  def('increasefont', function() {
    this.stream.textsize = Math.round(this.stream.textsize * 1.25);
  });

  def('decreasefont', function() {
    this.stream.textsize = Math.round(this.stream.textsize / 1.25);
  });

  def('settextsize', function(size) {
    this.stream.textsize = aexpr(size);
  });

  def('textsize', function() {
    return this.stream.textsize;
  });

  def('setfont', function(size) {
    this.stream.font = sexpr(size);
  });

  def('font', function() {
    return this.stream.font;
  });


  //----------------------------------------------------------------------
  //
  // 4. Arithmetic
  //
  //----------------------------------------------------------------------
  // 4.1 Numeric Operations


  def("sum", function(a, b) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a + b; }, 0);
  }, {minimum: 0, maximum: -1});

  def("difference", function(a, b) {
    return aexpr(a) - aexpr(b);
  });

  def("minus", function(a) { return -aexpr(a); });

  def("product", function(a, b) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a * b; }, 1);
  }, {minimum: 0, maximum: -1});

  def("quotient", function(a, b) {
    if (b !== undefined)
      return aexpr(a) / aexpr(b);
    else
      return 1 / aexpr(a);
  }, {minimum: 1});

  def("remainder", function(num1, num2) {
    return aexpr(num1) % aexpr(num2);
  });
  def("modulo", function(num1, num2) {
    num1 = aexpr(num1);
    num2 = aexpr(num2);
    return Math.abs(num1 % num2) * (num2 < 0 ? -1 : 1);
  });

  def("power", function(a, b) { return Math.pow(aexpr(a), aexpr(b)); });
  def("sqrt", function(a) { return Math.sqrt(aexpr(a)); });
  def("exp", function(a) { return Math.exp(aexpr(a)); });
  def("log10", function(a) { return Math.log(aexpr(a)) / Math.LN10; });
  def("ln", function(a) { return Math.log(aexpr(a)); });


  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  def("arctan", function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return rad2deg(Math.atan2(y, x));
    } else {
      return rad2deg(Math.atan(aexpr(a)));
    }
  }, {maximum: 2});

  def("sin", function(a) { return Math.sin(deg2rad(aexpr(a))); });
  def("cos", function(a) { return Math.cos(deg2rad(aexpr(a))); });
  def("tan", function(a) { return Math.tan(deg2rad(aexpr(a))); });

  def("radarctan", function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return Math.atan2(y, x);
    } else {
      return Math.atan(aexpr(a));
    }
  }, {maximum: 2});

  def("radsin", function(a) { return Math.sin(aexpr(a)); });
  def("radcos", function(a) { return Math.cos(aexpr(a)); });
  def("radtan", function(a) { return Math.tan(aexpr(a)); });

  def("abs", function(a) { return Math.abs(aexpr(a)); });


  function truncate(x) { return parseInt(x, 10); }

  def("int", function(a) { return truncate(aexpr(a)); });
  def("round", function(a) { return Math.round(aexpr(a)); });

  def("iseq", function(a, b) {
    a = truncate(aexpr(a));
    b = truncate(aexpr(b));
    var step = (a < b) ? 1 : -1;
    var list = [];
    for (var i = a; (step > 0) ? (i <= b) : (i >= b); i += step) {
      list.push(i);
    }
    return list;
  });


  def("rseq", function(from, to, count) {
    from = aexpr(from);
    to = aexpr(to);
    count = truncate(aexpr(count));
    var step = (to - from) / (count - 1);
    var list = [];
    for (var i = from; (step > 0) ? (i <= to) : (i >= to); i += step) {
      list.push(i);
    }
    return list;
  });

  // 4.2 Numeric Predicates

  def(["greaterp", "greater?"], function(a, b) { return aexpr(a) > aexpr(b) ? 1 : 0; });
  def(["greaterequalp", "greaterequal?"], function(a, b) { return aexpr(a) >= aexpr(b) ? 1 : 0; });
  def(["lessp", "less?"], function(a, b) { return aexpr(a) < aexpr(b) ? 1 : 0; });
  def(["lessequalp", "lessequal?"], function(a, b) { return aexpr(a) <= aexpr(b) ? 1 : 0; });

  // 4.3 Random Numbers

  def("random", function(max) {
    if (arguments.length < 2) {
      max = aexpr(max);
      return Math.floor(this.prng.next() * max);
    } else {
      var start = aexpr(arguments[0]);
      var end = aexpr(arguments[1]);
      return Math.floor(this.prng.next() * (end - start + 1)) + start;
    }
  }, {maximum: 2});

  def("rerandom", function() {
    var seed = (arguments.length > 0) ? aexpr(arguments[0]) : 2345678901;
    return this.prng.seed(seed);
  }, {maximum: 1});

  // 4.4 Print Formatting

  def("form", function(num, width, precision) {
    num = aexpr(num);
    width = aexpr(width);
    precision = aexpr(precision);

    var str = num.toFixed(precision);
    if (str.length < width)
      str = Array(1 + width - str.length).join(' ') + str;
    return str;
  });

  // 4.5 Bitwise Operations


  def("bitand", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a & b; }, -1);
  }, {minimum: 0, maximum: -1});
  def("bitor", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a | b; }, 0);
  }, {minimum: 0, maximum: -1});
  def("bitxor", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a ^ b; }, 0);
  }, {minimum: 0, maximum: -1});
  def("bitnot", function(num) {
    return ~aexpr(num);
  });


  def("ashift", function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >> -num2;
  });

  def("lshift", function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >>> -num2;
  });


  //----------------------------------------------------------------------
  //
  // 5. Logical Operations
  //
  //----------------------------------------------------------------------

  def("true", function() { return 1; });
  def("false", function() { return 0; });

  def("and", function(a, b) {
    var args = Array.from(arguments);
    return booleanReduce(args, function(value) {return value;}, 1);
  }, {noeval: true, minimum: 0, maximum: -1});

  def("or", function(a, b) {
    var args = Array.from(arguments);
    return booleanReduce(args, function(value) {return !value;}, 0);
  }, {noeval: true, minimum: 0, maximum: -1});

  function booleanReduce(args, test, value) {
    return promiseLoop(function(loop, resolve, reject) {
      if (!args.length) {
        resolve(value);
        return;
      }
      Promise.resolve(args.shift()())
        .then(function(result) {
          if (!test(result)) {
            resolve(result);
            return;
          }
          value = result;
          loop();
        });
    });
  }

  def("xor", function(a, b) {
    return Array.from(arguments).map(aexpr)
      .reduce(function(a, b) { return Boolean(a) !== Boolean(b); }, 0) ? 1 : 0;
  }, {minimum: 0, maximum: -1});

  def("not", function(a) {
    return !aexpr(a) ? 1 : 0;
  });

  //----------------------------------------------------------------------
  //
  // 6. Graphics
  //
  //----------------------------------------------------------------------
  // 6.1 Turtle Motion

  def(["forward", "fd"], function(a) { return turtle.move(aexpr(a)); });
  def(["back", "bk"], function(a) { return turtle.move(-aexpr(a)); });
  def(["left", "lt"], function(a) { return turtle.turn(-aexpr(a)); });
  def(["right", "rt"], function(a) { return turtle.turn(aexpr(a)); });

  // Left arrow:
  def(["\u2190"], function() { return turtle.turn(-15); });
  // Right arrow:
  def(["\u2192"], function() { return turtle.turn(15); });
  // Up arrow:
  def(["\u2191"], function() { return turtle.move(10); });
  // Down arrow:
  def(["\u2193"], function() { return turtle.move(-10); });


  def("setpos", function(l) {
    l = lexpr(l);
    if (l.length !== 2) throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);
    turtle.position = [aexpr(l[0]), aexpr(l[1])];
  });
  def("setxy", function(x, y) { turtle.position = [aexpr(x), aexpr(y)]; });
  def("setx", function(x) { turtle.position = [aexpr(x), undefined]; });
  def("sety", function(y) { turtle.position = [undefined, aexpr(y)]; });
  def(["setheading", "seth"], function(a) { turtle.heading = aexpr(a); });

  def("home", function() { return turtle.home(); });

  def("arc", function(angle, radius) { return turtle.arc(aexpr(angle), aexpr(radius)); });

  //
  // 6.2 Turtle Motion Queries
  //

  def("pos", function() { return turtle.position; });
  def("xcor", function() { return turtle.position[0]; });
  def("ycor", function() { return turtle.position[1]; });
  def("heading", function() { return turtle.heading; });
  def("towards", function(l) {
    l = lexpr(l);
    if (l.length !== 2) throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);
    return turtle.towards(aexpr(l[0]), aexpr(l[1]));
  });
  def("scrunch", function() { return turtle.scrunch; });

  //
  // 6.3 Turtle and Window Control
  //

  def(["showturtle", "st"], function() { turtle.visible = true; });
  def(["hideturtle", "ht"], function() { turtle.visible = false; });
  def("clean", function() { turtle.clear(); });
  def(["clearscreen", "cs"], function() { turtle.clearscreen(); });

  def("wrap", function() { turtle.turtlemode = 'wrap'; });
  def("window", function() { turtle.turtlemode = 'window'; });
  def("fence", function() { turtle.turtlemode = 'fence'; });

  def("fill", function() { turtle.fill(); });

  def("filled", function(fillcolor, statements) {
    fillcolor = sexpr(fillcolor);
    statements = reparse(lexpr(statements));
    turtle.beginpath();
    return promiseFinally(
      this.execute(statements),
      function() {
        turtle.fillpath(fillcolor);
      });
  });

  def("label", function(a) {
    var s = Array.from(arguments).map(stringify_nodecorate).join(" ");
    return turtle.drawtext(s);
  }, {maximum: -1});

  def("setlabelheight", function(a) { turtle.fontsize = aexpr(a); });

  def("setlabelfont", function(a) { turtle.fontname = sexpr(a); });

  // Not Supported: textscreen
  // Not Supported: fullscreen
  // Not Supported: splitscreen

  def("setscrunch", function(sx, sy) {
    sx = aexpr(sx);
    sy = aexpr(sy);
    if (!isFinite(sx) || sx === 0 || !isFinite(sy) || sy === 0)
      throw err("{_PROC_}: Expected non-zero values", ERRORS.BAD_INPUT);
    turtle.scrunch = [sx, sy];
  });

  // Not Supported: refresh
  // Not Supported: norefresh

  //
  // 6.4 Turtle and Window Queries
  //

  def(["shownp", "shown?"], function() {
    return turtle.visible ? 1 : 0;
  });

  // Not Supported: screenmode

  def("turtlemode", function() {
    return turtle.turtlemode.toUpperCase();
  });

  def("labelsize", function() {
    return [turtle.fontsize, turtle.fontsize];
  });

  def("labelfont", function() {
    return turtle.fontname;
  });

  //
  // 6.5 Pen and Background Control
  //
  def(["pendown", "pd"], function() { turtle.pendown = true; });
  def(["penup", "pu"], function() { turtle.pendown = false; });

  def(["penpaint", "ppt"], function() { turtle.penmode = 'paint'; });
  def(["penerase", "pe"], function() { turtle.penmode = 'erase'; });
  def(["penreverse", "px"], function() { turtle.penmode = 'reverse'; });

  // To handle additional color names (localizations, etc):
  // logo.colorAlias = function(name) {
  //   return {internationalorange: '#FF4F00', ... }[name];
  // };
  this.colorAlias = null;

  var PALETTE = {
    0: "black", 1: "blue", 2: "lime", 3: "cyan",
    4: "red", 5: "magenta", 6: "yellow", 7: "white",
    8: "brown", 9: "tan", 10: "green", 11: "aquamarine",
    12: "salmon", 13: "purple", 14: "orange", 15: "gray"
  };

  function parseColor(color) {
    function adjust(n) {
      // Clamp into 0...99
      n = Math.min(99, Math.max(0, Math.floor(n)));
      // Scale to 0...255
      return Math.floor(n * 255 / 99);
    }
    if (Type(color) === 'list') {
      var r = adjust(aexpr(color[0]));
      var g = adjust(aexpr(color[1]));
      var b = adjust(aexpr(color[2]));
      var rr = (r < 16 ? "0" : "") + r.toString(16);
      var gg = (g < 16 ? "0" : "") + g.toString(16);
      var bb = (b < 16 ? "0" : "") + b.toString(16);
      return '#' + rr + gg + bb;
    }
    color = sexpr(color);
    if (PALETTE.hasOwnProperty(color))
      return PALETTE[color];
    if (self.colorAlias)
      return self.colorAlias(color) || color;
    return color;
  }

  def(["setpencolor", "setpc", "setcolor"], function(color) {
    turtle.color = parseColor(color);
  });

  def("setpalette", function(colornumber, color) {
    colornumber = aexpr(colornumber);
    if (colornumber < 8)
      throw err("{_PROC_}: Expected number greater than 8", ERRORS.BAD_INPUT);
    PALETTE[colornumber] = parseColor(color);
  });

  def(["setpensize", "setwidth", "setpw"], function(a) {
    if (Type(a) === 'list')
      turtle.penwidth = aexpr(a[0]);
    else
      turtle.penwidth = aexpr(a);
  });

  // Not Supported: setpenpattern
  // Not Supported: setpen

  def(["setbackground", "setbg", "setscreencolor", "setsc"], function(color) {
    turtle.bgcolor = parseColor(color);
  });

  //
  // 6.6 Pen Queries
  //

  def(["pendownp", "pendown?"], function() {
    return turtle.pendown ? 1 : 0;
  });

  def("penmode", function() {
    return turtle.penmode.toUpperCase();
  });

  def(["pencolor", "pc"], function() {
    return turtle.color;
  });

  def("palette", function(colornumber) {
    return PALETTE[aexpr(colornumber)];
  });

  def("pensize", function() {
    return [turtle.penwidth, turtle.penwidth];
  });

  // Not Supported: pen

  def(["background", "bg", "getscreencolor", "getsc"], function() {
    return turtle.bgcolor;
  });

  // 6.7 Saving and Loading Pictures

  // Not Supported: savepict
  // Not Supported: loadpict
  // Not Supported: epspict

  // 6.8 Mouse Queries

  def("mousepos", function() {
    return turtle.mousepos;
  });

  def("clickpos", function() {
    return turtle.clickpos;
  });

  def(["buttonp", "button?"], function() {
    return turtle.button > 0 ? 1 : 0;
  });

  def("button", function() {
    return turtle.button;
  });

  //----------------------------------------------------------------------
  //
  // 7. Workspace Management
  //
  //----------------------------------------------------------------------
  // 7.1 Procedure Definition

  def("define", function(name, list) {
    name = sexpr(name);
    list = lexpr(list);
    if (list.length != 2)
      throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);

    var inputs = [];
    var optional_inputs = [];
    var rest = undefined;
    var def = undefined;
    var block = reparse(lexpr(list[1]));

    var ins = lexpr(list[0]);
    var REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, ERROR = 4;
    var state = REQUIRED;
    while (ins.length) {
      var atom = ins.shift();
      if (state === REQUIRED) {
        if (Type(atom) === 'word') {
          inputs.push(atom);
          continue;
        }
        state = OPTIONAL;
      }

      if (state === OPTIONAL) {
        if (Type(atom) === 'list' && atom.length > 1 && Type(atom[0]) === 'word') {
          optional_inputs.push([atom.shift(), atom]);
          continue;
        }
        state = REST;
      }

      if (state === REST) {
        state = DEFAULT;
        if (Type(atom) === 'list' && atom.length === 1 && Type(atom[0]) === 'word') {
          rest = atom[0];
          continue;
        }
      }

      if (state === DEFAULT) {
        state = ERROR;
        if (Type(atom) === 'word' && isNumber(atom)) {
          def = parseFloat(atom);
          continue;
        }
      }

      throw err("{_PROC_}: Unexpected inputs", ERRORS.BAD_INPUT);
    }

    defineProc(name, inputs, optional_inputs, rest, def, block);
  });

  def("text", function(name) {
    var proc = this.routines.get(sexpr(name));
    if (!proc)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (!proc.inputs) {
      throw err("{_PROC_}: Can't show definition of primitive {name:U}", { name: name },
               ERRORS.IS_PRIMITIVE);
    }

    var inputs = proc.inputs.concat(proc.optional_inputs);
    if (proc.rest)
      inputs.push([proc.rest]);
    if (proc.def !== undefined)
      inputs.push(proc.def);
    return [inputs, proc.block];
  });

  // Not Supported: fulltext

  def("copydef", function(newname, oldname) {

    newname = sexpr(newname);
    oldname = sexpr(oldname);

    if (!this.routines.has(oldname)) {
      throw err("{_PROC_}: Don't know how to {name:U}", { name: oldname }, ERRORS.BAD_PROC);
    }

    if (this.routines.has(newname)) {
      if (this.routines.get(newname).special) {
        throw err("{_PROC_}: Can't overwrite special {name:U}", { name: newname },
                  ERRORS.BAD_INPUT);
      }
      if (this.routines.get(newname).primitive && !maybegetvar("redefp")) {
        throw err("{_PROC_}: Can't overwrite primitives unless REDEFP is TRUE",
                 ERRORS.BAD_INPUT);
      }
    }

    this.routines.set(newname, this.routines.get(oldname));
    if (savehook) {
      // TODO: This is broken if copying a built-in, so disable for now
      //savehook(newname, this.definition(newname, this.routines.get(newname)));
    }
  });


  // 7.2 Variable Definition

  def("make", function(varname, value) {
    setvar(sexpr(varname), value);
  });

  def("name", function(value, varname) {
    setvar(sexpr(varname), value);
  });

  def("local", function(varname) {
    Array.from(arguments).forEach(function(name) { local(sexpr(name)); });
  }, {maximum: -1});

  def("localmake", function(varname, value) {
    setlocal(sexpr(varname), value);
  });

  def("thing", function(varname) {
    return getvar(sexpr(varname));
  });

  def("global", function(varname) {
    var globalscope = this.scopes[0];
    Array.from(arguments).forEach(function(name) {
      globalscope.set(sexpr(name), {value: undefined}); });
  }, {maximum: -1});

  //
  // 7.3 Property Lists
  //

  def("pprop", function(plistname, propname, value) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = this.plists.get(plistname);
    if (!plist) {
      plist = new StringMap(true);
      this.plists.set(plistname, plist);
    }
    plist.set(propname, value);
  });

  def("gprop", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = this.plists.get(plistname);
    if (!plist || !plist.has(propname))
      return [];
    return plist.get(propname);
  });

  def("remprop", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = this.plists.get(plistname);
    if (plist) {
      plist['delete'](propname);
      if (plist.empty()) {
        // TODO: Do this? Loses state, e.g. unburies if buried
        this.plists['delete'](plistname);
      }
    }
  });

  def("plist", function(plistname) {
    plistname = sexpr(plistname);
    var plist = this.plists.get(plistname);
    if (!plist)
      return [];

    var result = [];
    plist.forEach(function(key, value) {
      result.push(key);
      result.push(copy(value));
    });
    return result;
  });

  //
  // 7.4 Workspace Predicates
  //

  def(["procedurep", "procedure?"], function(name) {
    name = sexpr(name);
    return this.routines.has(name) ? 1 : 0;
  });

  def(["primitivep", "primitive?"], function(name) {
    name = sexpr(name);
    return (this.routines.has(name) &&
            this.routines.get(name).primitive) ? 1 : 0;
  });

  def(["definedp", "defined?"], function(name) {
    name = sexpr(name);
    return (this.routines.has(name) &&
            !this.routines.get(name).primitive) ? 1 : 0;
  });

  def(["namep", "name?"], function(varname) {
    try {
      return getvar(sexpr(varname)) !== undefined ? 1 : 0;
    } catch (e) {
      return 0;
    }
  });

  def(["plistp", "plist?"], function(plistname) {
    plistname = sexpr(plistname);
    return this.plists.has(plistname) ? 1 : 0;
  });

  //
  // 7.5 Workspace Queries
  //

  def("contents", function() {
    return [
      this.routines.keys().filter(function(x) {
        return !this.routines.get(x).primitive && !this.routines.get(x).buried;
      }.bind(this)),
      this.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return !scope.get(x).buried; })); },
        []),
      this.plists.keys().filter(function(x) {
        return !this.plists.get(x).buried;
      }.bind(this))
    ];
  });

  def("buried", function() {
    return [
      this.routines.keys().filter(function(x) {
        return !this.routines.get(x).primitive && this.routines.get(x).buried; }.bind(this)),
      this.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).buried; })); },
        []),
      this.plists.keys().filter(function(x) { return this.plists.get(x).buried; }.bind(this))
    ];
  });

  def("traced", function() {
    return [
      this.routines.keys().filter(function(x) {
        return !this.routines.get(x).primitive && this.routines.get(x).traced; }.bind(this)),
      this.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).traced; })); },
        []),
      this.plists.keys().filter(function(x) { return this.plists.get(x).traced; }.bind(this))
    ];
  });

  def(["stepped"], function() {
    return [
      this.routines.keys().filter(function(x) {
        return !this.routines.get(x).primitive && this.routines.get(x).stepped; }.bind(this)),
      this.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).stepped; })); },
        []),
      this.plists.keys().filter(function(x) { return this.plists.get(x).stepped; }.bind(this))
    ];
  });

  def("procedures", function() {
    return this.routines.keys().filter(function(x) {
      return !this.routines.get(x).primitive && !this.routines.get(x).buried;
    }.bind(this));
  });

  def("primitives", function() {
    return this.routines.keys().filter(function(x) {
      return this.routines.get(x).primitive & !this.routines.get(x).buried;
    }.bind(this));
  });

  def("globals", function() {
    var globalscope = this.scopes[0];
    return globalscope.keys().filter(function(x) {
      return !globalscope.get(x).buried;
    });
  });

  def("names", function() {
    return [
      [],
      this.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) {
          return !scope.get(x).buried; })); }, [])
    ];
  });

  def("plists", function() {
    return [
      [],
      [],
      this.plists.keys().filter(function(x) {
        return !this.plists.get(x).buried;
      }.bind(this))
    ];
  });

  def("namelist", function(varname) {
    if (Type(varname) === 'list')
      varname = lexpr(varname);
    else
      varname = [sexpr(varname)];
    return [[], varname];
  });

  def("pllist", function(plname) {
    if (Type(plname) === 'list') {
      plname = lexpr(plname);
    } else {
      plname = [sexpr(plname)];
    }
    return [[], [], plname];
  });


  def("arity", function(name) {
    name = sexpr(name);
    var proc = this.routines.get(name);
    if (!proc)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (proc.special)
      return [-1, -1, -1];

    return [
      proc.minimum,
      proc.default,
      proc.maximum
    ];
  });

  // Not Supported: nodes

  // 7.6 Workspace Inspection

  //
  // 7.7 Workspace Control
  //

  def("erase", function(list) {
    list = lexpr(list);

    // Delete procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (this.routines.has(name)) {
          if (this.routines.get(name).special)
            throw err("Can't {_PROC_} special {name:U}", { name: name }, ERRORS.BAD_INPUT);
          if (!this.routines.get(name).primitive || maybegetvar("redefp")) {
            this.routines['delete'](name);
            if (savehook) savehook(name);
          } else {
            throw err("Can't {_PROC_} primitives unless REDEFP is TRUE", ERRORS.BAD_INPUT);
          }
        }
      }.bind(this));
    }

    // Delete variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          scope['delete'](name);
        });
      });
    }

    // Delete property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        this.plists['delete'](name);
      }.bind(this));
    }
  });

  // TODO: lots of redundant logic here -- clean this up
  def("erall", function() {
    this.routines.keys().filter(function(x) {
      return !this.routines.get(x).primitive && !this.routines.get(x).buried;
    }.bind(this)).forEach(function(name) {
      this.routines['delete'](name);
      if (savehook) savehook(name);
    }.bind(this));

    this.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });

    this.plists.keys().filter(function(x) {
      return !this.plists.get(x).buried;
    }.bind(this)).forEach(function(name) {
      this.plists['delete'](name);
    }.bind(this));
  });

  def("erps", function() {
    this.routines.keys().filter(function(x) {
      return !this.routines.get(x).primitive && !this.routines.get(x).buried;
    }.bind(this)).forEach(function(name) {
      this.routines['delete'](name);
      if (savehook) savehook(name);
    }.bind(this));
  });

  def("erns", function() {
    this.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });
  });

  def("erpls", function() {
    this.plists.keys().filter(function(x) {
      return !this.plists.get(x).buried;
    }.bind(this)).forEach(function(key) {
      this.plists['delete'](key);
    }.bind(this));
  });

  def("ern", function(varname) {
    var varnamelist;
    if (Type(varname) === 'list')
      varnamelist = lexpr(varname);
    else
      varnamelist = [sexpr(varname)];

    this.scopes.forEach(function(scope) {
      varnamelist.forEach(function(name) {
        name = sexpr(name);
        scope['delete'](name);
      });
    });
  });

  def("erpl", function(plname) {
    var plnamelist;
    if (Type(plname) === 'list') {
      plnamelist = lexpr(plname);
    } else {
      plnamelist = [sexpr(plname)];
    }

    plnamelist.forEach(function(name) {
      name = sexpr(name);
      this.plists['delete'](name);
    }.bind(this));
  });

  def("bury", function(list) {
    list = lexpr(list);

    // Bury procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (this.routines.has(name))
          this.routines.get(name).buried = true;
      }.bind(this));
    }

    // Bury variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name))
            scope.get(name).buried = true;
        });
      });
    }

    // Bury property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (this.plists.has(name))
          this.plists.get(name).buried = true;
      }.bind(this));
    }
  });

  def("buryall", function() {
    this.routines.forEach(function(name, proc) {
      proc.buried = true;
    });

    this.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = true;
      });
    });

    this.plists.forEach(function(name, entry) {
      entry.buried = true;
    });
  });

  def("buryname", function(varname) {
    var bury = this.routines.get('bury');
    var namelist = this.routines.get('namelist');
    return bury.call(this, namelist.call(this, varname));
  });

  def("unbury", function(list) {
    list = lexpr(list);

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (this.routines.has(name))
          this.routines.get(name).buried = false;
      }.bind(this));
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name))
            scope.get(name).buried = false;
        });
      });
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (this.plists.has(name))
          this.plists.get(name).buried = false;
      }.bind(this));
    }
  });

  def("unburyall", function() {
    this.routines.forEach(function(name, proc) {
      proc.buried = false;
    });

    this.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = false;
      });
    });

    this.plists.forEach(function(name, entry) {
      entry.buried = false;
    });
  });

  def("unburyname", function(varname) {
    var unbury = this.routines.get('unbury');
    var namelist = this.routines.get('namelist');
    return unbury.call(this, namelist.call(this, varname));
  });

  def(["buriedp", "buried?"], function(list) {
    list = lexpr(list);
    var name;

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      if (procs.length) {
        name = sexpr(procs[0]);
        return (this.routines.has(name) && this.routines.get(name).buried) ? 1 : 0;
      }
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      if (vars.length) {
        name = sexpr(vars[0]);
        // TODO: global only?
        return (this.scopes[0].has(name) && this.scopes[0].get(name).buried) ? 1 : 0;
      }
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      if (plists.length) {
        name = sexpr(plists[0]);
        return (this.plists.has(name) && this.plists.get(name).buried) ? 1 : 0;
      }
    }

    return 0;
  });

  //----------------------------------------------------------------------
  //
  // 8. Control Structures
  //
  //----------------------------------------------------------------------

  //
  // 8.1 Control
  //

  def("run", function(statements) {
    statements = reparse(lexpr(statements));
    return this.execute(statements, {returnResult: true});
  });

  def("runresult", function(statements) {
    statements = reparse(lexpr(statements));
    return this.execute(statements, {returnResult: true})
      .then(function(result) {
        if (result !== undefined)
          return [result];
        else
          return [];
      });
  });

  def("repeat", function(count, statements) {
    count = aexpr(count);
    statements = reparse(lexpr(statements));
    var old_repcount = this.repcount;
    var i = 1;
    return promiseFinally(
      promiseLoop(function(loop, resolve, reject) {
        if (i > count) {
          resolve();
          return;
        }
        this.repcount = i++;
        this.execute(statements)
          .then(promiseYield)
          .then(loop, reject);
      }.bind(this)), function() {
        this.repcount = old_repcount;
      }.bind(this));
  });

  def("forever", function(statements) {
    statements = reparse(lexpr(statements));
    var old_repcount = this.repcount;
    var i = 1;
    return promiseFinally(
      promiseLoop(function(loop, resolve, reject) {
        this.repcount = i++;
        this.execute(statements)
          .then(promiseYield)
          .then(loop, reject);
      }.bind(this)), function() {
        this.repcount = old_repcount;
      }.bind(this));
  });

  def(["repcount", "#"], function() {
    return this.repcount;
  });

  def("if", function(tf, statements) {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    var statements2 = arguments[2];

    return Promise.resolve(tf)
      .then(function(tf) {
        tf = aexpr(tf);
        statements = reparse(lexpr(statements));
        if (!statements2) {
          return tf ? this.execute(statements, {returnResult: true}) : undefined;
        } else {
          statements2 = reparse(lexpr(statements2));
          return this.execute(tf ? statements : statements2, {returnResult: true});
        }
      }.bind(this));

  }, {maximum: 3});

  def("ifelse", function(tf, statements1, statements2) {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    return Promise.resolve(tf)
      .then(function(tf) {
        tf = aexpr(tf);
        statements1 = reparse(lexpr(statements1));
        statements2 = reparse(lexpr(statements2));

        return this.execute(tf ? statements1 : statements2, {returnResult: true});
      }.bind(this));
  });

  def("test", function(tf) {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    return Promise.resolve(tf)
      .then(function(tf) {
        tf = aexpr(tf);
        // NOTE: A property on the scope, not within the scope
        this.scopes[this.scopes.length - 1]._test = tf;
      }.bind(this));
  });

  def(["iftrue", "ift"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = this.scopes[this.scopes.length - 1]._test;
    if (tf === undefined)
      throw err('{_PROC_}: Called without TEST', ERRORS.NO_TEST);
    return tf ? this.execute(statements, {returnResult: true}) : undefined;
  });

  def(["iffalse", "iff"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = this.scopes[this.scopes.length - 1]._test;
    if (tf === undefined)
      throw err('{_PROC_}: Called without TEST', ERRORS.NO_TEST);
    return !tf ? this.execute(statements, {returnResult: true}) : undefined;
  });

  def("stop", function() {
    throw new Output();
  });

  def(["output", "op"], function(atom) {
    throw new Output(atom);
  });

  this.last_error = undefined;

  def("catch", function(tag, instructionlist) {
    tag = sexpr(tag).toUpperCase();;
    instructionlist = reparse(lexpr(instructionlist));
    return this.execute(instructionlist, {returnResult: true})
      .catch(function(error) {
        if (!(error instanceof LogoError) || error.tag !== tag)
          throw error;
        this.last_error = error;
        return error.value;
      }.bind(this));
  }, {maximum: 2});

  def("throw", function(tag) {
    tag = sexpr(tag).toUpperCase();
    var value = arguments[1];
    var error = new LogoError(tag, value);
    error.code = (arguments.length > 1) ? ERRORS.USER_GENERATED : ERRORS.THROW_ERROR;
    throw error;
  }, {maximum: 2});

  def("error", function() {
    if (!this.last_error)
      return [];

    var list = [
      this.last_error.code,
      this.last_error.message,
      this.last_error.proc,
      this.last_error.line
    ];
    this.last_error = undefined;
    return list;
  });

  // Not Supported: pause
  // Not Supported: continue

  def("wait", function(time) {
    return new Promise(function(resolve) {
      setTimeout(resolve, aexpr(time) / 60 * 1000);
    });
  });

  def("bye", function() {
    throw new Bye;
  });

  def(".maybeoutput", function(value) {
    throw new Output(value);
  });

  // Not Supported: goto
  // Not Supported: tag

  def("ignore", function(value) {
  });

  def("`", function(list) {
    list = lexpr(list);
    var out = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(out);
        return;
      }
      var member = list.shift(), instructionlist;

      // TODO: Nested backquotes: "Substitution is done only for
      // commas at the same depth as the backquote in which they are
      // found."
      if (member === ',' && list.length) {
        member = list.shift();
        if (Type(member) === 'word')
          member = [member];
        instructionlist = reparse(member);
        this.execute(instructionlist, {returnResult: true})
          .then(function(result) {
            out.push(result);
            loop();
          }).catch(reject);
      } else if (member === ',@' && list.length) {
        member = list.shift();
        if (Type(member) === 'word')
          member = [member];
        instructionlist = reparse(member);
        this.execute(instructionlist, {returnResult: true})
          .then(function(result) {
            out = out.concat(result);
            loop();
          }).catch(reject);
      } else if (Type(member) === 'word' && /^",/.test(member)) {
        instructionlist = reparse(member.substring(2));
        this.execute(instructionlist, {returnResult: true})
          .then(function(result) {
            out.push('"' + (Type(result) === 'list' ? result[0] : result));
            loop();
          }).catch(reject);
      } else if (Type(member) === 'word' && /^:,/.test(member)) {
        instructionlist = reparse(member.substring(2));
        this.execute(instructionlist, {returnResult: true})
          .then(function(result) {
            out.push(':' + (Type(result) === 'list' ? result[0] : result));
            loop();
          }).catch(reject);
      } else {
        out.push(member);
        loop();
      }
    }.bind(this));
  });

  def("for", function(control, statements) {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    function sign(x) { return x < 0 ? -1 : x > 0 ? 1 : 0; }

    var varname = sexpr(control.shift());
    var start, limit, step, current;

    return Promise.resolve(evaluateExpression(control))
      .then(function(r) {
        current = start = aexpr(r);
        return evaluateExpression(control);
      })
      .then(function(r) {
        limit = aexpr(r);
        return control.length ?
          evaluateExpression(control) : (limit < start ? -1 : 1);
      })
      .then(function(r) {
        step = aexpr(r);
      })
      .then(function() {
        return promiseLoop(function(loop, resolve, reject) {
          if (sign(current - limit) === sign(step)) {
            resolve();
            return;
          }
          setlocal(varname, current);
          this.execute(statements)
            .then(function() {
              current += step;
            })
            .then(promiseYield)
            .then(loop, reject);
        }.bind(this));
      }.bind(this));
  });

  def("dotimes", function(control, statements) {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    var varname = sexpr(control.shift());
    var times, current = 1;

    return Promise.resolve(evaluateExpression(control))
      .then(function(r) {
        times = aexpr(r);
      })
      .then(function() {
        return promiseLoop(function(loop, resolve, reject) {
          if (current > times) {
            resolve();
            return;
          }
          setlocal(varname, current);
          this.execute(statements)
            .then(function() {
              ++current;
            })
            .then(promiseYield)
            .then(loop, reject);
        }.bind(this));
      }.bind(this));
  });

  function checkevalblock(block) {
    block = block();
    if (Type(block) === 'list') { return block; }
    throw err("{_PROC_}: Expected block", ERRORS.BAD_INPUT);
  }

  def("do.while", function(block, tfexpression) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      this.execute(block)
        .then(tfexpression)
        .then(function(tf) {
          if (Type(tf) === 'list')
            tf = evaluateExpression(reparse(tf));
          return tf;
        })
        .then(function(tf) {
          if (!tf) {
            resolve();
            return;
          }
          promiseYield().then(loop);
        }, reject);
    }.bind(this));
  }, {noeval: true});

  def("while", function(tfexpression, block) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      Promise.resolve(tfexpression())
        .then(function(tf) {
          if (Type(tf) === 'list')
            tf = evaluateExpression(reparse(tf));
          return tf;
        })
        .then(function(tf) {
          if (!tf) {
            resolve();
            return;
          }
          this.execute(block)
            .then(promiseYield)
            .then(loop);
        }.bind(this), reject);
    }.bind(this));
  }, {noeval: true});

  def("do.until", function(block, tfexpression) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      this.execute(block)
        .then(tfexpression)
        .then(function(tf) {
          if (Type(tf) === 'list')
            tf = evaluateExpression(reparse(tf));
          return tf;
        })
        .then(function(tf) {
          if (tf) {
            resolve();
            return;
          }
          promiseYield().then(loop);
        }, reject);
    }.bind(this));
  }, {noeval: true});

  def("until", function(tfexpression, block) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      Promise.resolve(tfexpression())
        .then(function(tf) {
          if (Type(tf) === 'list')
            tf = evaluateExpression(reparse(tf));
          return tf;
        })
        .then(function(tf) {
          if (tf) {
            resolve();
            return;
          }
          this.execute(block)
            .then(promiseYield)
            .then(loop);
        }.bind(this), reject);
    }.bind(this));
  }, {noeval: true});

  def("case", function(value, clauses) {
    clauses = lexpr(clauses);

    for (var i = 0; i < clauses.length; ++i) {
      var clause = lexpr(clauses[i]);
      var first = clause.shift();
      if (isKeyword(first, 'ELSE'))
        return evaluateExpression(clause);
      if (lexpr(first).some(function(x) { return equal(x, value); }))
        return evaluateExpression(clause);
    }
    return undefined;
  });

  def("cond", function(clauses) {
    clauses = lexpr(clauses);
    return promiseLoop(function(loop, resolve, reject) {
      if (!clauses.length) {
        resolve();
        return;
      }
      var clause = lexpr(clauses.shift());
      var first = clause.shift();
      if (isKeyword(first, 'ELSE')) {
        resolve(evaluateExpression(clause));
        return;
      }
      evaluateExpression(reparse(lexpr(first)))
        .then(function(result) {
          if (result) {
            resolve(evaluateExpression(clause));
            return;
          }
          loop();
        }, reject);
    });
  });

  //
  // 8.2 Template-based Iteration
  //


  //
  // Higher order functions
  //

  // TODO: multiple inputs

  def("apply", function(procname, list) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    return routine.apply(this, lexpr(list));
  });

  def("invoke", function(procname, input1) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    var args = [];
    for (var i = 1; i < arguments.length; ++i)
      args.push(arguments[i]);

    return routine.apply(this, args);
  }, {minimum: 1, maximum: -1});

  def("foreach", function(procname, list) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);
    list = lexpr(list);
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve();
        return;
      }
      Promise.resolve(routine(list.shift()))
        .then(loop, reject);
    });
  });


  def("map", function(procname, list/*,  ... */) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    var lists = [].slice.call(arguments, 1).map(lexpr);
    if (!lists.length)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);

    var mapped = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!lists[0].length) {
        resolve(mapped);
        return;
      }

      var args = lists.map(function(l) {
        if (!l.length)
          throw err("{_PROC_}: Expected lists of equal length", ERRORS.BAD_INPUT);
        return l.shift();
      });

      Promise.resolve(routine.apply(this, args))
        .then(function(value) { mapped.push(value); })
        .then(loop, reject);
    }.bind(this));
  }, {maximum: -1});

  // Not Supported: map.se

  def("filter", function(procname, list) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    list = lexpr(list);
    var filtered = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(filtered);
        return;
      }
      var item = list.shift();
      Promise.resolve(routine(item))
        .then(function(value) { if (value) filtered.push(item); })
        .then(loop, reject);
    });
  });

  def("find", function(procname, list) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    list = lexpr(list);
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve([]);
        return;
      }
      var item = list.shift();
      Promise.resolve(routine(item))
        .then(function(value) {
          if (value) {
            resolve(item);
            return;
          }
          loop();
      }, reject);
    });
  });

  def("reduce", function(procname, list) {
    procname = sexpr(procname);
    list = lexpr(list);
    var value = arguments[2] !== undefined ? arguments[2] : list.shift();

    var procedure = this.routines.get(procname);
    if (!procedure)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (procedure.special || procedure.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(value);
        return;
      }
      Promise.resolve(procedure.call(this, value, list.shift()))
        .then(function(result) { value = result; })
        .then(loop, reject);
    }.bind(this));
  }, {maximum: 3});


  def("crossmap", function(procname, list/*,  ... */) {
    procname = sexpr(procname);

    var routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    var lists = [].slice.call(arguments, 1).map(lexpr);
    if (!lists.length)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);

    // Special case: if only one element is present, use as list of lists.
    if (lists.length === 1)
      lists = lists[0].map(lexpr);

    var indexes = lists.map(function() { return 0; });
    var done = false;

    var mapped = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (done) {
        resolve(mapped);
        return;
      }

      var args = indexes.map(function(v, i) { return lists[i][v]; });

      var pos = indexes.length - 1;
      ++indexes[pos];
      while (indexes[pos] === lists[pos].length) {
        if (pos === 0) {
          done = true;
          break;
        }
        indexes[pos] = 0;
        pos--;
        ++indexes[pos];
      }

      Promise.resolve(routine.apply(this, args))
        .then(function(value) { mapped.push(value); })
        .then(loop, reject);
    }.bind(this));
  }, {maximum: -1});

  // Not Supported: cascade
  // Not Supported: cascade.2
  // Not Supported: transfer

  // Helper for testing that wraps a result in a Promise
  def(".promise", function(value) {
    return Promise.resolve(value);
  });
}
