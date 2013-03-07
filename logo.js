//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011 Joshua Bell
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

//----------------------------------------------------------------------
function LogoInterpreter(turtle, stream, savehook)
//----------------------------------------------------------------------
{
  var self = this;

  var UNARY_MINUS = '<UNARYMINUS>'; // Must not match regexIdentifier

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/\{(\w+)\}/g, function(m, n) {
      return params[n];
    });
  }

  function __(string) {
    // TODO: look up string in translation table
    return string;
  }

  // Based on: http://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  function to_arity(func, arity) {
    var parms = [];

    if (func.length === arity) {
      return func;
    }

    for (var i = 0; i < arity; i += 1) {
      parms.push('a' + i);
    }

    var f = eval('f = (function ' + func.name + '(' + parms.join(',') + ') { return func.apply(this, arguments); })');
    return f;
  }


  // Adapted from:
  // http://stackoverflow.com/questions/424292/how-to-create-my-own-javascript-random-number-generator-that-i-can-also-set-the-s
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

  // TODO: Allow case-sensitive and case-insensitive lookup
  // so CASEIGNOREDP can be implemented. Right now, callers
  // must do case folding.
  function StringMap() {
    var map = Object.create(null);
    return {
      get: function(key) {
        return map['$' + key];
      },
      set: function (key, value) {
        map['$' + key] = value;
      },
      has: function (key) {
        return (('$' + key) in map);
      },
      'delete': function (key) {
        return delete map['$' + key];
      },
      keys: function () {
        return Object.keys(map).map(
          function (key) {
            return key.substring(1);
          }
        );
      }
    };
  }


  //----------------------------------------------------------------------
  //
  // Interpreter State
  //
  //----------------------------------------------------------------------

  self.turtle = turtle;
  self.stream = stream;
  self.routines = {}; // TODO: use a StringMap
  self.scopes = [new StringMap()];
  self.plists = new StringMap();
  self.prng = new PRNG(Math.random() * 0x7fffffff);

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
    if (atom === (void 0)) {
      throw new Error(__("No output from procedure")); // TODO: Should be caught higher upstream than this
    } else if (typeof atom === 'string') {
      return 'word';
    } else if (typeof atom === 'number') {
      return 'number';
    } else if (Array.isArray(atom)) {
      return 'list';
    } else if (!atom) {
      throw new Error(__("Unexpected value: null"));
    } else {
      throw new Error(__("Unexpected value: unknown type"));
    }
  }

  var regexIdentifier = /^(\.?[A-Za-z][A-Za-z0-9_.\?]*)(.*?)$/;
  var regexStringLiteral = /^("[^ \[\]\(\)]*)(.*?)$/;
  var regexVariableLiteral = /^(:[A-Za-z][A-Za-z0-9_]*)(.*?)$/;
  var regexNumberLiteral = /^([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)(.*?)$/;
  var regexOperator = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>|\[|\]|\(|\))(.*?)$/;
  var regexInfix = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>)$/;

  //
  // Tokenize into atoms / lists
  //
  // Input: string
  // Output: atom list (e.g. "to", "jump", "repeat", "random", 10, [ "fd", "10", "rt", "10" ], "end"
  //

  function parse(string) {
    if (string === (void 0)) {
      return (void 0); // TODO: Replace this with ...?
    }

    var atoms = [],
        prev, r;

    // Handle escaping and filter out comments
    string = string.replace(/^(([^;\\\n]|\\.)*);.*$/mg, '$1').replace(/\\(.)/g, '$1');

    // Treat newlines as whitespace (so \s will match)
    string = string.replace(/\r/g, '').replace(/\n/g, ' ');
    string = string.replace(/^\s+/, '').replace(/\s+$/, '');

    while (string !== (void 0) && string !== '') {
      var atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      var leading_space = /^\s+/.test(string);
      string = string.replace(/^\s+/, '');

      if (string.match(regexIdentifier) ||
          string.match(regexStringLiteral) ||
          string.match(regexVariableLiteral) ||
          string.match(regexNumberLiteral)) {

        atom = RegExp.$1;
        string = RegExp.$2;

      } else if (string.charAt(0) === '[') {
        r = parseList(string.substring(1));
        atom = r.list;
        string = r.string;

      } else if (string.match(regexOperator)) {
        atom = RegExp.$1;
        string = RegExp.$2;

        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by
        // a space and followed by a nonspace.

        if (atom === '-') {

          var trailing_space = /^\s+/.test(string);

          if (prev === (void 0) ||
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
    return c === ' ' || c === '\t' || c === '\r' || c === '\n';;
  }

  function parseList(string) {
    var index = 0,
        list = [],
        atom = '',
        c;

    while (true) {
      do {
        c = string.charAt(index++);
      } while (isWS(c));

      while (!isWS(c) && c !== '[' && c !== ']' && c !== '') {
        atom += c;
        c = string.charAt(index++);
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (c === '') {
        throw new Error(__("Expected ']'"));
      }
      if (c === ']') {
        return { list: list, string: string.substring(index) };
      }
      if (c === '[') {
        var r = parseList(string.substring(index));
        list.push(r.list);
        string = r.string;
        index = 0;
      }
    }
  }

  function reparse(list) {
    return parse(stringify_nodecorate(list).replace(/([\\;])/g, '\\$1'));
  }

  self.maybegetvar = function(name) {
    name = name.toLowerCase();
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name).value;
      }
    }
    return (void 0);
  };

  self.getvar = function(name) {
    name = name.toLowerCase();
    var value = self.maybegetvar(name);
    if (value !== (void 0)) {
      return value;
    }
    throw new Error(format(__("Don't know about variable {name}"), { name: name.toUpperCase() }));
  };

  self.getlvalue = function(name) {
    name = name.toLowerCase();
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name);
      }
    }
    throw new Error(format(__("Don't know about variable {name}"), { name: name.toUpperCase() }));
  };

  self.setvar = function(name, value) {
    name = name.toLowerCase();
    value = copy(value);

    // Find the variable in existing scope
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        self.scopes[i].get(name).value = value;
        return;
      }
    }

    // Otherwise, define a global
    var lvalue = {value: value};
    self.scopes[0].set(name, lvalue);
  };

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

  //----------------------------------------------------------------------
  // Peek at the list to see if there are additional atoms from a set
  // of options.
  //----------------------------------------------------------------------
  function peek(list, options)
  //----------------------------------------------------------------------
  {
    if (list.length < 1) { return false; }
    var next = list[0];
    return options.some(function(x) { return next === x; });

  }

  self.evaluateExpression = function(list) {
    return (self.expression(list))();
  };

  self.expression = function(list) {
    return self.relationalExpression(list);

  };

  self.relationalExpression = function(list) {
    var lhs = self.additiveExpression(list);
    var op;
    while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = self.additiveExpression(list);

        switch (op) {
          case "<": return function() { return (aexpr(lhs()) < aexpr(rhs())) ? 1 : 0; };
          case ">": return function() { return (aexpr(lhs()) > aexpr(rhs())) ? 1 : 0; };
          case "=": return function() { return self.equal(lhs(), rhs()) ? 1 : 0; };

          case "<=": return function() { return (aexpr(lhs()) <= aexpr(rhs())) ? 1 : 0; };
          case ">=": return function() { return (aexpr(lhs()) >= aexpr(rhs())) ? 1 : 0; };
          case "<>": return function() { return !self.equal(lhs(), rhs()) ? 1 : 0; };
          default: throw new Error(__("Internal error in expression parser"));
        }
      } (lhs);
    }

    return lhs;
  };

  self.additiveExpression = function(list) {
    var lhs = self.multiplicativeExpression(list);
    var op;
    while (peek(list, ['+', '-'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = self.multiplicativeExpression(list);
        switch (op) {
          case "+": return function() { return aexpr(lhs()) + aexpr(rhs()); };
          case "-": return function() { return aexpr(lhs()) - aexpr(rhs()); };
          default: throw new Error(__("Internal error in expression parser"));
        }
      } (lhs);
    }

    return lhs;
  };

  self.multiplicativeExpression = function(list) {
    var lhs = self.powerExpression(list);
    var op;
    while (peek(list, ['*', '/', '%'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = self.powerExpression(list);
        switch (op) {
          case "*": return function() { return aexpr(lhs()) * aexpr(rhs()); };
          case "/": return function() {
            var n = aexpr(lhs()), d = aexpr(rhs());
            if (d === 0) { throw new Error(__("Division by zero")); }
            return n / d;
          };
          case "%": return function() {
            var n = aexpr(lhs()), d = aexpr(rhs());
            if (d === 0) { throw new Error(__("Division by zero")); }
            return n % d;
          };
          default: throw new Error(__("Internal error in expression parser"));
        }
      } (lhs);
    }

    return lhs;
  };

  self.powerExpression = function(list) {
    var lhs = self.unaryExpression(list);
    var op;
    while (peek(list, ['^'])) {
      op = list.shift();
      lhs = function(lhs) {
        var rhs = self.unaryExpression(list);
        return function() { return Math.pow(aexpr(lhs()), aexpr(rhs())); };
      } (lhs);
    }

    return lhs;
  };

  self.unaryExpression = function(list) {
    var rhs, op;

    if (peek(list, [UNARY_MINUS])) {
      op = list.shift();
      rhs = self.unaryExpression(list);
      return function() { return -aexpr(rhs()); };
    } else {
      return self.finalExpression(list);
    }
  };


  self.finalExpression = function(list) {
    if (!list.length) {
      throw new Error(__("Unexpected end of instructions"));
    }

    var atom = list.shift();

    var args, i, routine, result;
    var literal, varname;

    switch (Type(atom)) {
      case 'number':
        throw new Error(__("Unexpected atom type: number"));

      case 'list':
        return function() { return atom; };

      case 'word':
        if (isNumber(atom)) {
          // number literal
          atom = parseFloat(atom);
          return function() { return atom; };
        } else if (atom.charAt(0) === '"') {
          // string literal
          literal = atom.substring(1);
          return function() { return literal; };
        } else if (atom.charAt(0) === ':') {
          // variable
          varname = atom.substring(1);
          return function() { return self.getvar(varname); };
        } else if (atom === '(') {
          // parenthesized expression/procedure call
          if (list.length && Type(list[0]) === 'word' &&
              self.routines[String(list[0]).toLowerCase()]) {

            // Lisp-style (procedure input ...) calling syntax
            atom = list.shift();
            return self.dispatch(atom, list, false);
          } else {
            // Standard parenthesized expression
            result = self.expression(list);

            if (!list.length) {
              throw new Error(format(__("Expected ')'")));
            } else if (!peek(list, [')'])) {
              throw new Error(format(__("Expected ')', saw {word}"), { word: list.shift() }));
            }
            list.shift();
            return result;
          }
        } else {
          // Procedure dispatch
          return self.dispatch(atom, list, true);
        }
      break;
        default: throw new Error(__("Internal error in expression parser"));
    }
  };

  self.dispatch = function(name, tokenlist, natural) {
    var procedure = self.routines[name.toLowerCase()];
    if (!procedure) { throw new Error(format(__("Don't know how to {name}"), { name: name.toUpperCase() })); }

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
        args.push(self.expression(tokenlist));
      }
    } else {
      // Caller specified argument count
      while (tokenlist.length && !peek(tokenlist, [')'])) {
        args.push(self.expression(tokenlist));
      }
      tokenlist.shift(); // Consume ')'
    }

    if (procedure.noeval) {
      return function() {
        return procedure.apply(null, args);
      };
    } else {
      return function() {
        return procedure.apply(null, args.map(function(a) { return a(); }));
      };
    }
  };

  //----------------------------------------------------------------------
  // Arithmetic expression convenience function
  //----------------------------------------------------------------------
  function aexpr(atom) {
    if (atom === (void 0)) {
      throw new Error(__("Expected number"));
    }
    if (Type(atom) === 'number') {
      return atom;
    }
    if (Type(atom) === 'word' && isNumber(atom)) {
      return parseFloat(atom);
    }

    throw new Error(__("Expected number"));
  }

  //----------------------------------------------------------------------
  // String expression convenience function
  //----------------------------------------------------------------------
  function sexpr(atom) {
    if (atom === (void 0)) { throw new Error(__("Expected string")); }
    if (atom === UNARY_MINUS) { return '-'; }
    if (Type(atom) === 'word') { return atom; }
    if (Type(atom) === 'number') { return String(atom); } // coerce

    throw new Error(__("Expected string"));
  }

  //----------------------------------------------------------------------
  // List expression convenience function
  //----------------------------------------------------------------------
  function lexpr(atom) {
    // TODO: If this is an input, output needs to be re-stringified

    if (atom === (void 0)) { throw new Error(__("Expected list")); }
    if (Type(atom) === 'word') { return [].slice.call(atom); }
    if (Type(atom) === 'list') { return copy(atom); }

    throw new Error(__("Expected list"));
  }

  //----------------------------------------------------------------------
  //----------------------------------------------------------------------
  function copy(value) {
    switch (Type(value)) {
    case 'list': return value.map(copy);
    default: return value;
    }
  }

  //----------------------------------------------------------------------
  // Deep compare of values (numbers, strings, lists)
  // (with optional epsilon compare for numbers)
  //----------------------------------------------------------------------
  self.equal = function(a, b, epsilon) {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) {
        return false;
      }
      if (a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i += 1) {
        if (!self.equal(a[i], b[i])) {
          return false;
        }
      }
      return true;
    } else if (typeof a !== typeof b) {
      return false;
    } else if (epsilon !== (void 0) && typeof a === 'number') {
      return Math.abs(a - b) < epsilon;
    } else {
      return a === b;
    }
  };

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

    var result;
    while (statements.length) {
      result = self.evaluateExpression(statements);

      if (result !== (void 0) && !options.returnResult) {
        throw new Error(format(__("Don't know what to do with {result}"), {result: result}));
      }
    }

    // Return last result
    return result;

  };


  self.run = function(string, options) {
    options = Object(options);
    if (self.turtle) { self.turtle.begin(); }

    try {
      // Parse it
      var atoms = parse(string);

      // And execute it!
      return self.execute(atoms, options);
    } catch (e) {
      if (e instanceof Bye) {
        // clean exit
        return (void 0);
      } else {
        throw e;
      }
    } finally {
      if (self.turtle) { self.turtle.end(); }
    }
  };


  self.definition = function(name, proc) {

    function defn(atom) {
      switch (Type(atom)) {
        case 'word': return atom;
        case 'number': return String(atom);
        case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
      default: throw new Error(__("Unexpected value: unknown type"));
      }
    }

    var def = "to " + name + " ";
    if (proc.inputs.length) {
      def += proc.inputs.map(function(a) { return ":" + a; }).join(" ");
      def += " ";
    }
    def += proc.block.map(defn).join(" ").replace(new RegExp(UNARY_MINUS + ' ', 'g'), '-');
    def += " end";

    return def;
  };

  self.procdefs = function() {
    var defs = [];
    Object.keys(self.routines).forEach(function(name) {
      var proc = self.routines[name];
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n");
  };


  //----------------------------------------------------------------------
  //
  // Built-In Proceedures
  //
  //----------------------------------------------------------------------

  // Basic form:
  //
  //  self.routines["procname"] = function(input1, input2, ...) { ... return output; }
  //   * inputs are JavaScript strings, numbers, or Arrays
  //   * output is string, number, Array or undefined/no output
  //
  // Special forms:
  //
  //   self.routines["procname"] = function(tokenlist) { ... }
  //   self.routines["procname"].special = true
  //    * input is Array (list) of tokens (words, numbers, Arrays)
  //    * used for implementation of special forms (e.g. TO inputs... statements... END)
  //
  //   self.routines["procname"] = function(finput1, finput2, ...) { ... return output; }
  //   self.routines["procname"].noeval = true
  //    * inputs are arity-0 functions that evaluate to string, number Array
  //    * used for short-circuiting evaluation (AND, OR)
  //    * used for repeat evaluation (DO.WHILE, WHILE, DO.UNTIL, UNTIL)
  //


  function mapreduce(list, mapfunc, reducefunc, initial) {
    // NOTE: Uses Array.XXX format to handle array-like types: arguments and strings
    if (initial === (void 0)) {
      return Array.prototype.reduce.call(Array.prototype.map.call(list, mapfunc), reducefunc);
    } else {
      return Array.prototype.reduce.call(Array.prototype.map.call(list, mapfunc), reducefunc, initial);
    }
  }

  function stringify(thing) {

    if (Type(thing) === 'list') {
      return "[" + thing.map(stringify).join(" ") + "]";
    } else {
      return sexpr(thing);
    }
  }

  function stringify_nodecorate(thing) {

    if (Type(thing) === 'list') {
      return thing.map(stringify).join(" ");
    } else {
      return stringify(thing);
    }
  }

  //
  // Procedures and Flow Control
  //
  self.routines["to"] = function(list) {
    var name = sexpr(list.shift());
    if (!name.match(regexIdentifier)) {
      throw new Error(__("Expected identifier"));
    }
    name = name.toLowerCase();

    if (self.routines.hasOwnProperty(name) && self.routines[name].primitive) {
      throw new Error(format(__("Can't redefine primitive {name}"), { name: name.toUpperCase() }));
    }

    var inputs = [];
    var block = [];

    // Process inputs, then the statements of the block
    var state_inputs = true, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (Type(atom) === 'word' && atom.toUpperCase() === 'END') {
        sawEnd = true;
        break;
      } else if (state_inputs && Type(atom) === 'word' && atom.charAt(0) === ':') {
        inputs.push(atom.substring(1));
      } else {
        state_inputs = false;
        block.push(atom);
      }
    }
    if (!sawEnd) {
      throw new Error(__("Expected END"));
    }

    // Closure over inputs and block to handle scopes, arguments and outputs
    var func = function() {

      // Define a new scope
      var scope = new StringMap();
      for (var i = 0; i < inputs.length && i < arguments.length; i += 1) {
        scope.set(inputs[i], {value: arguments[i]});
      }
      self.scopes.push(scope);

      try {
        // Execute the block
        try {
          return self.execute(block);
        } catch (e) {
          // From OUTPUT
          if (e instanceof Output) {
            return e.output;
          } else {
            throw e;
          }
        }
      } finally {
        // Close the scope
        self.scopes.pop();
      }
    };

    self.routines[name] = to_arity(func, inputs.length);

    // For DEF de-serialization
    self.routines[name].inputs = inputs;
    self.routines[name].block = block;

    if (savehook) {
      savehook(name, self.definition(name, self.routines[name]));
    }
  };
  self.routines["to"].special = true;

  self.routines["def"] = function(list) {

    var name = sexpr(list).toLowerCase();
    var proc = self.routines[name];
    if (!proc) { throw new Error(format(__("Don't know how to {name}"), { name: name.toUpperCase() })); }
    if (!proc.inputs) { throw new Error(format(__("Can't show definition of primitive {name}"), { name: name.toUpperCase() })); }

    return self.definition(name, proc);
  };


  //----------------------------------------------------------------------
  //
  // 2. Data Structure Primitives
  //
  //----------------------------------------------------------------------

  //
  // 2.1 Constructors
  //

  self.routines["word"] = function(word1, word2) {
    return arguments.length ? mapreduce(arguments, sexpr, function(a, b) { return a + " " + b; }) : "";
  };

  self.routines["list"] = function(thing1, thing2) {
    return Array.prototype.map.call(arguments, function(x) { return x; }); // Make a copy
  };

  self.routines["sentence"] = self.routines["se"] = function(thing1, thing2) {
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
  };

  self.routines["fput"] = function(thing, list) { list = lexpr(list); list.unshift(thing); return list; };

  self.routines["lput"] = function(thing, list) { list = lexpr(list); list.push(thing); return list; };

  // Not Supported: array
  // Not Supported: mdarray
  // Not Supported: listtoarray
  // Not Supported: arraytolist

  self.routines["combine"] = function(thing1, thing2) {
    if (Type(thing2) !== 'list') {
      return self.routines['word'](thing1, thing2);
    } else {
      return self.routines['fput'](thing1, thing2);
    }
  };

  self.routines["reverse"] = function(list) { return lexpr(list).reverse(); };

  var gensym_index = 0;
  self.routines["gensym"] = function() {
    gensym_index += 1;
    return 'G' + gensym_index;
  };

  //
  // 2.2 Data Selectors
  //

  self.routines["first"] = function(list) { return lexpr(list)[0]; };

  self.routines["firsts"] = function(list) {
    return lexpr(list).map(function(x) { return x[0]; });
  };

  self.routines["last"] = function(list) { list = lexpr(list); return list[list.length - 1]; };

  self.routines["butfirst"] = self.routines["bf"] = function(list) { return lexpr(list).slice(1); };

  self.routines["butfirsts"] = self.routines["bfs"] = function(list) {
    return lexpr(list).map(function(x) { return lexpr(x).slice(1); });
  };

  self.routines["butlast"] = self.routines["bl"] = function(list) { return lexpr(list).slice(0, -1); };

  self.routines["item"] = function(index, list) {
    index = aexpr(index);
    if (index < 1 || index > list.length) {
      throw new Error(__("Index out of bounds"));
    }
    return lexpr(list)[index - 1];
  };

  // Not Supported: mditem

  self.routines["pick"] = function(list) {
    list = lexpr(list);
    var i = Math.floor(self.prng.next() * list.length);
    return list[i];
  };

  self.routines["remove"] = function(thing, list) {
    return lexpr(list).filter(function(x) { return !self.equal(x, thing); });
  };

  self.routines["remdup"] = function(list) {
    var dict = Object.create(null);
    return lexpr(list).filter(function(x) { if (!dict[x]) { dict[x] = true; return true; } else { return false; } });
  };

  // TODO: quoted

  //
  // 2.3 Data Mutators
  //

  // Not Supported: setitem
  // Not Supported: mdsetitem
  // Not Supported: .setfirst
  // Not Supported: .setbf
  // Not Supported: .setitem

  self.routines["push"] = function(stackname, thing) {
    var stack = lexpr(self.getvar(stackname));
    stack.unshift(thing);
    self.setvar(stackname, stack);
  };

  self.routines["pop"] = function(stackname) {
    return self.getvar(stackname).shift();
  };

  self.routines["queue"] = function(stackname, thing) {
    var stack = lexpr(self.getvar(stackname));
    stack.push(thing);
    self.setvar(stackname, stack);
  };

  self.routines["dequeue"] = function(stackname) {
    return self.getvar(stackname).pop();
  };

  //
  // 2.4 Predicates
  //


  self.routines["wordp"] = self.routines["word?"] = function(thing) { return Type(thing) === 'word' ? 1 : 0; };
  self.routines["listp"] = self.routines["list?"] = function(thing) { return Type(thing) === 'list' ? 1 : 0; };
  // Not Supported: arrayp
  self.routines["numberp"] = self.routines["number?"] = function(thing) { return Type(thing) === 'number' ? 1 : 0; };
  self.routines["numberwang"] = function(thing) { return self.prng.next() < 0.5 ? 1 : 0; };

  self.routines["equalp"] = self.routines["equal?"] = function(a, b) { return self.equal(a, b) ? 1 : 0; };
  self.routines["notequalp"] = self.routines["notequal?"] = function(a, b) { return !self.equal(a, b) ? 1 : 0; };

  self.routines["emptyp"] = self.routines["empty?"] = function(thing) { return lexpr(thing).length === 0 ? 1 : 0; };
  self.routines["beforep"] = self.routines["before?"] = function(word1, word2) { return sexpr(word1) < sexpr(word2) ? 1 : 0; };

  // Not Supported: .eq
  // Not Supported: vbarredp

  self.routines["memberp"] = self.routines["member?"] =
        function(thing, list) {
          return lexpr(list).some(function(x) { return self.equal(x, thing); }) ? 1 : 0;
        };


  self.routines["substringp"] = self.routines["substring?"] =
        function(word1, word2) {
          return sexpr(word2).indexOf(sexpr(word1)) !== -1 ? 1 : 0;
        };

  //
  // 2.5 Queries
  //

  self.routines["count"] = function(thing) { return lexpr(thing).length; };
  self.routines["ascii"] = function(chr) { return sexpr(chr).charCodeAt(0); };
  // Not Supported: rawascii
  self.routines["char"] = function(integer) { return String.fromCharCode(aexpr(integer)); };
  self.routines["lowercase"] = function(word) { return sexpr(word).toLowerCase(); };
  self.routines["uppercase"] = function(word) { return sexpr(word).toUpperCase(); };
  self.routines["standout"] = function(word) { return sexpr(word); }; // For compat
  // Not Supported: parse
  // Not Supported: runparse

  //----------------------------------------------------------------------
  //
  // 3. Communication
  //
  //----------------------------------------------------------------------

  // 3.1 Transmitters

  self.routines["print"] = self.routines["pr"] = function(thing) {
    var s = Array.prototype.map.call(arguments, stringify_nodecorate).join(" ");
    self.stream.write(s, "\n");
  };
  self.routines["type"] = function(thing) {
    var s = Array.prototype.map.call(arguments, stringify_nodecorate).join("");
    self.stream.write(s);
  };
  self.routines["show"] = function(thing) {
    var s = Array.prototype.map.call(arguments, stringify).join(" ");
    self.stream.write(s, "\n");
  };

  // 3.2 Receivers

  // Not Supported: readlist

  self.routines["readword"] = function() {
    if (arguments.length > 0) {
      return stream.read(sexpr(arguments[0]));
    } else {
      return stream.read();
    }
  };


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

  self.routines["cleartext"] = self.routines["ct"] = function() {
    self.stream.clear();
  };

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


  self.routines["sum"] = function(a, b) {
    return mapreduce(arguments, aexpr, function(a, b) { return a + b; }, 0);
  };

  self.routines["difference"] = function(a, b) {
    return aexpr(a) - aexpr(b);
  };

  self.routines["minus"] = function(a) { return -aexpr(a); };

  self.routines["product"] = function(a, b) {
    return mapreduce(arguments, aexpr, function(a, b) { return a * b; }, 1);
  };

  self.routines["quotient"] = function(a, b) {
    if (b !== (void 0)) {
      return aexpr(a) / aexpr(b);
    } else {
      return 1 / aexpr(a);
    }
  };

  self.routines["remainder"] = function(num1, num2) {
    return aexpr(num1) % aexpr(num2);
  };
  self.routines["modulo"] = function(num1, num2) {
    num1 = aexpr(num1);
    num2 = aexpr(num2);
    return Math.abs(num1 % num2) * (num2 < 0 ? -1 : 1);
  };

  self.routines["power"] = function(a, b) { return Math.pow(aexpr(a), aexpr(b)); };
  self.routines["sqrt"] = function(a) { return Math.sqrt(aexpr(a)); };
  self.routines["exp"] = function(a) { return Math.exp(aexpr(a)); };
  self.routines["log10"] = function(a) { return Math.log(aexpr(a)) / Math.LN10; };
  self.routines["ln"] = function(a) { return Math.log(aexpr(a)); };


  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  self.routines["arctan"] = function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return rad2deg(Math.atan2(y, x));
    } else {
      return rad2deg(Math.atan(aexpr(a)));
    }
  };

  self.routines["sin"] = function(a) { return Math.sin(deg2rad(aexpr(a))); };
  self.routines["cos"] = function(a) { return Math.cos(deg2rad(aexpr(a))); };
  self.routines["tan"] = function(a) { return Math.tan(deg2rad(aexpr(a))); };

  self.routines["radarctan"] = function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return Math.atan2(y, x);
    } else {
      return Math.atan(aexpr(a));
    }
  };

  self.routines["radsin"] = function(a) { return Math.sin(aexpr(a)); };
  self.routines["radcos"] = function(a) { return Math.cos(aexpr(a)); };
  self.routines["radtan"] = function(a) { return Math.tan(aexpr(a)); };

  self.routines["abs"] = function(a) { return Math.abs(aexpr(a)); };


  function truncate(x) { return parseInt(x, 10); }

  self.routines["int"] = function(a) { return truncate(aexpr(a)); };
  self.routines["round"] = function(a) { return Math.round(aexpr(a)); };

  self.routines["iseq"] = function(a, b) {
    a = truncate(aexpr(a));
    b = truncate(aexpr(b));
    var step = (a < b) ? 1 : -1;
    var list = [];
    for (var i = a; (step > 0) ? (i <= b) : (i >= b); i += step) {
      list.push(i);
    }
    return list;
  };


  self.routines["rseq"] = function(from, to, count) {
    from = aexpr(from);
    to = aexpr(to);
    count = truncate(aexpr(count));
    var step = (to - from) / (count - 1);
    var list = [];
    for (var i = from; (step > 0) ? (i <= to) : (i >= to); i += step) {
      list.push(i);
    }
    return list;
  };

  // 4.2 Numeric Predicates

  self.routines["greaterp"] = self.routines["greater?"] = function(a, b) { return aexpr(a) > aexpr(b) ? 1 : 0; };
  self.routines["greaterequalp"] = self.routines["greaterequal?"] = function(a, b) { return aexpr(a) >= aexpr(b) ? 1 : 0; };
  self.routines["lessp"] = self.routines["less?"] = function(a, b) { return aexpr(a) < aexpr(b) ? 1 : 0; };
  self.routines["lessequalp"] = self.routines["lessequal?"] = function(a, b) { return aexpr(a) <= aexpr(b) ? 1 : 0; };

  // 4.3 Random Numbers

  self.routines["random"] = function(max) {
    max = aexpr(max);
    return Math.floor(self.prng.next() * max);
  };

  self.routines["rerandom"] = function() {
    var seed = (arguments.length > 0) ? aexpr(arguments[0]) : 2345678901;
    return self.prng.seed(seed);
  };

  // 4.4 Print Formatting

  self.routines["form"] = function(num, width, precision) {
    num = aexpr(num);
    width = aexpr(width);
    precision = aexpr(precision);

    var str = num.toFixed(precision);
    if (str.length < width) {
      str = Array(1 + width - str.length).join(' ') + str;
    }
    return str;
  };

  // 4.5 Bitwise Operations


  self.routines["bitand"] = function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a & b; }, -1);
  };
  self.routines["bitor"] = function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a | b; }, 0);
  };
  self.routines["bitxor"] = function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a ^ b; }, 0);
  };
  self.routines["bitnot"] = function(num) {
    return ~aexpr(num);
  };


  self.routines["ashift"] = function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >> -num2;
  };

  self.routines["lshift"] = function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >>> -num2;
  };


  //----------------------------------------------------------------------
  //
  // 5. Logical Operations
  //
  //----------------------------------------------------------------------

  self.routines["true"] = function() { return 1; };
  self.routines["false"] = function() { return 0; };

  self.routines["and"] = function(a, b) {
    return Array.prototype.every.call(arguments, function(f) { return f(); }) ? 1 : 0;
  };
  self.routines["and"].noeval = true;

  self.routines["or"] = function(a, b) {
    return Array.prototype.some.call(arguments, function(f) { return f(); }) ? 1 : 0;
  };
  self.routines["or"].noeval = true;

  self.routines["xor"] = function(a, b) {
    return mapreduce(arguments, aexpr, function(a, b) { return Boolean(a) !== Boolean(b); }, 0) ? 1 : 0;
  };
  self.routines["not"] = function(a) {
    return !aexpr(a) ? 1 : 0;
  };

  //----------------------------------------------------------------------
  //
  // 6. Graphics
  //
  //----------------------------------------------------------------------
  // 6.1 Turtle Motion

  self.routines["forward"] = self.routines["fd"] = function(a) { turtle.move(aexpr(a)); };
  self.routines["back"] = self.routines["bk"] = function(a) { turtle.move(-aexpr(a)); };
  self.routines["left"] = self.routines["lt"] = function(a) { turtle.turn(-aexpr(a)); };
  self.routines["right"] = self.routines["rt"] = function(a) { turtle.turn(aexpr(a)); };

  self.routines["setpos"] = function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Expected list of length 2")); }
    turtle.setposition(aexpr(l[0]), aexpr(l[1]));
  };
  self.routines["setxy"] = function(x, y) { turtle.setposition(aexpr(x), aexpr(y)); };
  self.routines["setx"] = function(x) { turtle.setposition(aexpr(x), (void 0)); }; // TODO: Replace with ...?
  self.routines["sety"] = function(y) { turtle.setposition((void 0), aexpr(y)); };
  self.routines["setheading"] = self.routines["seth"] = function(a) { turtle.setheading(aexpr(a)); };

  self.routines["home"] = function() { turtle.home(); };

  self.routines["arc"] = function(angle, radius) { turtle.arc(aexpr(angle), aexpr(radius)); };

  //
  // 6.2 Turtle Motion Queries
  //

  self.routines["pos"] = function() { var l = turtle.getxy(); return [l[0], l[1]]; };
  self.routines["xcor"] = function() { var l = turtle.getxy(); return l[0]; };
  self.routines["ycor"] = function() { var l = turtle.getxy(); return l[1]; };
  self.routines["heading"] = function() { return turtle.getheading(); };
  self.routines["towards"] = function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Expected list of length 2")); }
    return turtle.towards(aexpr(l[0]), aexpr(l[1]));
  };

  // Not Supported: scrunch

  //
  // 6.3 Turtle and Window Control
  //

  self.routines["showturtle"] = self.routines["st"] = function() { turtle.showturtle(); };
  self.routines["hideturtle"] = self.routines["ht"] = function() { turtle.hideturtle(); };
  self.routines["clean"] = function() { turtle.clear(); };
  self.routines["clearscreen"] = self.routines["cs"] = function() { turtle.clearscreen(); };

  self.routines["wrap"] = function() { turtle.setturtlemode('wrap'); };
  self.routines["window"] = function() { turtle.setturtlemode('window'); };
  self.routines["fence"] = function() { turtle.setturtlemode('fence'); };

  // Not Supported: fill
  // Not Supported: filled

  self.routines["label"] = function(a) {
    var s = Array.prototype.map.call(arguments, stringify_nodecorate).join(" ");
    turtle.drawtext(s);
  };

  self.routines["setlabelheight"] = function(a) { turtle.setfontsize(aexpr(a)); };

  // Not Supported: textscreen
  // Not Supported: fullscreen
  // Not Supported: splitscreen
  // Not Supported: setscrunch
  // Not Supported: refresh
  // Not Supported: norefresh

  //
  // 6.4 Turtle and Window Queries
  //

  self.routines["shownp"] = self.routines["shown?"] = function() {
    return turtle.isturtlevisible() ? 1 : 0;
  };

  // Not Supported: screenmode

  self.routines["turtlemode"] = function() {
    return turtle.getturtlemode().toUpperCase();
  };

  self.routines["labelsize"] = function() {
    return [turtle.getfontsize(), turtle.getfontsize()];
  };

  //
  // 6.5 Pen and Background Control
  //
  self.routines["pendown"] = self.routines["pd"] = function() { turtle.pendown(); };
  self.routines["penup"] = self.routines["pu"] = function() { turtle.penup(); };

  self.routines["penpaint"] = self.routines["ppt"] = function() { turtle.setpenmode('paint'); };
  self.routines["penerase"] = self.routines["pe"] = function() { turtle.setpenmode('erase'); };
  self.routines["penreverse"] = self.routines["px"] = function() { turtle.setpenmode('reverse'); };

  self.routines["setpencolor"] = self.routines["setpc"] = self.routines["setcolor"] = function(a) {
    if (arguments.length === 3) {
      var r = Math.round(aexpr(arguments[0]) * 255 / 99);
      var g = Math.round(aexpr(arguments[1]) * 255 / 99);
      var b = Math.round(aexpr(arguments[2]) * 255 / 99);
      var rr = (r < 16 ? "0" : "") + r.toString(16);
      var gg = (g < 16 ? "0" : "") + g.toString(16);
      var bb = (b < 16 ? "0" : "") + b.toString(16);
      turtle.setcolor('#' + rr + gg + bb);
    } else {
      turtle.setcolor(sexpr(a));
    }
  };

  // Not Supported: setpallete

  self.routines["setpensize"] = self.routines["setwidth"] = self.routines["setpw"] = function(a) {
    if (Type(a) === 'list') {
      turtle.setwidth(aexpr(a[0]));
    } else {
      turtle.setwidth(aexpr(a));
    }
  };

  // Not Supported: setpenpattern
  // Not Supported: setpen
  // Not Supported: setbackground

  //
  // 6.6 Pen Queries
  //

  self.routines["pendownp"] = self.routines["pendown?"] = function() {
    return turtle.ispendown() ? 1 : 0;
  };

  self.routines["penmode"] = self.routines["pc"] = function() {
    return turtle.getpenmode().toUpperCase();
  };

  self.routines["pencolor"] = self.routines["pc"] = function() {
    return turtle.getcolor();
  };

  // Not Supported: palette

  self.routines["pensize"] = function() {
    return [turtle.getwidth(), turtle.getwidth()];
  };

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

  self.routines["copydef"] = function(newname, oldname) {

    newname = sexpr(newname).toLowerCase();
    oldname = sexpr(oldname).toLowerCase();

    if (!self.routines.hasOwnProperty(oldname)) {
      throw new Error(format(__("Don't know how to {name}"), { name: oldname.toUpperCase() }));
    }

    if (self.routines.hasOwnProperty(newname)) {
      if (self.routines[newname].special) {
        throw new Error(format(__("Can't overwrite special form {name}"), { name: newname.toUpperCase() }));
      }
      if (self.routines[newname].primitive && !self.maybegetvar("redefp")) {
        throw new Error(__("Can't overwrite primitives unless REDEFP is TRUE"));
      }
    }

    self.routines[newname] = self.routines[oldname];
  };


  // 7.2 Variable Definition

  self.routines["make"] = function(varname, value) {
    self.setvar(sexpr(varname), value);
  };

  self.routines["name"] = function(value, varname) {
    self.setvar(sexpr(varname), value);
  };

  self.routines["local"] = function(varname) {
    var localscope = self.scopes[self.scopes.length - 1];
    Array.prototype.forEach.call(arguments, function(name) { localscope.set(sexpr(name).toLowerCase(), {value: (void 0)}); });
  };

  self.routines["localmake"] = function(varname, value) {
    var localscope = self.scopes[self.scopes.length - 1];
    localscope.set(sexpr(varname).toLowerCase(), {value: value});
  };

  self.routines["thing"] = function(varname) {
    return self.getvar(sexpr(varname));
  };

  self.routines["global"] = function(varname) {
    var globalscope = self.scopes[0];
    Array.prototype.forEach.call(arguments, function(name) { globalscope.set(sexpr(name).toLowerCase(), {value: (void 0)}); });
  };

  //
  // 7.3 Property Lists
  //

  self.routines["pprop"] = function(plistname, propname, value) {
    plistname = sexpr(plistname).toLowerCase();
    propname = sexpr(propname).toLowerCase();
    var plist = self.plists.get(plistname);
    if (!plist) {
      plist = new StringMap();
      self.plists.set(plistname, plist);
    }
    plist.set(propname, value);
  };

  self.routines["gprop"] = function(plistname, propname) {
    plistname = sexpr(plistname).toLowerCase();
    propname = sexpr(propname).toLowerCase();
    var plist = self.plists.get(plistname);
    if (!plist || !plist.has(propname)) {
      return [];
    }
    return plist.get(propname);
  };

  self.routines["remprop"] = function(plistname, propname) {
    plistname = sexpr(plistname).toLowerCase();
    propname = sexpr(propname).toLowerCase();
    var plist = self.plists.get(plistname);
    if (plist) {
      plist['delete'](propname);
      if (plist.keys().length === 0) {
        // TODO: Do this? Loses state, e.g. unburies if buried
        self.plists['delete'](plistname);
      }
    }
  };

  self.routines["plist"] = function(plistname) {
    plistname = sexpr(plistname).toLowerCase();
    var plist = self.plists.get(plistname);
    if (!plist) {
      return [];
    }

    var result = [];
    plist.keys().forEach(function (key) {
      result.push(key);
      result.push(copy(plist.get(key)));
    });
    return result;
  };

  //
  // 7.4 Workspace Predicates
  //

  self.routines["procedurep"] = self.routines["procedure?"] = function(name) {
    name = sexpr(name).toLowerCase();
    return typeof self.routines[name] === 'function' ? 1 : 0;
  };

  self.routines["primitivep"] = self.routines["primitive?"] = function(name) {
    name = sexpr(name).toLowerCase();
    return (typeof self.routines[name] === 'function' &&
            self.routines[name].primitive) ? 1 : 0;
  };

  self.routines["definedp"] = self.routines["defined?"] = function(name) {
    name = sexpr(name).toLowerCase();
    return (typeof self.routines[name] === 'function' &&
            !self.routines[name].primitive) ? 1 : 0;
  };

  self.routines["namep"] = self.routines["name?"] = function(varname) {
    try {
      return self.getvar(sexpr(varname)) !== (void 0) ? 1 : 0;
    } catch (e) {
      return 0;
    }
  };

  self.routines["plistp"] = self.routines["plist?"] = function(plistname) {
    plistname = sexpr(plistname).toLowerCase();
    return self.plists.has(plistname) ? 1 : 0;
  };

  //
  // 7.5 Workspace Queries
  //

  self.routines["contents"] = function() {
    return [
      Object.keys(self.routines).filter(function(x) {
        return !self.routines[x].primitive && !self.routines[x].buried; }),
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) { return !scope.get(x).buried; })); }, []),
      self.plists.keys().filter(function(x) { return !self.plists.get(x).buried; })
    ];
  };

  self.routines["buried"] = function() {
    return [
      Object.keys(self.routines).filter(function(x) {
        return !self.routines[x].primitive && self.routines[x].buried; }),
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) { return scope.get(x).buried; })); }, []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).buried; })
    ];
  };

  self.routines["traced"] = function() {
    return [
      Object.keys(self.routines).filter(function(x) {
        return !self.routines[x].primitive && self.routines[x].traced; }),
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) { return scope.get(x).traced; })); }, []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).traced; })
    ];
  };

  self.routines["stepped"] = function() {
    return [
      Object.keys(self.routines).filter(function(x) {
        return !self.routines[x].primitive && self.routines[x].stepped; }),
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) { return scope.get(x).stepped; })); }, []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).stepped; })
    ];
  };

  self.routines["procedures"] = function() {
    return Object.keys(self.routines).filter(function(x) {
      return !self.routines[x].primitive && !self.routines[x].buried;
    });
  };

  self.routines["primitives"] = function() {
    return Object.keys(self.routines).filter(function(x) {
      return self.routines[x].primitive & !self.routines[x].buried;
    });
  };

  self.routines["globals"] = function() {
    var globalscope = self.scopes[0];
    return globalscope.keys().filter(function (x) {
      return !globalscope.get(x).buried;
    });
  };

  self.routines["names"] = function() {
    return [
      [],
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) {
          return !scope.get(x).buried; })); }, [])
    ];
  };

  self.routines["plists"] = function() {
    return [
      [],
      [],
      self.plists.keys().filter(function(x) {
        return !self.plists.get(x).buried; })
    ];
  };

  self.routines["namelist"] = function(varname) {
    if (Type(varname) === 'list') {
      varname = lexpr(varname);
    } else {
      varname = [sexpr(varname)];
    }
    return [[], varname];
  };

  self.routines["pllist"] = function(plname) {
    if (Type(plname) === 'list') {
      plname = lexpr(plname);
    } else {
      plname = [sexpr(plname)];
    }
    return [[], [], plname];
  };


  // Not Supported: arity
  // Not Supported: nodes

  // 7.6 Workspace Inspection

  //
  // 7.7 Workspace Control
  //

  self.routines["erase"] = function(list) {
    list = lexpr(list);

    // Delete procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name).toLowerCase();
        if (self.routines.hasOwnProperty(name)) {
          if (self.routines[name].special) {
            throw new Error(format(__("Can't ERASE special form {name}"), { name: name.toUpperCase() }));
          }
          if (!self.routines[name].primitive || self.maybegetvar("redefp")) {
            delete self.routines[name];
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
          name = sexpr(name).toLowerCase();
          scope['delete'](name);
        });
      });
    }

    // Delete property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name).toLowerCase();
        self.plists['delete'](name);
      });
    }
  };

  // TODO: lots of redundant logic here -- clean this up
  self.routines["erall"] = function() {
    Object.keys(self.routines).filter(function(x) {
      return !self.routines[x].primitive && !self.routines[x].buried;
    }).forEach(function(name) {
        delete self.routines[name];
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
    }).forEach(function (name) {
      self.plists['delete'](name);
    });
  };

  self.routines["erps"] = function() {
    Object.keys(self.routines).filter(function(x) {
      return !self.routines[x].primitive && !self.routines[x].buried;
    }).forEach(function(name) {
        delete self.routines[name];
    });
  };

  self.routines["erns"] = function() {
    self.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });
  };

  self.routines["erpls"] = function() {
    self.plists.keys().filter(function(x) {
      return !self.plists.get(x).buried;
    }).forEach(function (key) {
      self.plists['delete'](key);
    });
  };

  self.routines["ern"] = function(varname) {
    var varnamelist;
    if (Type(varname) === 'list') {
      varnamelist = lexpr(varname);
    } else {
      varnamelist = [sexpr(varname)];
    }

    self.scopes.forEach(function(scope) {
      varnamelist.forEach(function(name) {
        name = sexpr(name).toLowerCase();
        scope['delete'](name);
      });
    });
  };

  self.routines["erpl"] = function(plname) {
    var plnamelist;
    if (Type(plname) === 'list') {
      plnamelist = lexpr(plname);
    } else {
      plnamelist = [sexpr(plname)];
    }

    plnamelist.forEach(function(name) {
      name = sexpr(name).toLowerCase();
      self.plists['delete'](name);
    });
  };

  self.routines["bury"] = function(list) {
    list = lexpr(list);

    // Bury procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name).toLowerCase();
        if (self.routines.hasOwnProperty(name)) {
          self.routines[name].buried = true;
        }
      });
    }

    // Bury variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name).toLowerCase();
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
        name = sexpr(name).toLowerCase();
        if (self.plists.has(name)) {
          self.plists.get(name).buried = true;
        }
      });
    }
  };

  self.routines["buryall"] = function() {
    Object.keys(self.routines).forEach(function(name) {
      self.routines[name].buried = true;
    });

    self.scopes.forEach(function(scope) {
      scope.keys().forEach(function(name) {
        scope.get(name).buried = true;
      });
    });

    self.plists.keys().forEach(function (name) {
      self.plists.get(name).buried = true;
    });
  };

  // Not Supported: buryname

  self.routines["unbury"] = function(list) {
    list = lexpr(list);

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name).toLowerCase();
        if (self.routines.hasOwnProperty(name)) {
          self.routines[name].buried = false;
        }
      });
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name).toLowerCase();
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
        name = sexpr(name).toLowerCase();
        if (self.plists.has(name)) {
          self.plists.get(name).buried = false;
        }
      });
    }
  };

  self.routines["unburyall"] = function() {
    Object.keys(self.routines).forEach(function(name) {
      self.routines[name].buried = false;
    });

    self.scopes.forEach(function(scope) {
      scope.keys().forEach(function(name) {
        scope.get(name).buried = false;
      });
    });

    self.plists.keys().forEach(function (name) {
      self.plists.get(name).buried = false;
    });
  };

  // Not Supported: unburyname

  self.routines["buriedp"] = self.routines["buried?"] = function(list) {
    list = lexpr(list);
    var name;

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      if (procs.length) {
        name = sexpr(procs[0]).toLowerCase();
        return (self.routines.hasOwnProperty(name) && self.routines[name].buried) ? 1 : 0;
      }
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      if (vars.length) {
        name = sexpr(vars[0]).toLowerCase();
        // TODO: global only?
        return (self.scopes[0].has(name) && self.scopes[0].get(name).buried) ? 1 : 0;
      }
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      if (plists.length) {
        name = sexpr(plists[0]).toLowerCase();
        return (self.plists.has(name) && self.plists.get(name).buried) ? 1 : 0;
      }
    }

    return 0;
  };

  //----------------------------------------------------------------------
  //
  // 8. Control Structures
  //
  //----------------------------------------------------------------------

  //
  // 8.1 Control
  //


  self.routines["run"] = function(statements) {
    statements = reparse(lexpr(statements));
    self.execute(statements);
  };

  self.routines["runresult"] = function(statements) {
    statements = reparse(lexpr(statements));
    var result = self.execute(statements, {returnResult: true});
    if (result !== (void 0)) {
      return [result];
    } else {
      return [];
    }
  };

  self.routines["repeat"] = function(count, statements) {
    count = aexpr(count);
    statements = reparse(lexpr(statements));
    for (var i = 1; i <= count; ++i) {
      var old_repcount = self.repcount;
      self.repcount = i;
      try {
        self.execute(statements);
      } finally {
        self.repcount = old_repcount;
      }
    }
  };

  self.routines["forever"] = function(statements) {
    statements = reparse(lexpr(statements));
    for (var i = 1; true; ++i) {
      var old_repcount = self.repcount;
      self.repcount = i;
      try {
        self.execute(statements);
      } finally {
        self.repcount = old_repcount;
      }
    }
  };

  self.routines["repcount"] = function() {
    return self.repcount;
  };

  self.routines["if"] = function(test, statements) {
    test = aexpr(test);
    statements = reparse(lexpr(statements));

    if (test) { self.execute(statements); }
  };

  self.routines["ifelse"] = function(test, statements1, statements2) {
    test = aexpr(test);
    statements1 = reparse(lexpr(statements1));
    statements2 = reparse(lexpr(statements2));

    self.execute(test ? statements1 : statements2);
  };

  self.routines["test"] = function(tf) {
    tf = aexpr(tf);
    // NOTE: A property on the scope, not within the scope
    self.scopes[self.scopes.length - 1]._test = tf;
  };

  self.routines["iftrue"] = self.routines["ift"] = function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (tf) { self.execute(statements); }
  };

  self.routines["iffalse"] = self.routines["iff"] = function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (!tf) { self.execute(statements); }
  };

  self.routines["stop"] = function() {
    throw new Output();
  };

  self.routines["output"] = self.routines["op"] = function(atom) {
    throw new Output(atom);
  };

  // TODO: catch
  // TODO: throw
  // TODO: error
  // Not Supported: pause
  // Not Supported: continue
  // Not Supported: wait

  self.routines["bye"] = function() {
    throw new Bye();
  };

  self.routines[".maybeoutput"] = function(value) {
    if (value !== (void 0)) {
      throw new Output(value);
    } else {
      throw new Output();
    }
  };

  // Not Supported: goto
  // Not Supported: tag

  self.routines["ignore"] = function(value) {
  };

  // Not Supported: `

  self.routines["for"] = function(control, statements) {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    function sign(x) { return x < 0 ? -1 : x > 0 ? 1 : 0; }

    var varname = sexpr(control.shift());
    var start = aexpr(self.evaluateExpression(control));
    var limit = aexpr(self.evaluateExpression(control));

    var step;
    var current = start;
    while (sign(current - limit) !== sign(step)) {
      self.setvar(varname, current);
      self.execute(statements);

      step = (control.length) ? aexpr(self.evaluateExpression(control.slice())) : sign(limit - start);
      current += step;
    }
  };

  function checkevalblock(block) {
    block = block();
    if (Type(block) === 'list') { return block; }
    throw new Error(__("Expected block"));
  }

  self.routines["do.while"] = function(block, tf) {
    block = checkevalblock(block);

    do {
      self.execute(block);
    } while (tf());
  };
  self.routines["do.while"].noeval = true;

  self.routines["while"] = function(tf, block) {
    block = checkevalblock(block);

    while (tf()) {
      self.execute(block);
    }
  };
  self.routines["while"].noeval = true;

  self.routines["do.until"] = function(block, tf) {
    block = checkevalblock(block);

    do {
      self.execute(block);
    } while (!tf());
  };
  self.routines["do.until"].noeval = true;

  self.routines["until"] = function(tf, block) {
    block = checkevalblock(block);

    while (!tf()) {
      self.execute(block);
    }
  };
  self.routines["until"].noeval = true;

  // Not Supported: case
  // Not Supported: cond


  //
  // 8.2 Template-based Iteration
  //


  //
  // Higher order functions
  //

  // TODO: multiple inputs

  self.routines["apply"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "APPLY", name: procname.toUpperCase() })); }

    return routine.apply(null, lexpr(list));
  };

  self.routines["invoke"] = function(procname) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "INVOKE", name: procname.toUpperCase() })); }

    var args = [];
    for (var i = 1; i < arguments.length; i += 1) {
      args.push(arguments[i]);
    }

    return routine.apply(null, args);
  };

  self.routines["foreach"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "FOREACH", name: procname.toUpperCase() })); }

    lexpr(list).forEach(routine);
  };


  self.routines["map"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "MAP", name: procname.toUpperCase() })); }

    return lexpr(list).map(routine);
  };

  // Not Supported: map.se

  self.routines["filter"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "FILTER", name: procname.toUpperCase() })); }

    return lexpr(list).filter(function(x) { return routine(x); });
  };

  self.routines["find"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();

    var routine = self.routines[procname];
    if (!routine) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (routine.special || routine.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "FIND", name: procname.toUpperCase() })); }

    list = lexpr(list);
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (routine(item)) {
        return item;
      }
    }
    return [];
  };

  self.routines["reduce"] = function(procname, list) {
    procname = sexpr(procname).toLowerCase();
    list = lexpr(list);
    var value = arguments[2] !== (void 0) ? arguments[2] : list.shift();

    var procedure = self.routines[procname];
    if (!procedure) { throw new Error(format(__("Don't know how to {name}"), { name: procname.toUpperCase() })); }
    if (procedure.special || procedure.noeval) { throw new Error(format(__("Can't apply {proc} to special {name}"), { proc: "REDUCE", name: procname.toUpperCase() })); }

    // NOTE: Can't use procedure directly as reduce calls
    // targets w/ additional args and defaults initial value to undefined
    return list.reduce(function(a, b) { return procedure(a, b); }, value);
  };

  // Not Supported: crossmap
  // Not Supported: cascade
  // Not Supported: cascade.2
  // Not Supported: transfer


  //----------------------------------------------------------------------
  // Mark built-ins as such
  //----------------------------------------------------------------------

  Object.keys(self.routines).forEach(function(x) { self.routines[x].primitive = true; });
}
