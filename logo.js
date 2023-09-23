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

function LogoInterpreter(turtle, stream, savehook) {
  'use strict';

  const self = this;

  const UNARY_MINUS = '<UNARYMINUS>'; // Must not parse as a word

  const ERRORS = {
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

  function saveproc(name, def) {
    if (savehook)
      savehook(String(name).toLowerCase(), def);
  }

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, (m, n, o) => {
      const s = (n === '_PROC_') ? self.stack[self.stack.length - 1] : String(params[n]);
      switch (o) {
        case ':U': return s.toUpperCase();
        case ':L': return s.toLowerCase();
        default: return s;
      }
    });
  }

  // To support localized/customized messages, assign a lookup function:
  // instance.localize = s => {
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
    const error = new LogoError('ERROR', undefined, format(__(string), params));
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
  // logo.keywordAlias = name => {
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

  // Returns a Promise that will resolve as soon as possible while ensuring
  // that control is yielded back to the event loop at least every 20ms.
  let lastTimeYielded = Date.now();
  function promiseYield() {
    const currentTime = Date.now();
    if (currentTime - lastTimeYielded > 20) {
      lastTimeYielded = currentTime;
      return new Promise(resolve => {
        setTimeout(resolve, 0);
      });
    } else {
      return Promise.resolve();
    }
  }

  function promiseYieldTime(msec) {
    // Not adding msec would generally cause a yield right after the wait.
    // Adding msec just once might cause additional tear of animations.
    lastTimeYielded = Date.now() + msec * 2;
    return new Promise(resolve => {
      setTimeout(resolve, msec);
    });
  }

  // Based on: https://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  // Argument is `$$func$$` to avoid issue if passed function is named `func`.
  function to_arity($$func$$, arity) {
    const parms = [];

    if ($$func$$.length === arity)
      return $$func$$;

    for (let i = 0; i < arity; ++i)
      parms.push('a' + i);

    const f = eval('(function ' + $$func$$.name + '(' + parms.join(',') + ')' +
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
  class PRNG {
    constructor(seed) {
      this.S = seed & 0x7fffffff, // seed
      this.A = 48271, // const
      this.M = 0x7fffffff, // const
      this.Q = this.M / this.A, // const
      this.R = this.M % this.A; // const

      this.next();
    }

    next() {
      const hi = this.S / this.Q,
            lo = this.S % this.Q,
            t = this.A * lo - this.R * hi;
      this.S = (t > 0) ? t : t + this.M;
      this.last = this.S / this.M;
      return this.last;
    }

    seed(x) {
      this.S = x & 0x7fffffff;
    }
  }

  class StringMap {
    constructor(case_fold) {
      this._map = new Map();
      this._case_fold = case_fold;
    }
    get(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.get(key);
    }
    set(key, value) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      this._map.set(key, value);
    }
    has(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.has(key);
    }
    delete(key) {
      key = this._case_fold ? String(key).toLowerCase() : String(key);
      return this._map.delete(key);
    }
    keys() {
      const keys = [];
      this._map.forEach((value, key) => { keys.push(key); });
      return keys;
    }
    empty() {
      return this._map.size === 0;
    }
    forEach(fn) {
      return this._map.forEach((value, key) => { fn(key, value); });
    }
  }

  class LogoArray {
    constructor(size, origin) {
      this._array = [];
      this._array.length = size;
      for (let i = 0; i < this._array.length; ++i)
        this._array[i] = [];
      this._origin = origin;
    }
    static from(list, origin) {
      const array = new LogoArray(0, origin);
      array._array = [...list];
      return array;
    }

    item(i) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      return this._array[i];
    }
    setItem(i, v) {
      i = Number(i)|0;
      i -= this._origin;
      if (i < 0 || i >= this._array.length)
        throw err("{_PROC_}: Index out of bounds", ERRORS.BAD_INPUT);
      this._array[i] = v;
    }
    get list() {
      return this._array;
    }
    get origin() {
      return this._origin;
    }
    get length() {
      return this._array.length;
    }
  }

  class Stream {
    constructor(string) {
      this._string = string;
      this._index = 0;
      this._skip();
    }
    get eof() {
      return this._index >= this._string.length;
    }
    peek() {
      let c = this._string.charAt(this._index);
      if (c === '\\')
        c += this._string.charAt(this._index + 1);
      return c;
    }
    get() {
      const c = this._next();
      this._skip();
      return c;
    }
    _next() {
      let c = this._string.charAt(this._index++);
      if (c === '\\')
        c += this._string.charAt(this._index++);
      return c;
    }
    _skip() {
      while (!this.eof) {
        let c = this.peek();
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
    }
    rest() {
      return this._string.substring(this._index);
    }
  }

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
  class Output {
    constructor(output) { this.output = output; }
    toString() { return this.output; }
    valueOf() { return this.output; }
  }

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

    let atoms = [],
        prev, r;

    const stream = new Stream(string);
    while (stream.peek()) {
      let atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      const leading_space = isWS(stream.peek());
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
      } else if (OPERATOR_CHARS.includes(stream.peek())) {
        atom = parseOperator(stream);
        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by a
        // space and followed by a nonspace.

        if (atom === '-') {
          const trailing_space = isWS(stream.peek());
          if (prev === undefined ||
              (Type(prev) === 'word' && isInfix(prev)) ||
              (Type(prev) === 'word' && prev === '(') ||
              (leading_space && !trailing_space)) {
            atom = UNARY_MINUS;
          }
        }
      } else if (!WORD_DELIMITER.includes(stream.peek())) {
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

  const WS_CHARS = ' \f\n\r\t\v';
  // OK to call with `undefined` (returns false)
  function isWS(c) {
    return c && WS_CHARS.includes(c);
  }

  // "After a quotation mark outside square brackets, a word is
  // delimited by a space, a square bracket, or a parenthesis."
  const QUOTED_DELIMITER = WS_CHARS + '[](){}';
  function parseQuoted(stream) {
    let word = '';
    while (!stream.eof && !QUOTED_DELIMITER.includes(stream.peek())) {
      const c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // Non-standard: U+2190 ... U+2193 are arrows, parsed as own-words.
  const OWNWORD_CHARS = '\u2190\u2191\u2192\u2193';
  function isOwnWord(c) {
    return OWNWORD_CHARS.includes(c);
  }

  // "A word not after a quotation mark or inside square brackets is
  // delimited by a space, a bracket, a parenthesis, or an infix
  // operator +-*/=<>. Note that words following colons are in this
  // category. Note that quote and colon are not delimiters."
  const WORD_DELIMITER = WS_CHARS + '[](){}+-*/%^=<>';
  function parseWord(stream) {
    let word = '';
    while (!stream.eof && !WORD_DELIMITER.includes(stream.peek())) {
      const c = stream.get();
      word += (c.charAt(0) === '\\') ? c.charAt(1) : c.charAt(0);
    }
    return word;
  }

  // "Each infix operator character is a word in itself, except that
  // the two-character sequences <=, >=, and <> (the latter meaning
  // not-equal) with no intervening space are recognized as a single
  // word."
  const OPERATOR_CHARS = '+-*/%^=<>[]{}()';
  function parseOperator(stream) {
    let word = '';
    if (OPERATOR_CHARS.includes(stream.peek()))
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
    let word = '';
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
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$/);
  }

  function parseInteger(stream) {
    let word = '';
    if (stream.peek() === '-')
      word += stream.get();
    while (inRange(stream.peek(), '0', '9'))
      word += stream.get();
    return word;
  }

  function parseList(stream) {
    const list = [];
    let atom = '',
        c, r;

    for (;;) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && !'[]{}'.includes(c)) {
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
    const list = [];
    let origin = 1,
        atom = '',
        c, r;

    for (;;) {
      do {
        c = stream.get();
      } while (isWS(c));

      while (c && !isWS(c) && !'[]{}'.includes(c)) {
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
    const lval = lvalue(name);
    return lval ? lval.value : undefined;
  }

  function getvar(name) {
    const value = maybegetvar(name);
    if (value !== undefined)
      return value;
    throw err("Don't know about variable {name:U}", {name: name}, ERRORS.BAD_VAR);
  }

  function lvalue(name) {
    for (let i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name);
      }
    }
    return undefined;
  }

  function setvar(name, value) {
    value = copy(value);

    // Find the variable in existing scope
    let lval = lvalue(name);
    if (lval) {
      lval.value = value;
    } else {
      // Otherwise, define a global
      lval = {value: value};
      self.scopes[0].set(name, lval);
    }
  }

  function local(name) {
    const scope = self.scopes[self.scopes.length - 1];
    scope.set(sexpr(name), {value: undefined});
  }

  function setlocal(name, value) {
    value = copy(value);
    const scope = self.scopes[self.scopes.length - 1];
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
    const next = list[0];
    return options.some(x => next === x);

  }

  function evaluateExpression(list) {
    return (expression(list))();
  }

  function expression(list) {
    return relationalExpression(list);
  }

  function relationalExpression(list) {
    let lhs = additiveExpression(list);
    while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
      const op = list.shift();
      lhs = (lhs => {
        const rhs = additiveExpression(list);

        switch (op) {
        case "<": return async () => (aexpr(await lhs()) < aexpr(await rhs())) ? 1 : 0;
        case ">": return async () => (aexpr(await lhs()) > aexpr(await rhs())) ? 1 : 0;
        case "=": return async () => equal(await lhs(), await rhs()) ? 1 : 0;

        case "<=": return async () => (aexpr(await lhs()) <= aexpr(await rhs())) ? 1 : 0;
        case ">=": return async () => (aexpr(await lhs()) >= aexpr(await rhs())) ? 1 : 0;
        case "<>": return async () => !equal(await lhs(), await rhs()) ? 1 : 0;
        default: throw new Error("Internal error in expression parser");
        }
      })(lhs);
    }

    return lhs;
  }

  function additiveExpression(list) {
    let lhs = multiplicativeExpression(list);
    while (peek(list, ['+', '-'])) {
      const op = list.shift();
      lhs = (lhs => {
        const rhs = multiplicativeExpression(list);

        switch (op) {
        case "+": return async () => aexpr(await lhs()) + aexpr(await rhs());
        case "-": return async () => aexpr(await lhs()) - aexpr(await rhs());
        default: throw new Error("Internal error in expression parser");
        }
      })(lhs);
    }

    return lhs;
  }

  function multiplicativeExpression(list) {
    let lhs = powerExpression(list);
    while (peek(list, ['*', '/', '%'])) {
      const op = list.shift();
      lhs = (lhs => {
        const rhs = powerExpression(list);

        switch (op) {
        case "*": return async () => aexpr(await lhs()) * aexpr(await rhs());
        case "/": return async () => {
          const n = aexpr(await lhs()), d = aexpr(await rhs());
          if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
          return n / d;
        };
        case "%": return async () => {
          const n = aexpr(await lhs()), d = aexpr(await rhs());
          if (d === 0) { throw err("Division by zero", ERRORS.BAD_INPUT); }
          return n % d;
        };
        default: throw new Error("Internal error in expression parser");
        }
      })(lhs);
    }

    return lhs;
  }

  function powerExpression(list) {
    let lhs = unaryExpression(list);
    while (peek(list, ['^'])) {
      const op = list.shift();
      lhs = (lhs => {
        const rhs = unaryExpression(list);

        return async () => Math.pow(aexpr(await lhs()), aexpr(await rhs()));
      })(lhs);
    }

    return lhs;
  }

  function unaryExpression(list) {
    if (peek(list, [UNARY_MINUS])) {
      const op = list.shift();
      const rhs = unaryExpression(list);
      return async () => -aexpr(await rhs());
    } else {
      return finalExpression(list);
    }
  }

  function finalExpression(list) {
    if (!list.length)
      throw err("Unexpected end of instructions", ERRORS.MISSING_PAREN);

    let atom = list.shift();

    let result, literal, varname;

    switch (Type(atom)) {
    case 'array':
    case 'list':
      return () => atom;

    case 'word':
      if (isNumber(atom)) {
        // number literal
        atom = parseFloat(atom);
        return () => atom;
      }

      atom = String(atom);
      if (atom.charAt(0) === '"' || atom.charAt(0) === "'") {
        // string literal
        literal = atom.substring(1);
        return () => literal;
      }
      if (atom.charAt(0) === ':') {
        // variable
        varname = atom.substring(1);
        return () => getvar(varname);
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

  self.dispatch = (name, tokenlist, natural) => {
    name = name.toUpperCase();
    const procedure = self.routines.get(name);
    if (!procedure) {

      // Give a helpful message in a common error case.
      let m;
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
        return () => { };
      } finally {
        self.stack.pop();
      }
    }

    const args = [];
    if (natural) {
      // Natural arity of the function
      for (let i = 0; i < procedure.default; ++i) {
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
      return async () => {
        self.stack.push(name);
        try {
          return procedure.apply(self, args);
        } finally {
          self.stack.pop();
        }
      };
    }

    return async () => {
      self.stack.push(name);
      try {
        const a = [];
        for (const proc of args) {
          a.push(await proc());
        }
        return await procedure.apply(self, a);
      } finally {
        self.stack.pop();
      }
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
      return [...String(atom)];
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
      for (let i = 0; i < a.length; ++i) {
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
  self.execute = async (statements, options) => {
    options = Object(options);
    // Operate on a copy so the original is not destroyed
    statements = statements.slice();

    let lastResult;
    while (statements.length) {
      if (self.forceBye) {
        self.forceBye = false;
        throw new Bye;
      }
      const result = await evaluateExpression(statements);
      if (result !== undefined && !options.returnResult) {
        throw err("Don't know what to do with {result}", {result: result},
                  ERRORS.BAD_OUTPUT);
      }
      lastResult = result;
    }
    return lastResult;
  };

  // FIXME: should this confirm that something is running?
  self.bye = () => {
    self.forceBye = true;
  };

  let lastRun = Promise.resolve();

  // Call to insert an arbitrary task (callback) to be run in sequence
  // with pending calls to run. Useful in tests to do work just before
  // a subsequent assertion.
  self.queueTask = task => {
    const promise = lastRun.then(() => {
      return Promise.resolve(task());
    });
    lastRun = promise.catch(() =>{});
    return promise;
  };

  self.run = (string, options) => {
    options = Object(options);
    return self.queueTask(async () => {
      // Parse it
      const atoms = parse(string);

      // And execute it!
      try {
        return await self.execute(atoms, options);
      } catch(err) {
        if (err instanceof Bye)
          return undefined;
        throw err;
      }
    });
  };

  self.definition = (name, proc) => {

    function defn(atom) {
      switch (Type(atom)) {
      case 'word': return String(atom);
      case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
      case 'array': return '{ ' + atom.list.map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error("Internal error: unknown type");
      }
    }

    let def = "to " + name;

    def += proc.inputs.map(i => ' :' + i).join('');
    def += proc.optional_inputs.map(op =>
      ' [:' + op[0] + ' ' + op[1].map(defn).join(' ') + ']'
    ).join('');
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
  self.procdefs = () => {
    const defs = [];
    self.routines.forEach((name, proc) => {
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n\n");
  };

  // API to allow aliasing. Can be used for localization. Does not
  // check for errors.
  self.copydef = (newname, oldname) => {
    self.routines.set(newname, self.routines.get(oldname));
  };

  //----------------------------------------------------------------------
  //
  // Built-In Proceedures
  //
  //----------------------------------------------------------------------

  // Basic form:
  //
  //  def("procname", (input1, input2, ...) => { ... return output; });
  //   * inputs are JavaScript strings, numbers, or Arrays
  //   * output is string, number, Array or undefined/no output
  //
  // Special forms:
  //
  //  def("procname", (tokenlist) => { ... }, {special: true});
  //   * input is Array (list) of tokens (words, numbers, Arrays)
  //   * used for implementation of special forms (e.g. TO inputs... statements... END)
  //
  //  def("procname", (fin, fin, ...) => { ... return op; }, {noeval: true});
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
      Object.keys(props).forEach(key => {
        fn[key] = props[key];
      });
    }
    fn.primitive = true;
    if (Array.isArray(name)) {
      name.forEach(name => {
        self.routines.set(name, fn);
      });
    } else {
      self.routines.set(name, fn);
    }
  }

  //
  // Procedures and Flow Control
  //
  def("to", list => {
    const name = sexpr(list.shift());
    if (isNumber(name) || isOperator(name))
      throw err("TO: Expected identifier", ERRORS.BAD_INPUT);

    const inputs = []; // [var, ...]
    const optional_inputs = []; // [[var, [expr...]], ...]
    let rest = undefined; // undefined or var
    let length = undefined; // undefined or number
    const block = [];

    // Process inputs, then the statements of the block
    const REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, BLOCK = 4;
    let state = REQUIRED, sawEnd = false;
    while (list.length) {
      const atom = list.shift();
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

    const length = (def === undefined) ? inputs.length : def;

    // Closure over inputs and block to handle scopes, arguments and outputs
    const func = async (...args) => {
      // Define a new scope
      const scope = new StringMap(true);
      self.scopes.push(scope);

      let i = 0, op;
      for (; i < inputs.length && i < args.length; ++i)
        scope.set(inputs[i], {value: args[i]});
      for (; i < inputs.length + optional_inputs.length && i < args.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: args[i]});
      }
      for (; i < inputs.length + optional_inputs.length; ++i) {
        op = optional_inputs[i - inputs.length];
        scope.set(op[0], {value: evaluateExpression(reparse(op[1]))});
      }
      if (rest)
        scope.set(rest, {value: args.slice(i)});

      try {
        await self.execute(block);
        await promiseYield();
        return undefined;
      } catch (err) {
        if (err instanceof Output)
          return err.output;
        throw err;
      } finally {
        self.scopes.pop();
      }
    };

    const proc = to_arity(func, length);
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

    saveproc(name, self.definition(name, proc));
  }


  def("def", list => {

    const name = sexpr(list);
    const proc = this.routines.get(name);
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

  def("word", (...words) => {
    return words.length ? words.map(sexpr).reduce((a, b) => a + b) : "";
  }, {minimum: 0, default: 2, maximum: -1});

  def("list", (...things) => {
    return things.map(x => x); // Make a copy
  }, {minimum: 0, default: 2, maximum: -1});

  def(["sentence", "se"], (...things) => {
    let list = [];
    for (let thing of things) {
      if (Type(thing) === 'list') {
        thing = lexpr(thing);
        list = list.concat(thing);
      } else {
        list.push(thing);
      }
    }
    return list;
  }, {minimum: 0, default: 2, maximum: -1});

  def("fput", (thing, list) => {
    const l = lexpr(list);
    l.unshift(thing);
    return sifw(list, l);
  });

  def("lput", (thing, list) => {
    const l = lexpr(list);
    l.push(thing);
    return sifw(list, l);
  });

  def("array", (size, origin=undefined) => {
    size = aexpr(size);
    if (size < 1)
      throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
    origin = (origin === undefined) ? 1 : aexpr(origin);
    return new LogoArray(size, origin);
  }, {maximum: 2});

  def("mdarray", (sizes, origin=undefined) => {
    sizes = lexpr(sizes).map(aexpr).map(n =>n|0);
    if (sizes.some(size => size < 1))
      throw err("{_PROC_}: Array size must be positive integer", ERRORS.BAD_INPUT);
    origin = (origin === undefined) ? 1 : aexpr(origin);

    function make(index) {
      const n = sizes[index], a = new LogoArray(n, origin);
      if (index + 1 < sizes.length) {
        for (let i = 0; i < n; ++i)
          a.setItem(i + origin, make(index + 1));
      }
      return a;
    }

    return make(0);
  }, {maximum: 2});

  def("listtoarray", (list, origin=undefined) => {
    list = lexpr(list);
    origin = (origin === undefined) ? 1 : aexpr(origin);
    return LogoArray.from(list, origin);
  }, {maximum: 2});

  def("arraytolist", array => {
    if (Type(array) !== 'array') {
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    }
    return array.list.slice();
  });

  def("combine", (thing1, thing2) => {
    if (Type(thing2) !== 'list') {
      return this.routines.get('word')(thing1, thing2);
    } else {
      return this.routines.get('fput')(thing1, thing2);
    }
  });

  def("reverse", (list, tail=undefined) => {
    tail = (tail !== undefined) ? tail : (Type(list) === 'list' ? [] : '');
    return sifw(tail, lexpr(list).reverse().concat(lexpr(tail)));
  }, {maximum: 2});

  this.gensym_index = 0;
  def("gensym", () => {
    ++this.gensym_index;
    return 'G' + this.gensym_index;
  });

  //
  // 2.2 Data Selectors
  //

  def("first", list => lexpr(list)[0]);

  def("firsts", list => lexpr(list).map(x => x[0]));

  def("last", list => { list = lexpr(list); return list[list.length - 1]; });

  def(["butfirst", "bf"], list => sifw(list, lexpr(list).slice(1)));

  def(["butfirsts", "bfs"], list =>
      lexpr(list).map(x => sifw(x, lexpr(x).slice(1)))
     );

  def(["butlast", "bl"], list =>
      Type(list) === 'word' ? String(list).slice(0, -1) : lexpr(list).slice(0, -1)
     );

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

  def("item", (index, thing) => {
    index = aexpr(index)|0;
    return item(index, thing);
  });

  def("mditem", (indexes, thing) => {
    indexes = lexpr(indexes).map(aexpr).map(n => n|0);
    while (indexes.length)
      thing = item(indexes.shift(), thing);
    return thing;
  });

  def("pick", list => {
    list = lexpr(list);
    const i = Math.floor(this.prng.next() * list.length);
    return list[i];
  });

  def("remove", (thing, list) =>
      sifw(list, lexpr(list).filter(x => !equal(x, thing)))
     );

  def("remdup", list => {
    // TODO: This only works with JS equality. Use equalp.
    const set = new Set();
    return sifw(list, lexpr(list).filter(x => {
      if (set.has(x)) { return false; } else { set.add(x); return true; }
    }));
  });

  def("split", (thing, list) => {
    const l = lexpr(list);
    return lexpr(list)
      .reduce((ls, i) => (equal(i, thing) ? ls.push([]) : ls[ls.length - 1].push(i), ls), [[]])
      .filter(l => l.length > 0)
      .map(e => sifw(list, e));
  });

  def("quoted", thing => {
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
      return atom.some(a => contains(a, value));
    case 'array':
      return atom.list.some(a => contains(a, value));
    default:
      return false;
    }
  }

  def("setitem", (index, array, value) => {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    if (contains(value, array))
      throw err("{_PROC_}: Can't create circular array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("mdsetitem", (indexes, thing, value) => {
    indexes = lexpr(indexes).map(aexpr).map(n => n|0);
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

  def(".setfirst", (list, value) => {
     if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);
    list[0] = value;
  });

  def(".setbf", (list, value) => {
    if (Type(list) !== 'list')
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    if (list.length < 1)
      throw err("{_PROC_}: Expected non-empty list", ERRORS.BAD_INPUT);
    value = lexpr(value);
    list.length = 1;
    list.push.apply(list, value);
  });

  def(".setitem", (index, array, value) => {
    index = aexpr(index);
    if (Type(array) !== 'array')
      throw err("{_PROC_}: Expected array", ERRORS.BAD_INPUT);
    array.setItem(index, value);
  });

  def("push", (stackname, thing) => {
    const got = getvar(stackname);
    const stack = lexpr(got);
    stack.unshift(thing);
    setvar(stackname, sifw(got, stack));
  });

  def("pop", stackname => {
    const got = getvar(stackname);
    const stack = lexpr(got);
    const atom = stack.shift();
    setvar(stackname, sifw(got, stack));
    return atom;
  });

  def("queue", (stackname, thing) => {
    const got = getvar(stackname);
    const queue = lexpr(got);
    queue.push(thing);
    setvar(stackname, sifw(got, queue));
  });

  def("dequeue", stackname => {
    const got = getvar(stackname);
    const queue = lexpr(got);
    const atom = queue.pop();
    setvar(stackname, sifw(got, queue));
    return atom;
  });


  //
  // 2.4 Predicates
  //

  def(["wordp", "word?"], thing => Type(thing) === 'word' ? 1 : 0);
  def(["listp", "list?"], thing => Type(thing) === 'list' ? 1 : 0);
  def(["arrayp", "array?"], thing => Type(thing) === 'array' ? 1 : 0);
  def(["numberp", "number?"], thing =>
      Type(thing) === 'word' && isNumber(thing) ? 1 : 0
  );
  def(["numberwang"], thing => this.prng.next() < 0.5 ? 1 : 0);

  def(["equalp", "equal?"], (a, b) => equal(a, b) ? 1 : 0);
  def(["notequalp", "notequal?"], (a, b) => !equal(a, b) ? 1 : 0);

  def(["emptyp", "empty?"], thing => {
    switch (Type(thing)) {
    case 'word': return String(thing).length === 0 ? 1 : 0;
    case 'list': return thing.length === 0 ? 1 : 0;
    default: return 0;
    }
  });
  def(["beforep", "before?"], (word1, word2) =>
      sexpr(word1) < sexpr(word2) ? 1 : 0
     );

  def(".eq", (a, b) => a === b && a && typeof a === 'object');

  // Not Supported: vbarredp

  def(["memberp", "member?"], (thing, list) =>
      lexpr(list).some(x => equal(x, thing)) ? 1 : 0
     );


  def(["substringp", "substring?"], (word1, word2) =>
      sexpr(word2).indexOf(sexpr(word1)) !== -1 ? 1 : 0
     );

  //
  // 2.5 Queries
  //

  def("count", thing => {
    if (Type(thing) === 'array')
      return thing.length;
    return lexpr(thing).length;
  });
  def("ascii", chr => sexpr(chr).charCodeAt(0));
  // Not Supported: rawascii
  def("char", integer => String.fromCharCode(aexpr(integer)));

  def("member", (thing, input) => {
    let list = lexpr(input);
    const index = list.findIndex(x => equal(x, thing));
    list = (index === -1) ? [] : list.slice(index);
    return sifw(input, list);
 });

  def("lowercase", word => sexpr(word).toLowerCase());
  def("uppercase", word => sexpr(word).toUpperCase());

  def("standout", word => {
    // Hack: Convert English alphanumerics to Mathematical Bold
    return [...sexpr(word)]
      .map(c => {
        let u = c.codePointAt(0);
        if ('A' <= c && c <= 'Z') {
          u = u - 'A'.codePointAt(0) + 0x1D400;
        } else if ('a' <= c && c <= 'z') {
          u = u - 'a'.codePointAt(0) + 0x1D41A;
        } else if ('0' <= c && c <= '9') {
          u = u - '0'.codePointAt(0) + 0x1D7CE;
        } else {
          return c;
        }
        return String.fromCodePoint(u);
      })
      .join('');
  });

  def("parse", word => parse('[' + sexpr(word) + ']')[0]);

  def("runparse", word => parse(sexpr(word)));

  //----------------------------------------------------------------------
  //
  // 3. Communication
  //
  //----------------------------------------------------------------------

  // 3.1 Transmitters

  def(["print", "pr"], (...things) => {
    const s = things.map(stringify_nodecorate).join(" ");
    return this.stream.write(s, "\n");
  }, {minimum: 0, default: 1, maximum: -1});
  def("type", (...things) => {
    const s = things.map(stringify_nodecorate).join("");
    return this.stream.write(s);
  }, {minimum: 0, default: 1, maximum: -1});
  def("show", (...things) => {
    const s = things.map(stringify).join(" ");
    return this.stream.write(s, "\n");
  }, {minimum: 0, default: 1, maximum: -1});

  // 3.2 Receivers

  def("readlist", async (promptstr=undefined) => {
    const word = (promptstr !== undefined)
          ? await stream.read(stringify_nodecorate(promptstr))
          : await stream.read();
    return parse('[' + word + ']')[0];
  }, {maximum: 1});

  def("readword", (promptstr=undefined) => {
    if (promptstr !== undefined)
      return stream.read(stringify_nodecorate(promptstr));
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

  def(["cleartext", "ct"], () => this.stream.clear());

  // Not Supported: setcursor
  // Not Supported: cursor
  // Not Supported: setmargins

  def('settextcolor', color => {
    this.stream.color = parseColor(color);
  });

  def('textcolor', () => this.stream.color);

  def('increasefont', () => {
    this.stream.textsize = Math.round(this.stream.textsize * 1.25);
  });

  def('decreasefont', () => {
    this.stream.textsize = Math.round(this.stream.textsize / 1.25);
  });

  def('settextsize', size => {
    this.stream.textsize = aexpr(size);
  });

  def('textsize', () => this.stream.textsize);

  def('setfont', size => {
    this.stream.font = sexpr(size);
  });

  def('font', () => this.stream.font);


  //----------------------------------------------------------------------
  //
  // 4. Arithmetic
  //
  //----------------------------------------------------------------------
  // 4.1 Numeric Operations


  def("sum", (...args) => args.map(aexpr).reduce((a, b) => a + b, 0),
      {minimum: 0, default: 2, maximum: -1});

  def("difference", (a, b) => aexpr(a) - aexpr(b));

  def("minus", a => -aexpr(a));

  def("product", (...args) => args.map(aexpr).reduce((a, b) => a * b, 1),
      {minimum: 0, default: 2, maximum: -1});

  def("quotient", (a, b) => {
    if (b !== undefined)
      return aexpr(a) / aexpr(b);
    else
      return 1 / aexpr(a);
  }, {minimum: 1});

  def("remainder", (num1, num2) => aexpr(num1) % aexpr(num2));

  def("modulo", (num1, num2) => {
    num1 = aexpr(num1);
    num2 = aexpr(num2);
    return Math.abs(num1 % num2) * (num2 < 0 ? -1 : 1);
  });

  def("power", (a, b) => Math.pow(aexpr(a), aexpr(b)));
  def("sqrt", a => Math.sqrt(aexpr(a)));
  def("exp", a => Math.exp(aexpr(a)));
  def("log10", a => Math.log(aexpr(a)) / Math.LN10);
  def("ln", a => Math.log(aexpr(a)));


  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  def("arctan", (a, b=undefined) => {
    if (b !== undefined) {
      const x = aexpr(a);
      const y = aexpr(b);
      return rad2deg(Math.atan2(y, x));
    } else {
      return rad2deg(Math.atan(aexpr(a)));
    }
  }, {maximum: 2});

  def("sin", a => Math.sin(deg2rad(aexpr(a))));
  def("cos", a => Math.cos(deg2rad(aexpr(a))));
  def("tan", a => Math.tan(deg2rad(aexpr(a))));

  def("radarctan", (a, b=undefined) => {
    if (b !== undefined) {
      const x = aexpr(a);
      const y = aexpr(b);
      return Math.atan2(y, x);
    } else {
      return Math.atan(aexpr(a));
    }
  }, {maximum: 2});

  def("radsin", a => Math.sin(aexpr(a)));
  def("radcos", a => Math.cos(aexpr(a)));
  def("radtan", a => Math.tan(aexpr(a)));

  def("abs", a => Math.abs(aexpr(a)));


  function truncate(x) { return parseInt(x, 10); }

  def("int", a => truncate(aexpr(a)));
  def("round", a => Math.round(aexpr(a)));

  def("iseq", (a, b) => {
    a = truncate(aexpr(a));
    b = truncate(aexpr(b));
    const step = (a < b) ? 1 : -1;
    const list = [];
    for (let i = a; (step > 0) ? (i <= b) : (i >= b); i += step) {
      list.push(i);
    }
    return list;
  });


  def("rseq", (from, to, count) => {
    from = aexpr(from);
    to = aexpr(to);
    count = truncate(aexpr(count));
    const step = (to - from) / (count - 1);
    const list = [];
    for (let i = from; (step > 0) ? (i <= to) : (i >= to); i += step) {
      list.push(i);
    }
    return list;
  });

  // 4.2 Numeric Predicates

  def(["greaterp", "greater?"], (a, b) => aexpr(a) > aexpr(b) ? 1 : 0);
  def(["greaterequalp", "greaterequal?"], (a, b) => aexpr(a) >= aexpr(b) ? 1 : 0);
  def(["lessp", "less?"], (a, b) => aexpr(a) < aexpr(b) ? 1 : 0);
  def(["lessequalp", "lessequal?"], (a, b) => aexpr(a) <= aexpr(b) ? 1 : 0);

  // 4.3 Random Numbers

  def("random", (a, b=undefined) => {
    if (b === undefined) {
      const max = aexpr(a);
      return Math.floor(this.prng.next() * max);
    } else {
      const start = aexpr(a);
      const end = aexpr(b);
      return Math.floor(this.prng.next() * (end - start + 1)) + start;
    }
  }, {maximum: 2});

  def("rerandom", (expr=undefined) => {
    const seed = (expr !== undefined) ? aexpr(expr) : 2345678901;
    return this.prng.seed(seed);
  }, {maximum: 1});

  // 4.4 Print Formatting

  def("form", (num, width, precision) => {
    num = aexpr(num);
    width = aexpr(width);
    precision = aexpr(precision);

    return num.toFixed(precision).padStart(width);
  });

  // 4.5 Bitwise Operations


  def("bitand", (...args) => args.map(aexpr).reduce((a, b) => a & b, -1),
      {minimum: 0, default: 2, maximum: -1});
  def("bitor", (...args) => args.map(aexpr).reduce((a, b) => a | b, 0),
      {minimum: 0, default: 2, maximum: -1});
  def("bitxor", (...args) => args.map(aexpr).reduce((a, b) => a ^ b, 0),
      {minimum: 0, default: 2, maximum: -1});
  def("bitnot", num => ~aexpr(num));


  def("ashift", (num1, num2) => {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >> -num2;
  });

  def("lshift", (num1, num2) => {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >>> -num2;
  });


  //----------------------------------------------------------------------
  //
  // 5. Logical Operations
  //
  //----------------------------------------------------------------------

  def("true", () => 1);
  def("false", () => 0);

  def("and", (...args) => booleanReduce(args, value => value, 1),
      {noeval: true, minimum: 0, default: 2, maximum: -1});

  def("or", (...args) => booleanReduce(args, value => !value, 0),
      {noeval: true, minimum: 0, default: 2, maximum: -1});

  async function booleanReduce(args, test, value) {
    while (args.length) {
      const result = await args.shift()();
      if (!test(result))
        return result;
      value = result;
    }
    return value;
  }

  def("xor", (...args) => args.map(aexpr).reduce((a, b) => Boolean(a) !== Boolean(b), 0) ? 1 : 0,
      {minimum: 0, default: 2, maximum: -1});

  def("not", a => !aexpr(a) ? 1 : 0);

  //----------------------------------------------------------------------
  //
  // 6. Graphics
  //
  //----------------------------------------------------------------------
  // 6.1 Turtle Motion

  def(["forward", "fd"], a => turtle.move(aexpr(a)));
  def(["back", "bk"], a => turtle.move(-aexpr(a)));
  def(["left", "lt"], a => turtle.turn(-aexpr(a)));
  def(["right", "rt"], a => turtle.turn(aexpr(a)));

  // Left arrow:
  def(["\u2190"], () => turtle.turn(-15));
  // Right arrow:
  def(["\u2192"], () => turtle.turn(15));
  // Up arrow:
  def(["\u2191"], () => turtle.move(10));
  // Down arrow:
  def(["\u2193"], () => turtle.move(-10));


  def("setpos", l => {
    l = lexpr(l);
    if (l.length !== 2) throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);
    turtle.position = [aexpr(l[0]), aexpr(l[1])];
  });
  def("setxy", (x, y) => { turtle.position = [aexpr(x), aexpr(y)]; });
  def("setx", x => { turtle.position = [aexpr(x), undefined]; });
  def("sety", y => { turtle.position = [undefined, aexpr(y)]; });
  def(["setheading", "seth"], a => { turtle.heading = aexpr(a); });

  def("home", () => turtle.home());

  def("arc", (angle, radius) => turtle.arc(aexpr(angle), aexpr(radius)));

  //
  // 6.2 Turtle Motion Queries
  //

  def("pos", () => turtle.position);
  def("xcor", () => turtle.position[0]);
  def("ycor", () => turtle.position[1]);
  def("heading", () => turtle.heading);
  def("towards", l => {
    l = lexpr(l);
    if (l.length !== 2) throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);
    return turtle.towards(aexpr(l[0]), aexpr(l[1]));
  });

  def("scrunch", () => turtle.scrunch);
  def("bounds", () => turtle.bounds);

  //
  // 6.3 Turtle and Window Control
  //

  def(["showturtle", "st"], () => { turtle.visible = true; });
  def(["hideturtle", "ht"], () => { turtle.visible = false; });
  def("clean", () => { turtle.clear(); });
  def(["clearscreen", "cs"], () => { turtle.clearscreen(); });

  def("wrap", () => { turtle.turtlemode = 'wrap'; });
  def("window", () => { turtle.turtlemode = 'window'; });
  def("fence", () => { turtle.turtlemode = 'fence'; });

  def("fill", () => { turtle.fill(); });

  def("filled", async (fillcolor, statements) => {
    fillcolor = parseColor(fillcolor);
    statements = reparse(lexpr(statements));
    turtle.beginpath();
    try {
      await this.execute(statements);
    } finally {
      turtle.fillpath(fillcolor);
    }
  });

  def("label", (...args) => {
    const s = args.map(stringify_nodecorate).join(" ");
    return turtle.drawtext(s);
  }, {minimum: 1, default: 1, maximum: -1});

  def("setlabelheight", a => { turtle.fontsize = aexpr(a); });

  def("setlabelfont", a => { turtle.fontname = sexpr(a); });

  // Not Supported: textscreen
  // Not Supported: fullscreen
  // Not Supported: splitscreen

  def("setscrunch", (sx, sy) => {
    sx = aexpr(sx);
    sy = aexpr(sy);
    if (!isFinite(sx) || sx === 0 || !isFinite(sy) || sy === 0)
      throw err("{_PROC_}: Expected non-zero values", ERRORS.BAD_INPUT);
    turtle.scrunch = [sx, sy];
  });

  // Not Supported: refresh
  // Not Supported: norefresh

  def("setturtle", (index) => {
    index = aexpr(index)|0;
    if (index < 1)
      throw err("{_PROC_}: Expected positive turtle index", ERRORS.BAD_INPUT);
    turtle.currentturtle = index - 1;
  });

  def("ask", async (index, statements) => {
    index = aexpr(index)|0;
    if (index < 1)
      throw err("{_PROC_}: Expected positive turtle index", ERRORS.BAD_INPUT);
    statements = reparse(lexpr(statements));
    const originalturtle = turtle.currentturtle;
    turtle.currentturtle = index - 1;
    try {
      await this.execute(statements);
    } finally {
      turtle.currentturtle = originalturtle;
    }
  });

  def("clearturtles", () => {
    turtle.clearturtles();
  });

  //
  // 6.4 Turtle and Window Queries
  //

  def(["shownp", "shown?"], () => turtle.visible ? 1 : 0);

  // Not Supported: screenmode

  def("turtlemode", () => turtle.turtlemode.toUpperCase());

  def("labelsize", () => [turtle.fontsize, turtle.fontsize]);

  def("labelfont", () => turtle.fontname);

  def("turtles", () => turtle.turtles);

  def("turtle", () => turtle.currentturtle + 1);

  //
  // 6.5 Pen and Background Control
  //
  def(["pendown", "pd"], () => { turtle.pendown = true; });
  def(["penup", "pu"], () => { turtle.pendown = false; });

  def(["penpaint", "ppt"], () => { turtle.penmode = 'paint'; });
  def(["penerase", "pe"], () => { turtle.penmode = 'erase'; });
  def(["penreverse", "px"], () => { turtle.penmode = 'reverse'; });

  // To handle additional color names (localizations, etc):
  // logo.colorAlias = (name) => {
  //   return {internationalorange: '#FF4F00', ... }[name];
  // };
  this.colorAlias = null;

  const PALETTE = {
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
      const r = adjust(aexpr(color[0]));
      const g = adjust(aexpr(color[1]));
      const b = adjust(aexpr(color[2]));
      const rr = (r < 16 ? "0" : "") + r.toString(16);
      const gg = (g < 16 ? "0" : "") + g.toString(16);
      const bb = (b < 16 ? "0" : "") + b.toString(16);
      return '#' + rr + gg + bb;
    }
    color = sexpr(color);
    if (Object.prototype.hasOwnProperty.call(PALETTE, color))
      return PALETTE[color];
    if (self.colorAlias)
      return self.colorAlias(color) || color;
    return color;
  }

  def(["setpencolor", "setpc", "setcolor"], (color) => {
    turtle.color = parseColor(color);
  });

  def("setpalette", (colornumber, color) => {
    colornumber = aexpr(colornumber);
    if (colornumber < 8)
      throw err("{_PROC_}: Expected number greater than 8", ERRORS.BAD_INPUT);
    PALETTE[colornumber] = parseColor(color);
  });

  def(["setpensize", "setwidth", "setpw"], a => {
    if (Type(a) === 'list')
      turtle.penwidth = aexpr(a[0]);
    else
      turtle.penwidth = aexpr(a);
  });

  // Not Supported: setpenpattern
  // Not Supported: setpen

  def(["setbackground", "setbg", "setscreencolor", "setsc"], color => {
    turtle.bgcolor = parseColor(color);
  });

  //
  // 6.6 Pen Queries
  //

  def(["pendownp", "pendown?"], () => turtle.pendown ? 1 : 0);

  def("penmode", () => turtle.penmode.toUpperCase());

  def(["pencolor", "pc"], () => turtle.color);

  def("palette", colornumber => PALETTE[aexpr(colornumber)]);

  def("pensize", () => [turtle.penwidth, turtle.penwidth]);

  // Not Supported: pen

  def(["background", "bg", "getscreencolor", "getsc"], () => turtle.bgcolor);

  // 6.7 Saving and Loading Pictures

  // Not Supported: savepict
  // Not Supported: loadpict
  // Not Supported: epspict

  // 6.8 Mouse Queries

  def("mousepos", () => turtle.mousepos);

  def("clickpos", () => turtle.clickpos);

  def(["buttonp", "button?"], () => turtle.button > 0 ? 1 : 0);

  def("button", () => turtle.button);

  def("touches", () => turtle.touches);

  // Extensions

  def("bitcut", (w, h) => turtle.copy(w, h));

  def("bitpaste", () => turtle.paste());

  //----------------------------------------------------------------------
  //
  // 7. Workspace Management
  //
  //----------------------------------------------------------------------
  // 7.1 Procedure Definition

  def("define", (name, list) => {
    name = sexpr(name);
    list = lexpr(list);
    if (list.length != 2)
      throw err("{_PROC_}: Expected list of length 2", ERRORS.BAD_INPUT);

    const inputs = [];
    const optional_inputs = [];
    let rest = undefined;
    let def = undefined;
    const block = reparse(lexpr(list[1]));

    const ins = lexpr(list[0]);
    const REQUIRED = 0, OPTIONAL = 1, REST = 2, DEFAULT = 3, ERROR = 4;
    let state = REQUIRED;
    while (ins.length) {
      const atom = ins.shift();
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

  def("text", name => {
    const proc = this.routines.get(sexpr(name));
    if (!proc)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: name }, ERRORS.BAD_PROC);
    if (!proc.inputs) {
      throw err("{_PROC_}: Can't show definition of primitive {name:U}", { name: name },
               ERRORS.IS_PRIMITIVE);
    }

    const inputs = proc.inputs.concat(proc.optional_inputs);
    if (proc.rest)
      inputs.push([proc.rest]);
    if (proc.def !== undefined)
      inputs.push(proc.def);
    return [inputs, proc.block];
  });

  // Not Supported: fulltext

  def("copydef", (newname, oldname) => {

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
    // TODO: This is broken if copying a built-in, so disable for now
    //saveproc(newname, this.definition(newname, this.routines.get(newname)));
  });


  // 7.2 Variable Definition

  def("make", (varname, value) => {
    setvar(sexpr(varname), value);
  });

  def("name", (value, varname) => {
    setvar(sexpr(varname), value);
  });

  def("local", (...varnames) => {
    varnames.forEach((name) => { local(sexpr(name)); });
  }, {minimum: 1, default: 1, maximum: -1});

  def("localmake", (varname, value) => {
    setlocal(sexpr(varname), value);
  });

  def("thing", varname => getvar(sexpr(varname)));

  def("global", (...varnames) => {
    const globalscope = this.scopes[0];
    varnames.forEach((name) => {
      globalscope.set(sexpr(name), {value: undefined}); });
  }, {minimum: 1, default: 1, maximum: -1});

  //
  // 7.3 Property Lists
  //

  def("pprop", (plistname, propname, value) => {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    let plist = this.plists.get(plistname);
    if (!plist) {
      plist = new StringMap(true);
      this.plists.set(plistname, plist);
    }
    plist.set(propname, value);
  });

  def("gprop", (plistname, propname) => {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    const plist = this.plists.get(plistname);
    if (!plist || !plist.has(propname))
      return [];
    return plist.get(propname);
  });

  def("remprop", (plistname, propname) => {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    const plist = this.plists.get(plistname);
    if (plist) {
      plist['delete'](propname);
      if (plist.empty()) {
        // TODO: Do this? Loses state, e.g. unburies if buried
        this.plists['delete'](plistname);
      }
    }
  });

  def("plist", plistname => {
    plistname = sexpr(plistname);
    const plist = this.plists.get(plistname);
    if (!plist)
      return [];

    const result = [];
    plist.forEach((key, value) => {
      result.push(key);
      result.push(copy(value));
    });
    return result;
  });

  //
  // 7.4 Workspace Predicates
  //

  def(["procedurep", "procedure?"], name => {
    name = sexpr(name);
    return this.routines.has(name) ? 1 : 0;
  });

  def(["primitivep", "primitive?"], name => {
    name = sexpr(name);
    return (this.routines.has(name) &&
            this.routines.get(name).primitive) ? 1 : 0;
  });

  def(["definedp", "defined?"], name => {
    name = sexpr(name);
    return (this.routines.has(name) &&
            !this.routines.get(name).primitive) ? 1 : 0;
  });

  def(["namep", "name?"], varname => {
    try {
      return getvar(sexpr(varname)) !== undefined ? 1 : 0;
    } catch (e) {
      return 0;
    }
  });

  def(["plistp", "plist?"], plistname => {
    plistname = sexpr(plistname);
    return this.plists.has(plistname) ? 1 : 0;
  });

  //
  // 7.5 Workspace Queries
  //

  def("contents", () => [
      this.routines.keys().filter(x => {
        return !this.routines.get(x).primitive && !this.routines.get(x).buried;
      }),
      this.scopes.reduce(
        (list, scope) => {
          return list.concat(scope.keys().filter(x => !scope.get(x).buried)); },
        []),
      this.plists.keys().filter(x => {
        return !this.plists.get(x).buried;
      })
    ]
  );

  def("buried", () => [
      this.routines.keys().filter(x => {
        return !this.routines.get(x).primitive && this.routines.get(x).buried; }),
      this.scopes.reduce(
        (list, scope) => {
          return list.concat(scope.keys().filter(x => scope.get(x).buried)); },
        []),
      this.plists.keys().filter(x => this.plists.get(x).buried)
    ]
  );

  def("traced", () => [
      this.routines.keys().filter(x => {
        return !this.routines.get(x).primitive && this.routines.get(x).traced; }),
      this.scopes.reduce(
        (list, scope) => {
          return list.concat(scope.keys().filter(x => scope.get(x).traced)); },
        []),
      this.plists.keys().filter(x => this.plists.get(x).traced)
    ]
  );

  def(["stepped"], () => [
      this.routines.keys().filter(x => {
        return !this.routines.get(x).primitive && this.routines.get(x).stepped; }),
      this.scopes.reduce(
        (list, scope) => {
          return list.concat(scope.keys().filter(x => scope.get(x).stepped)); },
        []),
      this.plists.keys().filter(x => this.plists.get(x).stepped)
    ]
  );

  def("procedures", () => this.routines.keys().filter(
    x => !this.routines.get(x).primitive && !this.routines.get(x).buried
  ));

  def("primitives", () => this.routines.keys().filter(
    x => this.routines.get(x).primitive & !this.routines.get(x).buried
  ));

  def("globals", () => {
    const globalscope = this.scopes[0];
    return globalscope.keys().filter(x => !globalscope.get(x).buried);
  });

  def("names", () => [
      [],
      this.scopes.reduce((list, scope) => {
        return list.concat(scope.keys().filter(x => {
          return !scope.get(x).buried; })); }, [])
    ]
  );

  def("plists", () => [
      [],
      [],
      this.plists.keys().filter(x => {
        return !this.plists.get(x).buried;
      })
    ]
  );

  def("namelist", varname => {
    if (Type(varname) === 'list')
      varname = lexpr(varname);
    else
      varname = [sexpr(varname)];
    return [[], varname];
  });

  def("pllist", plname => {
    if (Type(plname) === 'list') {
      plname = lexpr(plname);
    } else {
      plname = [sexpr(plname)];
    }
    return [[], [], plname];
  });


  def("arity", name => {
    name = sexpr(name);
    const proc = this.routines.get(name);
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

  def("erase", list => {
    list = lexpr(list);

    // Delete procedures
    if (list.length) {
      const procs = lexpr(list.shift());
      procs.forEach(name => {
        name = sexpr(name);
        if (this.routines.has(name)) {
          if (this.routines.get(name).special)
            throw err("Can't {_PROC_} special {name:U}", { name: name }, ERRORS.BAD_INPUT);
          if (!this.routines.get(name).primitive || maybegetvar("redefp")) {
            this.routines['delete'](name);
            saveproc(name);
          } else {
            throw err("Can't {_PROC_} primitives unless REDEFP is TRUE", ERRORS.BAD_INPUT);
          }
        }
      });
    }

    // Delete variables
    if (list.length) {
      const vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(scope => {
        vars.forEach(name => {
          name = sexpr(name);
          scope['delete'](name);
        });
      });
    }

    // Delete property lists
    if (list.length) {
      const plists = lexpr(list.shift());
      plists.forEach(name => {
        name = sexpr(name);
        this.plists['delete'](name);
      });
    }
  });

  // TODO: lots of redundant logic here -- clean this up
  def("erall", () => {
    this.routines.keys()
      .filter(x => !this.routines.get(x).primitive && !this.routines.get(x).buried)
      .forEach(name => {
        this.routines['delete'](name);
        saveproc(name);
      });

    this.scopes.forEach(scope => {
      scope.keys()
        .filter(x => !scope.get(x).buried)
        .forEach(name => {
          scope['delete'](name);
        });
    });

    this.plists.keys()
      .filter(x => !this.plists.get(x).buried)
      .forEach(name => {
        this.plists['delete'](name);
      });
  });

  def("erps", () => {
    this.routines.keys()
      .filter(x => !this.routines.get(x).primitive && !this.routines.get(x).buried)
      .forEach(name => {
        this.routines['delete'](name);
        saveproc(name);
      });
  });

  def("erns", () => {
    this.scopes.forEach(scope => {
      scope.keys()
        .filter(x => !scope.get(x).buried)
        .forEach(name => {
          scope['delete'](name);
        });
    });
  });

  def("erpls", () => {
    this.plists.keys()
      .filter(x => !this.plists.get(x).buried)
      .forEach(key => {
        this.plists['delete'](key);
      });
  });

  def("ern", varname => {
    let varnamelist;
    if (Type(varname) === 'list')
      varnamelist = lexpr(varname);
    else
      varnamelist = [sexpr(varname)];

    this.scopes.forEach(scope => {
      varnamelist.forEach(name => {
        name = sexpr(name);
        scope['delete'](name);
      });
    });
  });

  def("erpl", plname => {
    let plnamelist;
    if (Type(plname) === 'list') {
      plnamelist = lexpr(plname);
    } else {
      plnamelist = [sexpr(plname)];
    }

    plnamelist.forEach(name => {
      name = sexpr(name);
      this.plists['delete'](name);
    });
  });

  def("bury", list => {
    list = lexpr(list);

    // Bury procedures
    if (list.length) {
      const procs = lexpr(list.shift());
      procs.forEach(name => {
        name = sexpr(name);
        if (this.routines.has(name))
          this.routines.get(name).buried = true;
      });
    }

    // Bury variables
    if (list.length) {
      const vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(scope => {
        vars.forEach(name => {
          name = sexpr(name);
          if (scope.has(name))
            scope.get(name).buried = true;
        });
      });
    }

    // Bury property lists
    if (list.length) {
      const plists = lexpr(list.shift());
      plists.forEach(name => {
        name = sexpr(name);
        if (this.plists.has(name))
          this.plists.get(name).buried = true;
      });
    }
  });

  def("buryall", () => {
    this.routines.forEach((name, proc) => {
      proc.buried = true;
    });

    this.scopes.forEach(scope => {
      scope.forEach((name, entry) => {
        entry.buried = true;
      });
    });

    this.plists.forEach((name, entry) => {
      entry.buried = true;
    });
  });

  def("buryname", varname => {
    const bury = this.routines.get('bury');
    const namelist = this.routines.get('namelist');
    return bury.call(this, namelist.call(this, varname));
  });

  def("unbury", list => {
    list = lexpr(list);

    // Procedures
    if (list.length) {
      const procs = lexpr(list.shift());
      procs.forEach(name => {
        name = sexpr(name);
        if (this.routines.has(name))
          this.routines.get(name).buried = false;
      });
    }

    // Variables
    if (list.length) {
      const vars = lexpr(list.shift());
      // TODO: global only?
      this.scopes.forEach(scope => {
        vars.forEach(name => {
          name = sexpr(name);
          if (scope.has(name))
            scope.get(name).buried = false;
        });
      });
    }

    // Property lists
    if (list.length) {
      const plists = lexpr(list.shift());
      plists.forEach(name => {
        name = sexpr(name);
        if (this.plists.has(name))
          this.plists.get(name).buried = false;
      });
    }
  });

  def("unburyall", () => {
    this.routines.forEach((name, proc) => {
      proc.buried = false;
    });

    this.scopes.forEach(scope => {
      scope.forEach((name, entry) => {
        entry.buried = false;
      });
    });

    this.plists.forEach((name, entry) => {
      entry.buried = false;
    });
  });

  def("unburyname", (varname) => {
    const unbury = this.routines.get('unbury');
    const namelist = this.routines.get('namelist');
    return unbury.call(this, namelist.call(this, varname));
  });

  def(["buriedp", "buried?"], list => {
    list = lexpr(list);
    let name;

    // Procedures
    if (list.length) {
      const procs = lexpr(list.shift());
      if (procs.length) {
        name = sexpr(procs[0]);
        return (this.routines.has(name) && this.routines.get(name).buried) ? 1 : 0;
      }
    }

    // Variables
    if (list.length) {
      const vars = lexpr(list.shift());
      if (vars.length) {
        name = sexpr(vars[0]);
        // TODO: global only?
        return (this.scopes[0].has(name) && this.scopes[0].get(name).buried) ? 1 : 0;
      }
    }

    // Property lists
    if (list.length) {
      const plists = lexpr(list.shift());
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

  def("run", statements => {
    statements = reparse(lexpr(statements));
    return this.execute(statements, {returnResult: true});
  });

  def("runresult", async statements => {
    statements = reparse(lexpr(statements));
    const result = await this.execute(statements, {returnResult: true});
    if (result !== undefined)
      return [result];
    else
      return [];
  });

  def("repeat", async (count, statements) => {
    count = aexpr(count);
    statements = reparse(lexpr(statements));
    const old_repcount = this.repcount;
    let i = 1;
    try {
      while (i <= count) {
        this.repcount = i++;
        await this.execute(statements);
        await promiseYield();
      }
    } finally {
      this.repcount = old_repcount;
    }
  });

  def("forever", async statements => {
    statements = reparse(lexpr(statements));
    const old_repcount = this.repcount;
    let i = 1;
    try {
      for (;;) {
        this.repcount = i++;
        await this.execute(statements);
        await promiseYield();
      }
    } finally {
      this.repcount = old_repcount;
    }
  });

  def(["repcount", "#"], () => this.repcount);

  def("if", async (tf, statements, statements2=undefined) => {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    tf = aexpr(await tf);
    statements = reparse(lexpr(statements));
    if (!statements2) {
      return tf ? this.execute(statements, {returnResult: true}) : undefined;
    } else {
      statements2 = reparse(lexpr(statements2));
      return this.execute(tf ? statements : statements2, {returnResult: true});
    }
  }, {maximum: 3});

  def("ifelse", async (tf, statements1, statements2) => {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    tf = aexpr(await tf);
    statements1 = reparse(lexpr(statements1));
    statements2 = reparse(lexpr(statements2));

    return this.execute(tf ? statements1 : statements2, {returnResult: true});
  });

  def("test", async tf => {
    if (Type(tf) === 'list')
      tf = evaluateExpression(reparse(tf));

    tf = aexpr(await tf);
    // NOTE: A property on the scope, not within the scope
    this.scopes[this.scopes.length - 1]._test = tf;
  });

  def(["iftrue", "ift"], statements => {
    statements = reparse(lexpr(statements));
    const tf = this.scopes[this.scopes.length - 1]._test;
    if (tf === undefined)
      throw err('{_PROC_}: Called without TEST', ERRORS.NO_TEST);
    return tf ? this.execute(statements, {returnResult: true}) : undefined;
  });

  def(["iffalse", "iff"], statements => {
    statements = reparse(lexpr(statements));
    const tf = this.scopes[this.scopes.length - 1]._test;
    if (tf === undefined)
      throw err('{_PROC_}: Called without TEST', ERRORS.NO_TEST);
    return !tf ? this.execute(statements, {returnResult: true}) : undefined;
  });

  def("stop", () => {
    throw new Output();
  });

  def(["output", "op"], atom => {
    throw new Output(atom);
  });

  this.last_error = undefined;

  def("catch", async (tag, instructionlist) => {
    tag = sexpr(tag).toUpperCase();
    instructionlist = reparse(lexpr(instructionlist));
    try {
      return await this.execute(instructionlist, {returnResult: true});
    } catch(error) {
      if (!(error instanceof LogoError) || error.tag !== tag)
        throw error;
      this.last_error = error;
      return error.value;
    }
  }, {maximum: 2});

  def("throw", (tag, value=undefined) => {
    tag = sexpr(tag).toUpperCase();
    const error = new LogoError(tag, value);
    error.code = (value !== undefined) ? ERRORS.USER_GENERATED : ERRORS.THROW_ERROR;
    throw error;
  }, {maximum: 2});

  def("error", () => {
    if (!this.last_error)
      return [];

    const list = [
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

  def("wait", time => {
    return promiseYieldTime(Math.ceil(aexpr(time) / 60 * 1000));
  });

  def("bye", () => {
    throw new Bye;
  });

  def(".maybeoutput", value => {
    throw new Output(value);
  });

  // Not Supported: goto
  // Not Supported: tag

  def("ignore", value => {
  });

  def("`", async list => {
    list = lexpr(list);
    let out = [];
    while (list.length) {
      let member = list.shift();

      // TODO: Nested backquotes: "Substitution is done only for
      // commas at the same depth as the backquote in which they are
      // found."
      if (member === ',' && list.length) {
        member = list.shift();
        if (Type(member) === 'word')
          member = [member];
        const instructionlist = reparse(member);
        const result = await this.execute(instructionlist, {returnResult: true});
        out.push(result);
      } else if (member === ',@' && list.length) {
        member = list.shift();
        if (Type(member) === 'word')
          member = [member];
        const instructionlist = reparse(member);
        const result = await this.execute(instructionlist, {returnResult: true});
        out = out.concat(result);
      } else if (Type(member) === 'word' && /^",/.test(member)) {
        const instructionlist = reparse(member.substring(2));
        const result = await this.execute(instructionlist, {returnResult: true});
        out.push('"' + (Type(result) === 'list' ? result[0] : result));
      } else if (Type(member) === 'word' && /^:,/.test(member)) {
        const instructionlist = reparse(member.substring(2));
        const result = await this.execute(instructionlist, {returnResult: true});
        out.push(':' + (Type(result) === 'list' ? result[0] : result));
      } else {
        out.push(member);
      }
    }
    return out;
  });

  def("for", async (control, statements) => {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    function sign(x) { return x < 0 ? -1 : x > 0 ? 1 : 0; }

    const varname = sexpr(control.shift());

    let start = aexpr(await evaluateExpression(control));
    let current = start;

    let limit = aexpr(await evaluateExpression(control));

    let step = aexpr(control.length
      ? await evaluateExpression(control)
      : (limit < start ? -1 : 1));

    while (sign(current - limit) !== sign(step)) {
      setlocal(varname, current);
      await this.execute(statements);
      current += step;
      promiseYield();
    }
  });

  def("dotimes", async (control, statements) => {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    const varname = sexpr(control.shift());
    const times = aexpr(await evaluateExpression(control));
    for (let current = 1; current <= times; ++current) {
      setlocal(varname, current);
      await this.execute(statements);
      await promiseYield();
    }
  });

  function checkevalblock(block) {
    block = block();
    if (Type(block) === 'list') { return block; }
    throw err("{_PROC_}: Expected block", ERRORS.BAD_INPUT);
  }

  def("do.while", async (block, tfexpression) => {
    block = reparse(lexpr(checkevalblock(block)));
    for (;;) {
      await this.execute(block);
      let tf = await tfexpression();
      if (Type(tf) === 'list')
        tf = await evaluateExpression(reparse(tf));
      if (!tf)
        break;
      await promiseYield();
    }
  }, {noeval: true});

  def("while", async (tfexpression, block) => {
    block = reparse(lexpr(checkevalblock(block)));
    for (;;) {
      let tf = await tfexpression();
      if (Type(tf) === 'list')
        tf = await evaluateExpression(reparse(tf));
      if (!tf)
        break;
      await this.execute(block);
      await promiseYield();
    }
  }, {noeval: true});

  def("do.until", async (block, tfexpression) => {
    block = reparse(lexpr(checkevalblock(block)));
    for (;;) {
      await this.execute(block);
      let tf = await tfexpression();
      if (Type(tf) === 'list')
        tf = await evaluateExpression(reparse(tf));
      if (tf)
        break;
      await promiseYield();
    }
  }, {noeval: true});

  def("until", async (tfexpression, block) => {
    block = reparse(lexpr(checkevalblock(block)));
    for (;;) {
      let tf = await tfexpression();
      if (Type(tf) === 'list')
        tf = await evaluateExpression(reparse(tf));
      if (tf)
        break;
      await this.execute(block);
      await promiseYield();
    }
  }, {noeval: true});

  def("case", (value, clauses) => {
    clauses = lexpr(clauses);

    for (let i = 0; i < clauses.length; ++i) {
      const clause = lexpr(clauses[i]);
      const first = clause.shift();
      if (isKeyword(first, 'ELSE'))
        return evaluateExpression(clause);
      if (lexpr(first).some(x => equal(x, value)))
        return evaluateExpression(clause);
    }
    return undefined;
  });

  def("cond", async clauses => {
    clauses = lexpr(clauses);
    while (clauses.length) {
      const clause = lexpr(clauses.shift());
      const first = clause.shift();
      if (isKeyword(first, 'ELSE'))
        return await evaluateExpression(clause);
      const result = await evaluateExpression(reparse(lexpr(first)));
      if (result)
        return await evaluateExpression(clause);
    }
    return undefined;
  });

  //
  // 8.2 Template-based Iteration
  //


  //
  // Higher order functions
  //

  // TODO: multiple inputs

  def("apply", (procname, list) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    return routine.apply(this, lexpr(list));
  });

  def("invoke", (procname, ...args) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    return routine.apply(this, args);
  }, {minimum: 1, default: 2, maximum: -1});

  def("foreach", async (list, procname) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);
    list = lexpr(list);

    while (list.length) {
      await routine.call(this, list.shift());
      await promiseYield();
   }
  });


  def("map", async (procname, ...lists) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    lists = lists.map(lexpr);
    if (!lists.length)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);

    const mapped = [];
    while (lists[0].length) {
      const args = lists.map(l => {
        if (!l.length)
          throw err("{_PROC_}: Expected lists of equal length", ERRORS.BAD_INPUT);
        return l.shift();
      });
      const value = await routine.apply(this, args);
      mapped.push(value);
      await promiseYield();
    }
    return mapped;
  }, {minimum: 2, default: 2, maximum: -1});

  // Not Supported: map.se

  def("filter", async (procname, list) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    list = lexpr(list);
    const filtered = [];
    while (list.length) {
      const item = list.shift();
      const value = await routine.call(this, item);
      if (value)
        filtered.push(item);
      await promiseYield();
   }
    return filtered;
  });

  def("find", async (procname, list) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    list = lexpr(list);
    while (list.length) {
      const item = list.shift();
      const value = await routine.call(this, item);
      if (value)
        return item;
      await promiseYield();
   }
    return [];
  });

  def("reduce", async (procname, list, initial=undefined) => {
    procname = sexpr(procname);
    list = lexpr(list);
    let value = initial !== undefined ? initial : list.shift();

    const procedure = this.routines.get(procname);
    if (!procedure)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (procedure.special || procedure.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    while (list.length) {
      value = await procedure.call(this, value, list.shift());
      await promiseYield();
    }
    return value;
  }, {maximum: 3});


  def("crossmap", async (procname, ...lists) => {
    procname = sexpr(procname);

    const routine = this.routines.get(procname);
    if (!routine)
      throw err("{_PROC_}: Don't know how to {name:U}", { name: procname }, ERRORS.BAD_PROC);
    if (routine.special || routine.noeval)
      throw err("Can't apply {_PROC_} to special {name:U}", { name: procname }, ERRORS.BAD_INPUT);

    lists = lists.map(lexpr);
    if (!lists.length)
      throw err("{_PROC_}: Expected list", ERRORS.BAD_INPUT);

    // Special case: if only one element is present, use as list of lists.
    if (lists.length === 1)
      lists = lists[0].map(lexpr);

    const indexes = lists.map(() => 0);
    let done = false;

    const mapped = [];
    while (!done) {
      const args = indexes.map((v, i) => lists[i][v]);
      let pos = indexes.length - 1;
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
      const value = await routine.apply(this, args);
      mapped.push(value);
      await promiseYield();
    }
    return mapped;
  }, {minimum: 2, default: 2, maximum: -1});

  // Not Supported: cascade
  // Not Supported: cascade.2
  // Not Supported: transfer

  // Helper for testing that wraps a result in a Promise
  def(".promise", async value => value);

  def(".verify_bound_ignore", value => {
    if (this === undefined)
      throw new Error("Internal error: Unbound procedure");
  });
  def(".verify_bound_identity", value => {
    if (this === undefined)
      throw new Error("Internal error: Unbound procedure");
    return value;
  });
}
