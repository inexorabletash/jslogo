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

  var UNARY_MINUS = '<UNARYMINUS>'; // Must not match regexIdentifier

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, function(m, n, o) {
      switch (o) {
        case ':U': return String(params[n]).toUpperCase();
        case ':L': return String(params[n]).toLowerCase();
        default: return params[n];
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

  // Based on: https://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  // Argument is `$$func$$` to avoid issue if passed function is named `func`.
  function to_arity($$func$$, arity) {
    var parms = [];

    if ($$func$$.length === arity) {
      return $$func$$;
    }

    for (var i = 0; i < arity; i += 1) {
      parms.push('a' + i);
    }

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
    var map = new Map();
    Object.assign(this, {
      get: function(key) {
        key = case_fold ? String(key).toLowerCase() : String(key);
        return map.get(key);
      },
      set: function(key, value) {
        key = case_fold ? String(key).toLowerCase() : String(key);
        map.set(key, value);
      },
      has: function(key) {
        key = case_fold ? String(key).toLowerCase() : String(key);
        return map.has(key);
      },
      delete: function(key) {
        key = case_fold ? String(key).toLowerCase() : String(key);
        return map.delete(key);
      },
      keys: function() {
        var keys = [];
        map.forEach(function(value, key) { keys.push(key); });
        return keys;
      },
      empty: function() {
        return map.size === 0;
      },
      forEach: function(fn) {
        return map.forEach(function(value, key) {
          fn(key, value);
        });
      }
    });
  }

  function LogoArray(size, origin) {
    this.array = [];
    this.array.length = size;
    for (var i = 0; i < this.array.length; ++i)
      this.array[i] = '';
    this.origin = origin;
  }
  LogoArray.from = function(list, origin) {
    var array = new LogoArray(0, origin);
    array.array = Array.from(list);
    return array;
  };
  LogoArray.prototype = {
    item: function(i) {
      i = Number(i)|0;
      i -= this.origin;
      if (i < 0 || i >= this.array.length) {
        throw new Error(__("Index out of bounds"));
      }
      return this.array[i];
    },
    setItem: function(i, v) {
      i = Number(i)|0;
      i -= this.origin;
      if (i < 0 || i >= this.array.length) {
        throw new Error(__("Index out of bounds"));
      }
      this.array[i] = v;
    },
    list: function() {
      return this.array.slice();
    },
    count: function() {
      return this.array.length;
    }
  };

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
      throw new Error(__("No output from procedure"));
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

  // Note: U+2190 ... U+2193 are arrows
  var regexIdentifier = /^(\.?[A-Za-z\u00A1-\u1FFF][A-Za-z0-9_.\?\u00A1-\u1FFF]*|[\u2190-\u2193])/;
  var regexStringLiteral = /^(["'](?:[^ \[\]\(\)\{\}\\]|\\.)*)/m;
  var regexVariable = /^(:[A-Za-z\u00A1-\u1FFF][A-Za-z0-9_\u00A1-\u1FFF]*)/;
  var regexNumberLiteral = /^([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)/;
  var regexOperator = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>|\[|\]|\{|\}|\(|\))/;
  var regexInfix = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>)$/;

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

    // Handle escaping and filter out comments
    string = string.replace(/^((?:[^;\\\n]|\\.)*);.*$/mg, '$1');

    while (string !== undefined && string !== '') {
      var atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      var leading_space = /^\s+/.test(string);
      string = string.replace(/^\s+/, '');
      if (!string.length) break;

      if (string.match(regexIdentifier) ||
          string.match(regexStringLiteral) ||
          string.match(regexVariable) ||
          string.match(regexNumberLiteral)) {

        atom = RegExp.$1;
        string = string.substring(atom.length);
        atom = atom.replace(/\\(.)/mg, '$1');

      } else if (string.charAt(0) === '[') {
        r = parseList(string.substring(1));
        atom = r.list;
        string = r.string;

      } else if (string.charAt(0) === '{') {
        r = parseArray(string.substring(1));
        atom = r.array;
        string = r.string;

      } else if (string.match(regexOperator)) {
        atom = RegExp.$1;
        string = string.substring(atom.length);

        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by a
        // space and followed by a nonspace.

        if (atom === '-') {

          var trailing_space = /^\s+/.test(string);

          if (prev === undefined ||
              (Type(prev) === 'word' && regexInfix.test(prev)) ||
              (Type(prev) === 'word' && prev === '(') ||
              (leading_space && !trailing_space)
             ) {
               atom = UNARY_MINUS;
          }

        }
      } else {
        throw new Error(format(__("Couldn't parse: '{string}'"), { string: string }));
      }

      atoms.push(atom);
      prev = atom;
    }

    return atoms;
  }

  function isNumber(s) {
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)$/);
  }

  function isWS(c) {
    return c === ' ' || c === '\t' || c === '\r' || c === '\n';
  }

  function parseList(string) {
    var index = 0,
        list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = string.charAt(index++);
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = string.charAt(index++);
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c) {
        throw new Error(__("Expected ']'"));
      }
      if (isWS(c)) {
        continue;
      }
      if (c === ']') {
        return { list: list, string: string.substring(index) };
      }
      if (c === '[') {
        r = parseList(string.substring(index));
        list.push(r.list);
        string = r.string;
        index = 0;
        continue;
      }
      if (c === '{') {
        r = parseArray(string.substring(index));
        list.push(r.array);
        string = r.string;
        index = 0;
        continue;
      }
      throw new Error(format(__("Unexpected '{c}'"), {c: c}));
    }
  }

  function parseArray(string) {
    var index = 0,
        list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = string.charAt(index++);
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = string.charAt(index++);
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c) {
        throw new Error(__("Expected '}'"));
      }
      if (isWS(c)) {
        continue;
      }
      if (c === '}') {
        string = string.substring(index);
        var origin = 1;
        if (string.match(/^(\s*@\s*)(.*)$/)) {
          string = RegExp.$2;
          if (!string.match(/^(-?\d+)(.*)$/))
            throw new Error(__("Expected number after @"));
          origin = RegExp.$1;
          string = RegExp.$2;
        }
        return { array: LogoArray.from(list, origin), string: string };
      }
      if (c === '[') {
        r = parseList(string.substring(index));
        list.push(r.list);
        string = r.string;
        index = 0;
        continue;
      }
      if (c === '{') {
        r = parseArray(string.substring(index));
        list.push(r.array);
        string = r.string;
        index = 0;
        continue;
      }
      throw new Error(format(__("Unexpected '{c}'"), {c: c}));
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
    if (value !== undefined) {
      return value;
    }
    throw new Error(format(__("Don't know about variable {name:U}"), { name: name }));
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
    var input = Array.prototype.slice.call(arguments, 1);
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
            if (d === 0) { throw new Error(__("Division by zero")); }
            return n / d;
          }, lhs, rhs);
          case "%": return defer(function(lhs, rhs) {
            var n = aexpr(lhs), d = aexpr(rhs);
            if (d === 0) { throw new Error(__("Division by zero")); }
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
    if (!list.length) {
      throw new Error(__("Unexpected end of instructions"));
    }

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
        if (list.length && Type(list[0]) === 'word' &&
            self.routines.has(String(list[0]))) {

          // Lisp-style (procedure input ...) calling syntax
          atom = list.shift();
          return self.dispatch(atom, list, false);
        }
        // Standard parenthesized expression
        result = expression(list);

        if (!list.length)
          throw new Error(format(__("Expected ')'")));
        if (!peek(list, [')']))
          throw new Error(format(__("Expected ')', saw {word}"), { word: list.shift() }));
        list.shift();
        return result;
      }
      // Procedure dispatch
      return self.dispatch(atom, list, true);

    default: throw new Error("Internal error in expression parser");
    }
  }

  self.dispatch = function(name, tokenlist, natural) {
    var procedure = self.routines.get(name);
    if (!procedure) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: name }));
    }

    if (procedure.special) {
      // Special routines are built-ins that get handed the token list:
      // * workspace modifiers like TO that special-case varnames
      procedure(tokenlist);
      return function() { };
    }

    var args = [];
    if (natural) {
      // Natural arity of the function
      for (var i = 0; i < procedure.length; ++i) {
        args.push(expression(tokenlist));
      }
    } else {
      // Caller specified argument count
      while (tokenlist.length && !peek(tokenlist, [')'])) {
        args.push(expression(tokenlist));
      }
      tokenlist.shift(); // Consume ')'
    }

    if (procedure.noeval) {
      return function() {
        return procedure.apply(null, args);
      };
    }

    return function() {
      return serialExecute(args).then(function(args) {
        return procedure.apply(null, args);
      });
    };
  };

  //----------------------------------------------------------------------
  // Arithmetic expression convenience function
  //----------------------------------------------------------------------
  function aexpr(atom) {
    if (atom === undefined) {
      throw new Error(__("Expected number"));
    }
    switch (Type(atom)) {
    case 'word':
      if (isNumber(atom))
        return parseFloat(atom);
      break;
    }
    throw new Error(__("Expected number"));
  }

  //----------------------------------------------------------------------
  // String expression convenience function
  //----------------------------------------------------------------------
  function sexpr(atom) {
    if (atom === undefined) { throw new Error(__("Expected string")); }
    if (atom === UNARY_MINUS) return '-';
    if (Type(atom) === 'word') return String(atom);

    throw new Error(__("Expected string"));
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
    if (atom === undefined) { throw new Error(__("Expected list")); }
    switch (Type(atom)) {
    case 'word':
      return Array.from(String(atom));
    case 'list':
      return copy(atom);
    }

    throw new Error(__("Expected list"));
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
    case 'array':
      if (a.length !== b.length)
        return false;
      for (var i = 0; i < a.length; i += 1) {
        if (!equal(a[i], b[i]))
          return false;
      }
      return true;
    }
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
            reject(new Error(format(__("Don't know what to do with {result}"), {result: result})));
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
        case 'array': return '{ ' + atom.list().map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error(__("Unexpected value: unknown type"));
      }
    }

    var def = "to " + name;
    if (proc.inputs.length) {
      def += " ";
      def += proc.inputs.map(function(a) { return ":" + a; }).join(" ");
    }
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
      return "{" + thing.list().map(stringify).join(" ") + "}" +
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
      return thing.list().map(stringify).join(" ");
    default:
      return sexpr(thing);
    }
  }

  function def(name, fn, props) {
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
    if (!name.match(regexIdentifier)) {
      throw new Error(__("Expected identifier"));
    }

    if (self.routines.has(name) && self.routines.get(name).primitive) {
      throw new Error(format(__("Can't redefine primitive {name:U}"), { name: name }));
    }

    var inputs = [];
    var block = [];

    // Process inputs, then the statements of the block
    var state_inputs = true, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (isKeyword(atom, 'END')) {
        sawEnd = true;
        break;
      } else if (state_inputs && Type(atom) === 'word' && String(atom).charAt(0) === ':') {
        inputs.push(atom.substring(1));
      } else {
        state_inputs = false;
        block.push(atom);
      }
    }
    if (!sawEnd) {
      throw new Error(format(__("Expected END")));
    }

    // Closure over inputs and block to handle scopes, arguments and outputs
    var func = function() {

      // Define a new scope
      var scope = new StringMap(true);
      for (var i = 0; i < inputs.length && i < arguments.length; i += 1) {
        scope.set(inputs[i], {value: arguments[i]});
      }
      self.scopes.push(scope);
      return promiseFinally(self.execute(block).then(null, function(err) {
        if (err instanceof Output)
          return err.output;
        throw err;
      }), function() {
        self.scopes.pop();
      });
    };

    var proc = to_arity(func, inputs.length);
    self.routines.set(name, proc);

    // For DEF de-serialization
    proc.inputs = inputs;
    proc.block = block;

    if (savehook) {
      savehook(name, self.definition(name, proc));
    }
  }, {special: true});

  def("def", function(list) {

    var name = sexpr(list);
    var proc = self.routines.get(name);
    if (!proc) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: name }));
    }
    if (!proc.inputs) {
      throw new Error(format(__("Can't show definition of primitive {name:U}"), { name: name }));
    }

    return self.definition(name, proc);
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
  });

  def("list", function(thing1, thing2) {
    return Array.from(arguments).map(function(x) { return x; }); // Make a copy
  });

  def(["sentence", "se"], function(thing1, thing2) {
    var list = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var thing = arguments[i];
      if (Type(thing) === 'list') {
        thing = lexpr(thing);
        list = list.concat(thing);
      } else {
        list.push(thing);
      }
    }
    return list;
  });

  def("fput", function(thing, list) {
    var l = lexpr(list); l.unshift(thing); return sifw(list, l);
  });

  def("lput", function(thing, list) {
    var l = lexpr(list); l.push(thing); return sifw(list, l);
  });

  def("array", function(size) {
    size = aexpr(size);
    if (size < 1) { throw new Error(__("Array size must be positive integer")); }
    var origin = 1;
    if (arguments.length > 1) {
      origin = aexpr(arguments[1]);
    }
    return new LogoArray(size, origin);
  });

  // Not Supported: mdarray

  def("listtoarray", function(list) {
    list = lexpr(list);
    var origin = 1;
    if (arguments.length > 1) {
      origin = aexpr(arguments[1]);
    }
    return LogoArray.from(list, origin);
  });

  def("arraytolist", function(array) {
    if (Type(array) !== 'array') {
      throw new Error(__("Expected array"));
    }
    return array.list();
  });

  def("combine", function(thing1, thing2) {
    if (Type(thing2) !== 'list') {
      return self.routines.get('word')(thing1, thing2);
    } else {
      return self.routines.get('fput')(thing1, thing2);
    }
  });

  def("reverse", function(list) {
    return sifw(list, lexpr(list).reverse());
  });

  var gensym_index = 0;
  def("gensym", function() {
    gensym_index += 1;
    return 'G' + gensym_index;
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

  def("item", function(index, thing) {
    index = aexpr(index);
    switch (Type(thing)) {
    case 'list':
      if (index < 1 || index > thing.length)
        throw new Error(__("Index out of bounds"));
      return thing[index - 1];
    case 'array':
      return thing.item(index);
    default:
      thing = sexpr(thing);
      if (index < 1 || index > thing.length)
        throw new Error(__("Index out of bounds"));
      return thing.charAt(index - 1);
    }
  });

  // Not Supported: mditem

  def("pick", function(list) {
    list = lexpr(list);
    var i = Math.floor(self.prng.next() * list.length);
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

  // Not Supported: quoted

  //
  // 2.3 Data Mutators
  //

  def("setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw new Error(__("Expected array"));

    function contains(atom, value) {
      if (atom === value) return true;
      switch (Type(atom)) {
      case 'list':
        return atom.some(function(a) { return contains(a, value); });
      case 'array':
        return atom.list().some(function(a) { return contains(a, value); });
      default:
        return false;
      }
    }

    if (contains(value, array))
      throw new Error(__("SETITEM can't create circular array"));

    array.setItem(index, value);
  });

  // Not Supported: mdsetitem

  def(".setfirst", function(list, value) {
     if (Type(list) !== 'list')
      throw new Error(__(".SETFIRST expected list"));
    list[0] = value;
  });

  def(".setbf", function(list, value) {
    if (Type(list) !== 'list')
      throw new Error(__(".SETBF expected non-empty list"));
    if (list.length < 1)
      throw new Error(__(".SETBF expected non-empty list"));
    value = lexpr(value);
    list.length = 1;
    list.push.apply(list, value);
  });

  def(".setitem", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array') {
      throw new Error(__("Expected array"));
    }
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
  def(["numberwang"], function(thing) { return self.prng.next() < 0.5 ? 1 : 0; });

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

  // Not Supported: .eq
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
    if (Type(thing) === 'array') { return thing.count(); }
    return lexpr(thing).length;
  });
  def("ascii", function(chr) { return sexpr(chr).charCodeAt(0); });
  // Not Supported: rawascii
  def("char", function(integer) { return String.fromCharCode(aexpr(integer)); });
  def("lowercase", function(word) { return sexpr(word).toLowerCase(); });
  def("uppercase", function(word) { return sexpr(word).toUpperCase(); });
  def("standout", function(word) { return sexpr(word); }); // For compat
  // Not Supported: parse
  // Not Supported: runparse

  //----------------------------------------------------------------------
  //
  // 3. Communication
  //
  //----------------------------------------------------------------------

  // 3.1 Transmitters

  def(["print", "pr"], function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join(" ");
    self.stream.write(s, "\n");
  });
  def("type", function(thing) {
    var s = Array.from(arguments).map(stringify_nodecorate).join("");
    self.stream.write(s);
  });
  def("show", function(thing) {
    var s = Array.from(arguments).map(stringify).join(" ");
    self.stream.write(s, "\n");
  });

  // 3.2 Receivers

  // Not Supported: readlist

  def("readword", function() {
    if (arguments.length > 0) {
      return stream.read(stringify_nodecorate(arguments[0]));
    } else {
      return stream.read();
    }
  });


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
    self.stream.clear();
  });

  // Not Supported: setcursor
  // Not Supported: cursor
  // Not Supported: setmargins
  // Not Supported: settextcolor
  // Not Supported: increasefont
  // Not Supported: settextsize
  // Not Supported: textsize
  // Not Supported: setfont
  // Not Supported: font

  //----------------------------------------------------------------------
  //
  // 4. Arithmetic
  //
  //----------------------------------------------------------------------
  // 4.1 Numeric Operations


  def("sum", function(a, b) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a + b; }, 0);
  });

  def("difference", function(a, b) {
    return aexpr(a) - aexpr(b);
  });

  def("minus", function(a) { return -aexpr(a); });

  def("product", function(a, b) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a * b; }, 1);
  });

  def("quotient", function(a, b) {
    if (b !== undefined) {
      return aexpr(a) / aexpr(b);
    } else {
      return 1 / aexpr(a);
    }
  });

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
  });

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
  });

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
    max = aexpr(max);
    return Math.floor(self.prng.next() * max);
  });

  def("rerandom", function() {
    var seed = (arguments.length > 0) ? aexpr(arguments[0]) : 2345678901;
    return self.prng.seed(seed);
  });

  // 4.4 Print Formatting

  def("form", function(num, width, precision) {
    num = aexpr(num);
    width = aexpr(width);
    precision = aexpr(precision);

    var str = num.toFixed(precision);
    if (str.length < width) {
      str = Array(1 + width - str.length).join(' ') + str;
    }
    return str;
  });

  // 4.5 Bitwise Operations


  def("bitand", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a & b; }, -1);
  });
  def("bitor", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a | b; }, 0);
  });
  def("bitxor", function(num1, num2) {
    return Array.from(arguments).map(aexpr).reduce(function(a, b) { return a ^ b; }, 0);
  });
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
  }, {noeval: true});

  def("or", function(a, b) {
    var args = Array.from(arguments);
    return booleanReduce(args, function(value) {return !value;}, 0);
  }, {noeval: true});

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
  });

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
  def(["\u2192"], function() { return turtle.turn(-15); });
  // Up arrow:
  def(["\u2191"], function() { return turtle.move(10); });
  // Down arrow:
  def(["\u2193"], function() { return turtle.turn(-10); });


  def("setpos", function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Expected list of length 2")); }
    return turtle.setposition(aexpr(l[0]), aexpr(l[1]));
  });
  def("setxy", function(x, y) { return turtle.setposition(aexpr(x), aexpr(y)); });
  def("setx", function(x) { return turtle.setposition(aexpr(x), undefined); }); // TODO: Replace with ...?
  def("sety", function(y) { return turtle.setposition(undefined, aexpr(y)); });
  def(["setheading", "seth"], function(a) { return turtle.setheading(aexpr(a)); });

  def("home", function() { return turtle.home(); });

  def("arc", function(angle, radius) { return turtle.arc(aexpr(angle), aexpr(radius)); });

  //
  // 6.2 Turtle Motion Queries
  //

  def("pos", function() { var l = turtle.getxy(); return [l[0], l[1]]; });
  def("xcor", function() { var l = turtle.getxy(); return l[0]; });
  def("ycor", function() { var l = turtle.getxy(); return l[1]; });
  def("heading", function() { return turtle.getheading(); });
  def("towards", function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Expected list of length 2")); }
    return turtle.towards(aexpr(l[0]), aexpr(l[1]));
  });

  // Not Supported: scrunch

  //
  // 6.3 Turtle and Window Control
  //

  def(["showturtle", "st"], function() { return turtle.showturtle(); });
  def(["hideturtle", "ht"], function() { return turtle.hideturtle(); });
  def("clean", function() { return turtle.clear(); });
  def(["clearscreen", "cs"], function() { return turtle.clearscreen(); });

  def("wrap", function() { return turtle.setturtlemode('wrap'); });
  def("window", function() { return turtle.setturtlemode('window'); });
  def("fence", function() { return turtle.setturtlemode('fence'); });

  def("fill", function() { return turtle.fill(); });

  def("filled", function(fillcolor, statements) {
    fillcolor = sexpr(fillcolor);
    statements = reparse(lexpr(statements));
    turtle.beginpath();
    return promiseFinally(
      self.execute(statements),
      function() {
        turtle.fillpath(fillcolor);
      });
  });

  def("label", function(a) {
    var s = Array.from(arguments).map(stringify_nodecorate).join(" ");
    return turtle.drawtext(s);
  });

  def("setlabelheight", function(a) { return turtle.setfontsize(aexpr(a)); });

  def("setlabelfont", function(a) { return turtle.setfontname(sexpr(a)); });

  // Not Supported: textscreen
  // Not Supported: fullscreen
  // Not Supported: splitscreen
  // Not Supported: setscrunch
  // Not Supported: refresh
  // Not Supported: norefresh

  //
  // 6.4 Turtle and Window Queries
  //

  def(["shownp", "shown?"], function() {
    return turtle.isturtlevisible() ? 1 : 0;
  });

  // Not Supported: screenmode

  def("turtlemode", function() {
    return turtle.getturtlemode().toUpperCase();
  });

  def("labelsize", function() {
    return [turtle.getfontsize(), turtle.getfontsize()];
  });

  def("labelfont", function() {
    return turtle.getfontname();
  });

  //
  // 6.5 Pen and Background Control
  //
  def(["pendown", "pd"], function() { return turtle.pendown(); });
  def(["penup", "pu"], function() { return turtle.penup(); });

  def(["penpaint", "ppt"], function() { return turtle.setpenmode('paint'); });
  def(["penerase", "pe"], function() { return turtle.setpenmode('erase'); });
  def(["penreverse", "px"], function() { return turtle.setpenmode('reverse'); });

  def(["setpencolor", "setpc", "setcolor"], function(color) {
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
      return turtle.setcolor('#' + rr + gg + bb);
    } else {
      return turtle.setcolor(sexpr(color));
    }
  });

  // Not Supported: setpalette

  def(["setpensize", "setwidth", "setpw"], function(a) {
    if (Type(a) === 'list') {
      return turtle.setwidth(aexpr(a[0]));
    } else {
      return turtle.setwidth(aexpr(a));
    }
  });

  // Not Supported: setpenpattern
  // Not Supported: setpen
  // Not Supported: setbackground

  //
  // 6.6 Pen Queries
  //

  def(["pendownp", "pendown?"], function() {
    return turtle.ispendown() ? 1 : 0;
  });

  def("penmode", function() {
    return turtle.getpenmode().toUpperCase();
  });

  def(["pencolor", "pc"], function() {
    return turtle.getcolor();
  });

  // Not Supported: palette

  def("pensize", function() {
    return [turtle.getwidth(), turtle.getwidth()];
  });

  // Not Supported: pen
  // Not Supported: background

  // 6.7 Saving and Loading Pictures

  // Not Supported: savepict
  // Not Supported: loadpict
  // Not Supported: epspict

  // 6.8 Mouse Queries

  // Not Supported: mousepos
  // Not Supported: clickpos
  // Not Supported: buttonp
  // Not Supported: button

  //----------------------------------------------------------------------
  //
  // 7. Workspace Management
  //
  //----------------------------------------------------------------------
  // 7.1 Procedure Definition

  def("copydef", function(newname, oldname) {

    newname = sexpr(newname);
    oldname = sexpr(oldname);

    if (!self.routines.has(oldname)) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: oldname }));
    }

    if (self.routines.has(newname)) {
      if (self.routines.get(newname).special) {
        throw new Error(format(__("Can't overwrite special {name:U}"), { name: newname }));
      }
      if (self.routines.get(newname).primitive && !maybegetvar("redefp")) {
        throw new Error(__("Can't overwrite primitives unless REDEFP is TRUE"));
      }
    }

    self.routines.set(newname, self.routines.get(oldname));
    if (savehook) {
      // TODO: This is broken if copying a built-in, so disable for now
      //savehook(newname, self.definition(newname, self.routines.get(newname)));
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
    var localscope = self.scopes[self.scopes.length - 1];
    Array.from(arguments).forEach(function(name) { localscope.set(sexpr(name), {value: undefined}); });
  });

  def("localmake", function(varname, value) {
    var localscope = self.scopes[self.scopes.length - 1];
    localscope.set(sexpr(varname), {value: value});
  });

  def("thing", function(varname) {
    return getvar(sexpr(varname));
  });

  def("global", function(varname) {
    var globalscope = self.scopes[0];
    Array.from(arguments).forEach(function(name) {
      globalscope.set(sexpr(name), {value: undefined}); });
  });

  //
  // 7.3 Property Lists
  //

  def("pprop", function(plistname, propname, value) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (!plist) {
      plist = new StringMap(true);
      self.plists.set(plistname, plist);
    }
    plist.set(propname, value);
  });

  def("gprop", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (!plist || !plist.has(propname)) {
      return [];
    }
    return plist.get(propname);
  });

  def("remprop", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (plist) {
      plist['delete'](propname);
      if (plist.empty()) {
        // TODO: Do this? Loses state, e.g. unburies if buried
        self.plists['delete'](plistname);
      }
    }
  });

  def("plist", function(plistname) {
    plistname = sexpr(plistname);
    var plist = self.plists.get(plistname);
    if (!plist) {
      return [];
    }

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
    return self.routines.has(name) ? 1 : 0;
  });

  def(["primitivep", "primitive?"], function(name) {
    name = sexpr(name);
    return (self.routines.has(name) &&
            self.routines.get(name).primitive) ? 1 : 0;
  });

  def(["definedp", "defined?"], function(name) {
    name = sexpr(name);
    return (self.routines.has(name) &&
            !self.routines.get(name).primitive) ? 1 : 0;
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
    return self.plists.has(plistname) ? 1 : 0;
  });

  //
  // 7.5 Workspace Queries
  //

  def("contents", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && !self.routines.get(x).buried; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return !scope.get(x).buried; })); },
        []),
      self.plists.keys().filter(function(x) { return !self.plists.get(x).buried; })
    ];
  });

  def("buried", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).buried; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).buried; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).buried; })
    ];
  });

  def("traced", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).traced; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).traced; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).traced; })
    ];
  });

  def(["stepped"], function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).stepped; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).stepped; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).stepped; })
    ];
  });

  def("procedures", function() {
    return self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    });
  });

  def("primitives", function() {
    return self.routines.keys().filter(function(x) {
      return self.routines.get(x).primitive & !self.routines.get(x).buried;
    });
  });

  def("globals", function() {
    var globalscope = self.scopes[0];
    return globalscope.keys().filter(function(x) {
      return !globalscope.get(x).buried;
    });
  });

  def("names", function() {
    return [
      [],
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) {
          return !scope.get(x).buried; })); }, [])
    ];
  });

  def("plists", function() {
    return [
      [],
      [],
      self.plists.keys().filter(function(x) {
        return !self.plists.get(x).buried; })
    ];
  });

  def("namelist", function(varname) {
    if (Type(varname) === 'list') {
      varname = lexpr(varname);
    } else {
      varname = [sexpr(varname)];
    }
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


  // Not Supported: arity
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
        if (self.routines.has(name)) {
          if (self.routines.get(name).special) {
            throw new Error(format(__("Can't ERASE special {name:U}"), { name: name }));
          }
          if (!self.routines.get(name).primitive || maybegetvar("redefp")) {
            self.routines['delete'](name);
            if (savehook) savehook(name);
          } else {
            throw new Error(__("Can't ERASE primitives unless REDEFP is TRUE"));
          }
        }
      });
    }

    // Delete variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
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
        self.plists['delete'](name);
      });
    }
  });

  // TODO: lots of redundant logic here -- clean this up
  def("erall", function() {
    self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    }).forEach(function(name) {
      self.routines['delete'](name);
      if (savehook) savehook(name);
    });

    self.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });

    self.plists.keys().filter(function(x) {
      return !self.plists.get(x).buried;
    }).forEach(function(name) {
      self.plists['delete'](name);
    });
  });

  def("erps", function() {
    self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    }).forEach(function(name) {
      self.routines['delete'](name);
      if (savehook) savehook(name);
    });
  });

  def("erns", function() {
    self.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });
  });

  def("erpls", function() {
    self.plists.keys().filter(function(x) {
      return !self.plists.get(x).buried;
    }).forEach(function(key) {
      self.plists['delete'](key);
    });
  });

  def("ern", function(varname) {
    var varnamelist;
    if (Type(varname) === 'list') {
      varnamelist = lexpr(varname);
    } else {
      varnamelist = [sexpr(varname)];
    }

    self.scopes.forEach(function(scope) {
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
      self.plists['delete'](name);
    });
  });

  def("bury", function(list) {
    list = lexpr(list);

    // Bury procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (self.routines.has(name)) {
          self.routines.get(name).buried = true;
        }
      });
    }

    // Bury variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name)) {
            scope.get(name).buried = true;
          }
        });
      });
    }

    // Bury property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (self.plists.has(name)) {
          self.plists.get(name).buried = true;
        }
      });
    }
  });

  def("buryall", function() {
    self.routines.forEach(function(name, proc) {
      proc.buried = true;
    });

    self.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = true;
      });
    });

    self.plists.forEach(function(name, entry) {
      entry.buried = true;
    });
  });

  // Not Supported: buryname

  def("unbury", function(list) {
    list = lexpr(list);

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (self.routines.has(name)) {
          self.routines.get(name).buried = false;
        }
      });
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name)) {
            scope.get(name).buried = false;
          }
        });
      });
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (self.plists.has(name)) {
          self.plists.get(name).buried = false;
        }
      });
    }
  });

  def("unburyall", function() {
    self.routines.forEach(function(name, proc) {
      proc.buried = false;
    });

    self.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = false;
      });
    });

    self.plists.forEach(function(name, entry) {
      entry.buried = false;
    });
  });

  // Not Supported: unburyname

  def(["buriedp", "buried?"], function(list) {
    list = lexpr(list);
    var name;

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      if (procs.length) {
        name = sexpr(procs[0]);
        return (self.routines.has(name) && self.routines.get(name).buried) ? 1 : 0;
      }
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      if (vars.length) {
        name = sexpr(vars[0]);
        // TODO: global only?
        return (self.scopes[0].has(name) && self.scopes[0].get(name).buried) ? 1 : 0;
      }
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      if (plists.length) {
        name = sexpr(plists[0]);
        return (self.plists.has(name) && self.plists.get(name).buried) ? 1 : 0;
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
    return self.execute(statements, {returnResult: true});
  });

  def("runresult", function(statements) {
    statements = reparse(lexpr(statements));
    return self.execute(statements, {returnResult: true})
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
    var old_repcount = self.repcount;
    var i = 1;
    return promiseFinally(
      promiseLoop(function(loop, resolve, reject) {
        if (i > count) {
          resolve();
          return;
        }
        self.repcount = i++;
        self.execute(statements)
          .then(loop, reject);
      }), function() {
        self.repcount = old_repcount;
      });
  });

  def("forever", function(statements) {
    statements = reparse(lexpr(statements));
    var old_repcount = self.repcount;
    var i = 1;
    return promiseFinally(
      promiseLoop(function(loop, resolve, reject) {
        self.repcount = i++;
        self.execute(statements)
          .then(loop, reject);
      }), function() {
        self.repcount = old_repcount;
      });
  });

  def("repcount", function() {
    return self.repcount;
  });

  def("if", function(test, statements) {
    test = aexpr(test);
    statements = reparse(lexpr(statements));

    if (test) { return self.execute(statements, {returnResult: true}); }
  });

  def("ifelse", function(test, statements1, statements2) {
    test = aexpr(test);
    statements1 = reparse(lexpr(statements1));
    statements2 = reparse(lexpr(statements2));

    return self.execute(test ? statements1 : statements2, {returnResult: true});
  });

  def("test", function(tf) {
    tf = aexpr(tf);
    // NOTE: A property on the scope, not within the scope
    self.scopes[self.scopes.length - 1]._test = tf;
  });

  def(["iftrue", "ift"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (tf) { return self.execute(statements, {returnResult: true}); }
  });

  def(["iffalse", "iff"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (!tf) { return self.execute(statements, {returnResult: true}); }
  });

  def("stop", function() {
    throw new Output();
  });

  def(["output", "op"], function(atom) {
    throw new Output(atom);
  });

  // Not Supported: catch
  // Not Supported: throw
  // Not Supported: error
  // Not Supported: pause
  // Not Supported: continue
  // Not Supported: wait

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

  // Not Supported: `

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
      })
      .then(function() {
        return promiseLoop(function(loop, resolve, reject) {
          if (sign(current - limit) === sign(step)) {
            resolve();
            return;
          }
          setvar(varname, current);
          self.execute(statements)
            .then(function() {
              return (control.length) ?
                evaluateExpression(control.slice()) : sign(limit - start);
            })
            .then(function(result) {
              step = aexpr(result);
                current += step;
              loop();
            }, reject);
        });
      });
  });

  def("dotimes", function(control, statements) {
    control = reparse(lexpr(control));
    return self.routines.get("for")([control[0], 0, control[1]], statements);
  });

  function checkevalblock(block) {
    block = block();
    if (Type(block) === 'list') { return block; }
    throw new Error(__("Expected block"));
  }

  def("do.while", function(block, tf) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      self.execute(block)
        .then(tf)
        .then(function(cond) {
          if (!cond) {
            resolve();
            return;
          }
          loop();
        }, reject);
    });
  }, {noeval: true});

  def("while", function(tf, block) {
    block = checkevalblock(block);
    return promiseLoop(function(loop, resolve, reject) {
      Promise.resolve(tf())
        .then(function(cond) {
          if (!cond) {
            resolve();
            return;
          }
          self.execute(block)
            .then(loop);
        }, reject);
    });
  }, {noeval: true});

  function negatePromiseFunction(tf) {
    return function() {
      return Promise.resolve(tf()).then(function(r) { return !r; });
    };
  }

  def("do.until", function(block, tf) {
    return self.routines.get("do.while")(block, negatePromiseFunction(tf));
  }, {noeval: true});

  def("until", function(tf, block) {
    return self.routines.get("while")(negatePromiseFunction(tf), block);
  }, {noeval: true});

  def("case", function(value, clauses) {
    clauses = lexpr(clauses);

    for (var i = 0; i < clauses.length; ++i) {
      var clause = lexpr(clauses[i]);
      var first = clause.shift();
      if (isKeyword(first, 'ELSE')) {
        return evaluateExpression(clause);
      }
      if (lexpr(first).some(function(x) { return equal(x, value); })) {
        return evaluateExpression(clause);
      }
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

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply APPLY to special {name:U}"),
                             { name: procname }));
    }

    return routine.apply(null, lexpr(list));
  });

  def("invoke", function(procname, input1) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply INVOKE to special {name:U}"),
                             { name: procname }));
    }

    var args = [];
    for (var i = 1; i < arguments.length; i += 1) {
      args.push(arguments[i]);
    }

    return routine.apply(null, args);
  });

  def("foreach", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply FOREACH to special {name:U}"),
                             { name: procname }));
    }
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


  def("map", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply MAP to special {name:U}"),
                             { name: procname }));
    }

    list = lexpr(list);
    var mapped = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(mapped);
        return;
      }
      Promise.resolve(routine(list.shift()))
        .then(function(value) {
          mapped.push(value);
          loop();
        }, reject);
    });
  });

  // Not Supported: map.se

  def("filter", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply FILTER to special {name:U}"),
                             { name: procname }));
    }

    list = lexpr(list);
    var filtered = [];
    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(filtered);
        return;
      }
      var item = list.shift();
      Promise.resolve(routine(item))
        .then(function(value) {
          if (value)
            filtered.push(item);
          loop();
        }, reject);
    });
  });

  def("find", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Can't apply FIND to special {name:U}"),
                             { name: procname }));
    }

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

    var procedure = self.routines.get(procname);
    if (!procedure) {
      throw new Error(format(__("Don't know how to {name:U}"), { name: procname }));
    }
    if (procedure.special || procedure.noeval) {
      throw new Error(format(__("Can't apply REDUCE to special {name:U}"),
                             { name: procname }));
    }

    return promiseLoop(function(loop, resolve, reject) {
      if (!list.length) {
        resolve(value);
        return;
      }
      Promise.resolve(procedure(value, list.shift()))
        .then(function(result) {
          value = result;
          loop();
        }, reject);
    });
  });

  // Not Supported: crossmap
  // Not Supported: cascade
  // Not Supported: cascade.2
  // Not Supported: transfer

  // Helper for testing that wraps a result in a Promise
  def(".promise", function(value) {
    return Promise.resolve(value);
  });
}
