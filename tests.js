/*global QUnit,LogoInterpreter,CanvasTurtle*/
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

var canvas_element = document.getElementById("sandbox"), canvas_ctx;
var turtle_element = document.getElementById("turtle"), turtle_ctx;

QUnit.module("Logo Unit Tests", {
  beforeEach: function(t) {
    // TODO: Replace with mock
    canvas_ctx = canvas_ctx || canvas_element.getContext('2d');
    turtle_ctx = turtle_ctx || turtle_element.getContext('2d');

    this.turtle = new CanvasTurtle(
      canvas_ctx,
      turtle_ctx,
      canvas_element.width, canvas_element.height);

    this.stream = {
      inputbuffer: "",

      read: function(prompt) {
        this.last_prompt = prompt;
        var res = this.inputbuffer;
        this.inputbuffer = "";
        return Promise.resolve(res);
      },

      outputbuffer: "",

      write: function() {
        for (var i = 0; i < arguments.length; i += 1) {
          this.outputbuffer += arguments[i];
        }
      },

      clear: function() {
        this.outputbuffer = "";
        this.last_prompt = undefined;
      },

      _font: 'monospace',
      get font() { return this._font; },
      set font(v) { this._font = v; },

      _color: 'black',
      get color() { return this._color; },
      set color(v) { this._color = v; },

      _size: 13,
      get size() { return this._size; },
      set size(v) { this._size = v; }
    };

    this.interpreter = new LogoInterpreter(this.turtle, this.stream);

    var EPSILON = 1e-12;

    this.assert_equals = function(expression, expected) {
      var actual = this.interpreter.run(expression, {returnResult: true});
      var done = t.async();
      actual.then(function (result) {
        if (typeof expected === 'object') {
          t.deepEqual(result, expected, expression);
        } else if (typeof expected === 'number' && typeof result === 'number' &&
                   (Math.floor(expected) != expected || Math.floor(result) != result)) {
          t.pushResult({
            result: Math.abs(result - expected) < EPSILON,
            actual: result,
            expected: expected,
            message: expression});
        } else {
          t.strictEqual(result, expected, expression);
        }
      }, function (failure) {
        t.strictEqual(failure, expected, expression);
      }).then(done);
    };

    this.assert_pixel = function(expression, x, y, rgba) {
      return this.assert_pixels(expression, [[x, y, rgba]]);
    };

    this.assert_pixels = function(expression, pixels) {
      var actual = this.interpreter.run(expression);
      var done = t.async();
      actual.then(function(result) {
        pixels.forEach(function(px) {
          var x = px[0]|0, y = px[1]|0, rgba = px[2];
          var pix = canvas_ctx.getImageData(x, y, 1, 1).data;
          t.deepEqual([pix[0], pix[1], pix[2], pix[3]], rgba,
                      expression + ': Pixel data at ' + x + ',' + y);
        });
      }, function(failure) {
        t.pushResult({
          result: false,
          actual: failure,
          expected: '(no error)',
          message: expression});
      }).then(done);
    };

    this.assert_stream = function(expression, expected) {
      this.stream.clear();
      var result = this.interpreter.run(expression, {returnResult: true});
      result = Promise.resolve(result);
      var done = t.async();
      result.then((function () {
        var actual = this.stream.outputbuffer;
        this.stream.clear();
        t.equal(actual, expected, expression);
      }).bind(this), (function (err) {
        var actual = this.stream.outputbuffer + "\nError: " + err;
        this.stream.clear();
        t.equal(actual, expected, expression);
      }).bind(this)).then(done);
    };

    this.assert_prompt = function(expression, expected) {
      this.stream.clear();
      var result = this.interpreter.run(expression, {returnResult: true});
      var done = t.async();
      result.then((function () {
        var actual = this.stream.last_prompt;
        this.stream.clear();
        t.equal(actual, expected, expression);
      }).bind(this), (function (err) {
        t.equal("(no error)", err, expression);
        this.stream.clear();
      }).bind(this)).then(done);
    };

    this.assert_predicate = function(expression, predicate) {
      var result = this.interpreter.run(expression, {returnResult: true});
      var done = t.async();
      result.then(function (value) {
        t.ok(predicate(value), expression);
      }, function (err) {
        t.equal("(no error)", err, expression);
      }).then(done);
    };

    this.assert_error = function(expression, expected, code) {
      var done = t.async();
      try {
        var result = this.interpreter.run(expression);
        result.then(function (result) {
          t.pushResult({
            result:false,
            actual: '(no error)',
            expected: expected,
            message:'Expected to error but did not: ' + expression});
          done();
        }, function (ex) {
          t.pushResult({
            result: ex.message === expected,
            actual: ex.message,
            expected: expected,
            message: 'Expected error from: ' + expression});
          if (code !== undefined) {
            t.pushResult({
              result: ex.code === code,
              actual: ex.code,
              expected: code,
              message: 'Expected error from: ' + expression});
          }
          done();
        });
      } catch (ex) {
        t.push({
          result: ex.message === expected,
          actual: ex.message,
          expected: expected,
          message: 'Expected error from: ' + expression});
        done();
      }
    };

    this.queue = function(task) {
      this.interpreter.queueTask(task.bind(this));
    };

    this.run = function(code) {
      this.interpreter.run(code).catch(function(error) {
        console.warn(error.message);
        t.pushResult({
          result: false,
          actual: 'Failed: ' + error.message,
          expected: '(no error)',
          message: code
        });
      });
    };
  }
});

QUnit.test("Parser", function(t) {

  // Comments
  this.assert_equals('"abc;comment', 'abc');
  this.assert_equals('"abc;comment\n', 'abc');
  this.assert_equals('"abc ; comment', 'abc');
  this.assert_equals('"abc ; comment\n', 'abc');

  this.assert_equals('"abc\\;comment', 'abc;comment');
  this.assert_equals('"abc\\;comment\n', 'abc;comment');

  // Continuations

  this.assert_equals('"abc~', 'abc~');
  this.assert_equals('"abc\n"def', 'def');
  this.assert_equals('"abc~\n', 'abc');
  this.assert_equals('"abc~\ndef', 'abcdef');
  this.assert_equals('"abc~\n~\ndef', 'abcdef');
  this.assert_equals('"abc~\nd~\nef', 'abcdef');
  this.assert_equals('"abc\\~\n', 'abc~');
  this.assert_equals('"abc\\~\n"def', 'def');

  // Comment and Continuations

  this.assert_equals('"abc;comment\n"def', 'def');
  this.assert_equals('"abc;comment~\ndef', 'abcdef');
  this.assert_equals('"abc;comment~\n~\ndef', 'abcdef');
  this.assert_equals('"abc;comment~\nde~\nf', 'abcdef');
  this.assert_equals('"abc;comment\\~\n', 'abc');
  this.assert_equals('"abc;comment\\~\n"def', 'def');

  // Escaping

  this.assert_equals('count [\\]]', 1);
  this.assert_equals('count [[][]]', 2);
  this.assert_equals('count [[]{}[]]', 3);
  this.assert_equals('count [\\[\\]\\{\\}\\[\\]]', 1);
  this.assert_equals('count [ \\[ \\] \\{ \\} \\[ \\]]', 6);
  this.assert_equals('count [   ]', 0);
  this.assert_equals('count [ \\  ]', 1);
  this.assert_equals('count [ \\ \\  ]', 1);
  this.assert_equals('count [ \\  \\  ]', 2);

  this.assert_equals('count [ abc;com ment\ndef  ]', 2);
  this.assert_equals('count [ abc;com ment~\ndef  ]', 1);
  this.assert_equals('count [ abc;com ment\\~\ndef  ]', 2);


  //
  // Types
  //

  this.assert_equals('"test', 'test');

  this.assert_equals('1', 1);
  this.assert_equals('[ a b c ]', ["a", "b", "c"]);
  this.assert_equals('[ 1 2 3 ]', ["1", "2", "3"]);
  this.assert_equals('[ 1 -2 3 ]', ["1", "-2", "3"]);
  this.assert_equals('[ 1-2 3 ]', ["1-2", "3"]);
  this.assert_equals('[ 1 2 [ 3 ] 4 *5 ]', ["1", "2", [ "3" ], "4", "*5"]);

  //
  // Unary Minus
  //

  this.assert_equals('-4', -4); // unary
  this.assert_equals('- 4 + 10', 6); // unary
  this.assert_equals('10 + - 4', 6); // unary
  this.assert_equals('(-4)', -4); // unary
  this.assert_equals('make "t 10 -4 :t', 10); // unary - the -4 is a statement
  this.assert_equals('make "t 10 - 4 :t', 6); // infix
  this.assert_equals('make "t 10-4 :t', 6); // infix
  this.assert_equals('make "t 10- 4 :t', 6); // infix
  this.assert_equals('sum 10 -4', 6); // unary
  this.assert_error('sum 10 - 4', 'Unexpected end of instructions'); // infix - should error
  this.assert_equals('sum 10 (-4)', 6); // unary
  this.assert_equals('sum 10 ( -4 )', 6); // unary
  this.assert_equals('sum 10 ( - 4 )', 6); // unary
  this.assert_equals('sum 10 (- 4)', 6); // unary

  //
  // Case insensitive
  //

  this.assert_equals('make "t 1 :t', 1);
  this.assert_equals('MAKE "t 1 :t', 1);
  this.assert_equals('MaKe "t 1 :t', 1);

  this.assert_equals('make "t 2 :t', 2);
  this.assert_equals('make "T 3 :t', 3);
  this.assert_equals('make "t 4 :T', 4);
  this.assert_equals('make "T 5 :T', 5);

  this.assert_equals('to foo output 6 end  foo', 6);
  this.assert_equals('to FOO output 7 end  foo', 7);
  this.assert_equals('to foo output 8 end  FOO', 8);
  this.assert_equals('to FOO output 9 end  FOO', 9);

  //
  // Lists
  //

  this.assert_stream('print [ Hello World ]', 'Hello World\n');

  //
  // Numbers
  //

  this.assert_stream('type .2 + .3', '0.5');

  //
  // Arrays
  //

  this.assert_equals('count { a b c }', 3);
  this.assert_equals('count { a b c }@0', 3);
  this.assert_equals('count { a b c }@123', 3);
  this.assert_equals('count { a b c } @ 0', 3);
  this.assert_error('make "a count { 1 2 3 }@1.5', "Don't know what to do with 0.5", 9);
  this.assert_equals('item 0 { 1 2 3 }@', '1');

  //
  // Nested Structures
  //

  this.assert_equals('count [ a b [ c d e ] f ]', 4);
  this.assert_equals('count { a b { c d e } f }', 4);
  this.assert_equals('count { a b [ c d e ] f }', 4);
  this.assert_equals('count [ a b { c d e } f ]', 4);


  this.assert_error('show ]', "Unexpected ']'");
  this.assert_error('show }', "Unexpected '}'");
  this.assert_error('show )', "Unexpected ')'");
});

QUnit.test("Data Structure Primitives", function(t) {
  //
  // 2.1 Constructors
  //

  this.assert_equals('word "hello "world', 'helloworld');
  this.assert_equals('(word "a "b "c)', 'abc');
  this.assert_equals('(word)', '');

  this.assert_equals('list 1 2', [1, 2]);
  this.assert_equals('(list 1 2 3)', [1, 2, 3]);

  this.assert_stream('show array 2', '{[] []}\n');
  this.assert_stream('make "a (array 5 0) ' +
                     'repeat 5 [ setitem repcount-1 :a repcount*repcount ] ' +
                     'show :a', '{1 4 9 16 25}@0\n');
  this.assert_stream('make "a { 1 2 3 } ' +
                     'show :a', '{1 2 3}\n');
  this.assert_stream('make "a { 1 2 3 } @ 10' +
                     'show :a', '{1 2 3}@10\n');

  this.assert_stream('show mdarray [2 2]', '{{[] []} {[] []}}\n');
  this.assert_stream('show mdarray [2 2 2]', '{{{[] []} {[] []}} {{[] []} {[] []}}}\n');
  this.assert_stream('show (mdarray [2 2] 0)', '{{[] []}@0 {[] []}@0}@0\n');
  this.assert_error('mdarray [1 2 0]', 'MDARRAY: Array size must be positive integer');

  this.assert_stream('show (listtoarray [ 1 2 3 ])', '{1 2 3}\n');
  this.assert_stream('show (listtoarray [ 1 2 3 ] 0)', '{1 2 3}@0\n');

  this.assert_equals('arraytolist {1 2 3}', ['1', '2', '3']);
  this.assert_equals('arraytolist {1 2 3}@0', ['1', '2', '3']);

  this.assert_equals('sentence 1 2', [1, 2]);
  this.assert_equals('se 1 2', [1, 2]);
  this.assert_equals('(sentence 1)', [1]);
  this.assert_equals('(sentence 1 2 3)', [1, 2, 3]);
  this.assert_equals('sentence [a] [b]', ["a", "b"]);
  this.assert_equals('sentence [a b] [c d]', ["a", "b", "c", "d"]);
  this.assert_equals('sentence 1 [2 3]', [1, "2", "3"]);

  this.assert_equals('fput 0 ( list 1 2 3 )', [0, 1, 2, 3]);
  this.assert_equals('fput "x "abc', 'xabc');

  this.assert_equals('lput 0 ( list 1 2 3 )', [1, 2, 3, 0]);
  this.assert_equals('lput "x "abc', 'abcx');

  this.assert_equals('combine "a "b', 'ab');
  this.assert_equals('combine "a [b]', ["a", "b"]);

  this.assert_equals('reverse [ a b c ]', ["c", "b", "a"]);
  this.assert_equals('reverse "abc', 'cba');
  this.assert_equals('(reverse [ a b c ] [ d e ])', ['c', 'b', 'a', 'd', 'e']);
  this.assert_equals('(reverse "abc "de)', 'cbade');
  this.assert_equals('(reverse "abc [ d e ])', ['c', 'b', 'a', 'd', 'e']);
  this.assert_equals('(reverse [ a b c ] "de)', 'cbade');

  this.assert_equals('gensym <> gensym', 1);

  //
  // 2.2 Data Selectors
  //

  this.assert_equals('first (list 1 2 3 )', 1);
  this.assert_equals('firsts [ [ 1 2 3 ] [ "a "b "c] ]', ["1", '"a']);
  this.assert_equals('last [ a b c ]', "c");
  this.assert_equals('butfirst [ a b c ]', ["b", "c"]);
  this.assert_equals('butfirst "abc', 'bc');
  this.assert_equals('bf [ a b c ]', ["b", "c"]);
  this.assert_equals('butfirsts [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('butfirsts [ 123 abc ]', ['23', 'bc']);
  this.assert_equals('bfs [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('butlast  [ a b c ]', ["a", "b"]);
  this.assert_equals('bl [ a b c ]', ["a", "b"]);

  this.assert_equals('first "123', '1');
  this.assert_equals('last  "123', '3');
  this.assert_equals('first "abc', 'a');
  this.assert_equals('last  "abc', 'c');
  this.assert_equals('butfirst "123', '23');
  this.assert_equals('butlast  "123', '12');

  this.assert_equals('first 123', '1');
  this.assert_equals('last  123', '3');
  this.assert_equals('butfirst 123', '23');
  this.assert_equals('butlast  123', '12');


  this.assert_error('item 0 [ a b c ]', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 [ a b c ]', "a");
  this.assert_equals('item 2 [ a b c ]', "b");
  this.assert_equals('item 3 [ a b c ]', "c");
  this.assert_error('item 4 [ a b c ]', 'ITEM: Index out of bounds');

  this.assert_error('item 0 { a b c }', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 { a b c }', "a");
  this.assert_equals('item 2 { a b c }', "b");
  this.assert_equals('item 3 { a b c }', "c");
  this.assert_error('item 4 { a b c }', 'ITEM: Index out of bounds');

  this.assert_equals('item 0 { a b c }@0', 'a');
  this.assert_equals('item 1 { a b c }@0', 'b');
  this.assert_equals('item 2 { a b c }@0', 'c');
  this.assert_error('item 3 { a b c }@0', 'ITEM: Index out of bounds');

  this.assert_error('item 0 "abc', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 "abc', "a");
  this.assert_equals('item 2 "abc', "b");
  this.assert_equals('item 3 "abc', "c");
  this.assert_error('item 4 "abc', 'ITEM: Index out of bounds');

  this.assert_error('item 0 456', 'ITEM: Index out of bounds');
  this.assert_equals('item 1 456', "4");
  this.assert_equals('item 2 456', "5");
  this.assert_equals('item 3 456', "6");
  this.assert_error('item 4 456', 'ITEM: Index out of bounds');

  this.assert_stream('make "a { a b c } ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a q c}\n');
  this.assert_stream('make "a { a b c }@0 ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a b q}@0\n');


  this.assert_error('mditem [0 1] mdarray [1 1]', 'MDITEM: Index out of bounds');
  this.assert_error('mditem [1 2] mdarray [1 1]', 'MDITEM: Index out of bounds');
  this.assert_equals('mditem [1 1] mdarray [1 1]', []);
  this.assert_equals('mditem [0 0] (mdarray [1 1] 0)', []);
  this.assert_stream('show mditem [1] mdarray [1 1]', '{[]}\n');
  this.assert_stream('make "a mdarray [ 2 2 ] ' +
                     'mdsetitem [1 1] :a 1 ' +
                     'mdsetitem [1 2] :a 2 ' +
                     'mdsetitem [2 1] :a 3 ' +
                     'mdsetitem [2 2] :a 4 ' +
                     'show :a', '{{1 2} {3 4}}\n');

  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('pick [ 1 2 3 4 ]', function(x) { return 1 <= x && x <= 4; });
  }
  this.assert_equals('remove "b [ a b c ]', ["a", "c"]);
  this.assert_equals('remove "d [ a b c ]', ["a", "b", "c"]);
  this.assert_equals('remove "b "abc', 'ac');

  this.assert_equals('remdup [ a b c a b c ]', ["a", "b", "c"]);
  this.assert_equals('remdup "abcabc', 'abc');

  this.assert_equals('quoted "abc', '"abc');
  this.assert_equals('quoted [ a b c ]', ['a', 'b', 'c']);

  this.assert_equals('split "a "banana', ['b', 'n', 'n']);
  this.assert_equals('split "a "alphabetical', ['lph', 'betic', 'l']);
  this.assert_equals('split 1 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['2', '3', '4'], ['2', '3', '4'], ['2', '3', '4']]);
  this.assert_equals('split 2 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1'], ['3', '4', '1'], ['3', '4', '1'], ['3', '4']]);
  this.assert_equals('split 3 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1', '2'], ['4', '1', '2'], ['4', '1', '2'], ['4']]);
  this.assert_equals('split 4 [1 2 3 4 1 2 3 4 1 2 3 4 ]', [['1', '2', '3'], ['1', '2', '3'], ['1', '2', '3']]);

  //
  // 2.3 Data Mutators
  //

  this.assert_equals('make "s [] repeat 5 [ push "s repcount ] :s', [5, 4, 3, 2, 1]);
  this.assert_equals('make "s "0 repeat 5 [ push "s repcount ] :s', '543210');

  this.assert_equals('make "s [ a b c ] (list pop "s pop "s pop "s)', ["a", "b", "c"]);
  this.assert_equals('make "s [ a b c ] pop "s pop "s  :s', ["c"]);
  this.assert_equals('make "s "abc (list pop "s pop "s pop "s)', ["a", "b", "c"]);
  this.assert_equals('make "s "abc  pop "s  :s', 'bc');

  this.assert_equals('make "q [] repeat 5 [ queue "q repcount ] :q', [1, 2, 3, 4, 5]);
  this.assert_equals('make "q "0 repeat 5 [ queue "q repcount ] :q', '012345');

  this.assert_equals('make "q [ a b c ] (list dequeue "q dequeue "q dequeue "q)', ["c", "b", "a"]);
  this.assert_equals('make "q [ a b c ]  dequeue "q  dequeue "q  :q', ["a"]);
  this.assert_equals('make "q "abc  (list dequeue "q dequeue "q dequeue "q)', ["c", "b", "a"]);
  this.assert_equals('make "q "abc  dequeue "q  :q', "ab");

  this.assert_equals('make "a { 1 }  make "b :a  setitem 1 :a 2  item 1 :b', 2);
  this.assert_error('make "a { 1 }  setitem 1 :a :a', "SETITEM: Can't create circular array");
  this.assert_error('make "a { 1 }  make "b { 1 }  setitem 1 :b :a  setitem 1 :a :b', "SETITEM: Can't create circular array");

  this.assert_equals('make "a mdarray [1 1]  make "b :a  mdsetitem [1 1] :a 2  mditem [1 1] :b', 2);
  this.assert_error('make "a mdarray [1 1]  mdsetitem [1 1] :a :a', "MDSETITEM: Can't create circular array");
  this.assert_error('mdsetitem [1 1] "x 0', "MDSETITEM: Expected array");
  this.assert_error('mdsetitem [1 1] {"x} 0', "MDSETITEM: Expected array");

  this.assert_equals('make "a []  .setfirst :a "s  :a', ['s']);
  this.assert_error('.setfirst "x "y', '.SETFIRST: Expected list');

  this.assert_equals('make "a [a]  .setbf :a [b c]  :a', ['a', 'b', 'c']);
  this.assert_error('.setbf "x [1]', '.SETBF: Expected non-empty list');
  this.assert_error('.setbf [] [1]', '.SETBF: Expected non-empty list');

  this.assert_equals('make "a { 1 }  make "b :a  .setitem 1 :a 2  item 1 :b', 2);
  this.assert_equals('make "a { 1 }  .setitem 1 :a :a  equalp item 1 :a :a', 1);
  this.assert_error('.setitem 1 "x 123', '.SETITEM: Expected array');

  //
  // 2.4 Predicates
  //

  this.assert_equals('wordp "a', 1);
  this.assert_equals('wordp 1', 1);
  this.assert_equals('wordp [ 1 ]', 0);
  this.assert_equals('wordp { 1 }', 0);
  this.assert_equals('word? "a', 1);
  this.assert_equals('word? 1', 1);
  this.assert_equals('word? [ 1 ]', 0);
  this.assert_equals('word? { 1 }', 0);

  this.assert_equals('listp "a', 0);
  this.assert_equals('listp 1', 0);
  this.assert_equals('listp [ 1 ]', 1);
  this.assert_equals('listp { 1 }', 0);
  this.assert_equals('list? "a', 0);
  this.assert_equals('list? 1', 0);
  this.assert_equals('list? [ 1 ]', 1);
  this.assert_equals('list? { 1 }', 0);

  this.assert_equals('arrayp "a', 0);
  this.assert_equals('arrayp 1', 0);
  this.assert_equals('arrayp [ 1 ]', 0);
  this.assert_equals('arrayp { 1 }', 1);
  this.assert_equals('array? "a', 0);
  this.assert_equals('array? 1', 0);
  this.assert_equals('array? [ 1 ]', 0);
  this.assert_equals('array? { 1 }', 1);

  this.assert_equals('equalp 3 4', 0);
  this.assert_equals('equalp 3 3', 1);
  this.assert_equals('equalp 3 2', 0);
  this.assert_equals('equal? 3 4', 0);
  this.assert_equals('equal? 3 3', 1);
  this.assert_equals('equal? 3 2', 0);
  this.assert_equals('3 = 4', 0);
  this.assert_equals('3 = 3', 1);
  this.assert_equals('3 = 2', 0);
  this.assert_equals('notequalp 3 4', 1);
  this.assert_equals('notequalp 3 3', 0);
  this.assert_equals('notequalp 3 2', 1);
  this.assert_equals('notequal? 3 4', 1);
  this.assert_equals('notequal? 3 3', 0);
  this.assert_equals('notequal? 3 2', 1);
  this.assert_equals('3 <> 4', 1);
  this.assert_equals('3 <> 3', 0);
  this.assert_equals('3 <> 2', 1);

  this.assert_equals('equalp "a "a', 1);
  this.assert_equals('equalp "a "b', 0);
  this.assert_equals('"a = "a', 1);
  this.assert_equals('"a = "b', 0);
  this.assert_equals('equalp [1 2] [1 2]', 1);
  this.assert_equals('equalp [1 2] [1 3]', 0);
  this.assert_equals('[ 1 2 ] = [ 1 2 ]', 1);
  this.assert_equals('[ 1 2 ] = [ 1 3 ]', 0);

  this.assert_equals('equalp {1} {1}', 0);
  this.assert_equals('make "a {1}  equalp :a :a', 1);
  this.assert_equals('{1} = {1}', 0);
  this.assert_equals('make "a {1}  :a = :a', 1);

  this.assert_equals('equalp "a 1', 0);
  this.assert_equals('equalp "a [ 1 ]', 0);
  this.assert_equals('equalp 1 [ 1 ]', 0);


  this.assert_equals('numberp "a', 0);
  this.assert_equals('numberp 1', 1);
  this.assert_equals('numberp [ 1 ]', 0);
  this.assert_equals('numberp { 1 }', 0);
  this.assert_equals('number? "a', 0);
  this.assert_equals('number? 1', 1);
  this.assert_equals('number? [ 1 ]', 0);
  this.assert_equals('number? { 1 }', 0);

  this.assert_equals('emptyp []', 1);
  this.assert_equals('empty? []', 1);
  this.assert_equals('emptyp [ 1 ]', 0);
  this.assert_equals('empty? [ 1 ]', 0);
  this.assert_equals('emptyp "', 1);
  this.assert_equals('empty? "', 1);
  this.assert_equals('emptyp "a', 0);
  this.assert_equals('empty? "a', 0);

  this.assert_equals('emptyp {}', 0);

  this.assert_equals('beforep "a "b', 1);
  this.assert_equals('beforep "b "b', 0);
  this.assert_equals('beforep "c "b', 0);
  this.assert_equals('before? "a "b', 1);
  this.assert_equals('before? "b "b', 0);
  this.assert_equals('before? "c "b', 0);

  this.assert_equals('.eq 1 1', false);
  this.assert_equals('.eq 1 "1', false);
  this.assert_equals('.eq [] []', false);
  this.assert_equals('.eq {} {}', false);
  this.assert_equals('make "a 1  .eq :a :a', false);
  this.assert_equals('make "a []  .eq :a :a', true);
  this.assert_equals('make "a {}  .eq :a :a', true);

  this.assert_equals('memberp "b [ a b c ]', 1);
  this.assert_equals('memberp "e [ a b c ]', 0);
  this.assert_equals('memberp [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
  this.assert_equals('member? "b [ a b c ]', 1);
  this.assert_equals('member? "e [ a b c ]', 0);
  this.assert_equals('member? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);

  this.assert_equals('substringp "a "abc', 1);
  this.assert_equals('substringp "z "abc', 0);
  this.assert_equals('substring? "a "abc', 1);
  this.assert_equals('substring? "z "abc', 0);

  //
  // 2.5 Queries
  //

  this.assert_equals('count [ ]', 0);
  this.assert_equals('count [ 1 ]', 1);
  this.assert_equals('count [ 1 2 ]', 2);
  this.assert_equals('count { 1 2 }@0', 2);
  this.assert_equals('count "', 0);
  this.assert_equals('count "a', 1);
  this.assert_equals('count "ab', 2);

  this.assert_equals('ascii "A', 65);
  this.assert_equals('char 65', 'A');

  this.assert_equals('member "a "banana', 'anana');
  this.assert_equals('member "z "banana', '');
  this.assert_equals('member 1 [1 2 3 1 2 3]', ['1', '2', '3', '1', '2', '3']);
  this.assert_equals('member 2 [1 2 3 1 2 3]', ['2', '3', '1', '2', '3']);
  this.assert_equals('member 3 [1 2 3 1 2 3]', ['3', '1', '2', '3']);
  this.assert_equals('member 4 [1 2 3 1 2 3]', []);

  this.assert_equals('lowercase "ABcd', 'abcd');
  this.assert_equals('uppercase "ABcd', 'ABCD');

  this.assert_equals('standout "whatever', '\uD835\uDC30\uD835\uDC21\uD835\uDC1A\uD835\uDC2D\uD835\uDC1E\uD835\uDC2F\uD835\uDC1E\uD835\uDC2B');
  this.assert_equals('standout "ABCabc123', '\uD835\uDC00\uD835\uDC01\uD835\uDC02\uD835\uDC1A\uD835\uDC1B\uD835\uDC1C\uD835\uDFCF\uD835\uDFD0\uD835\uDFD1');
  this.assert_equals('standout "!@#$_,.?', '!@#$_,.?');


  this.assert_equals('parse "1+\\(2\\ *\\ 3\\)', ['1+(2', '*', '3)']);
  this.assert_equals('runparse "1+\\(2\\ *\\ 3\\)', ['1', '+', '(', '2', '*', '3', ')']);

});

QUnit.test("Communication", function(t) {
  t.expect(33);

  // 3.1 Transmitters

  this.assert_stream('print "a', 'a\n');
  this.assert_stream('print 1', '1\n');
  this.assert_stream('print [ 1 ]', '1\n');
  this.assert_stream('print [ 1 [ 2 ] ]', '1 [2]\n');
  this.assert_stream('(print "a 1 [ 2 [ 3 ] ])', 'a 1 2 [3]\n');

  this.assert_stream('type "a', 'a');
  this.assert_stream('(type "a 1 [ 2 [ 3 ] ])', 'a12 [3]');

  this.assert_stream('(print "hello "world)', "hello world\n");
  this.assert_stream('(type "hello "world)', "helloworld");

  this.assert_stream('show "a', 'a\n');
  this.assert_stream('show 1', '1\n');
  this.assert_stream('show [ 1 ]', '[1]\n');
  this.assert_stream('show [ 1 [ 2 ] ]', '[1 [2]]\n');
  this.assert_stream('(show "a 1 [ 2 [ 3 ] ])', 'a 1 [2 [3]]\n');

  // 3.2 Receivers

  this.queue(function() { this.stream.inputbuffer = "1+2"; });
  this.assert_equals('readlist', ['1+2']);
  this.queue(function() { this.stream.inputbuffer = "1 + 2"; });
  this.assert_equals('readlist', ['1', '+', '2']);
  this.assert_prompt('readlist', undefined);
  this.assert_prompt('(readlist "query)', 'query');
  this.assert_prompt('(readlist [a b c])', 'a b c');

  this.queue(function() { this.stream.inputbuffer = "test"; });
  this.assert_equals('readword', 'test');
  this.queue(function() { this.stream.inputbuffer = "a b c 1 2 3"; });
  this.assert_equals('readword', 'a b c 1 2 3');
  this.assert_prompt('readword', undefined);
  this.assert_prompt('(readword "query)', 'query');
  this.assert_prompt('(readword [a b c])', 'a b c');

  // 3.3 File Access
  // 3.4 Terminal Access

  this.assert_stream('print "a cleartext', '');
  this.assert_stream('print "a ct', '');

  this.assert_equals('settextcolor "red  textcolor', 'red');
  this.assert_equals('settextcolor "#123456  textcolor', '#123456');
  this.assert_equals('settextcolor [ 0 100 0 ]  textcolor', '#00ff00');

  this.assert_equals('setfont "serif  font', 'serif');
  this.assert_equals('settextsize 66  textsize', 66);
  this.assert_equals('settextsize 100  increasefont  textsize', 125);
  this.assert_equals('settextsize 100  decreasefont  textsize', 80);

  this.stream.clear();
});

QUnit.test("Arithmetic", function(t) {
  t.expect(147);

  //
  // 4.1 Numeric Operations
  //

  this.assert_equals('sum 1 2', 3);
  this.assert_equals('(sum 1 2 3 4)', 10);
  this.assert_equals('1 + 2', 3);

  this.assert_equals('"3 + "2', 5);

  this.assert_equals('difference 3 1', 2);
  this.assert_equals('3 - 1', 2);
  this.assert_equals('minus 3 + 4', -(3 + 4));
  this.assert_equals('- 3 + 4', (-3) + 4);
  this.assert_equals('minus 3', -3);
  this.assert_equals('- 3', -3);
  this.assert_equals('product 2 3', 6);
  this.assert_equals('(product 2 3 4)', 24);
  this.assert_equals('2 * 3', 6);
  this.assert_equals('quotient 6 2', 3);
  this.assert_equals('(quotient 2)', 1 / 2);
  this.assert_equals('6 / 2', 3);

  this.assert_equals('remainder 7 4', 3);
  this.assert_equals('remainder 7 -4', 3);
  this.assert_equals('remainder -7 4', -3);
  this.assert_equals('remainder -7 -4', -3);
  this.assert_equals('7 % 4', 3);
  this.assert_equals('7 % -4', 3);
  this.assert_equals('-7 % 4', -3);
  this.assert_equals('-7 % -4', -3);

  this.assert_equals('modulo 7 4', 3);
  this.assert_equals('modulo 7 -4', -3);
  this.assert_equals('modulo -7 4', 3);
  this.assert_equals('modulo -7 -4', -3);

  this.assert_equals('abs -1', 1);
  this.assert_equals('abs 0', 0);
  this.assert_equals('abs 1', 1);


  this.assert_equals('int 3.5', 3);
  this.assert_equals('int -3.5', -3);
  this.assert_equals('round 2.4', 2);
  this.assert_equals('round 2.5', 3);
  this.assert_equals('round 2.6', 3);
  this.assert_equals('round -2.4', -2);
  this.assert_equals('round -2.5', -2);
  this.assert_equals('round -2.6', -3);

  this.assert_equals('sqrt 9', 3);
  this.assert_equals('power 3 2', 9);
  this.assert_equals('3 ^ 2', 9);

  this.assert_equals('exp 2', 7.38905609893065);
  this.assert_equals('log10 100', 2);
  this.assert_equals('ln 9', 2.1972245773362196);

  this.assert_equals('arctan 1', 45);
  this.assert_equals('2*(arctan 0 1)', 180);
  this.assert_equals('sin 30', 0.5);
  this.assert_equals('cos 60', 0.5);
  this.assert_equals('tan 45', 1);

  this.assert_equals('radarctan 1', Math.PI / 4);
  this.assert_equals('2*(radarctan 0 1)', Math.PI);
  this.assert_equals('radsin 0.5235987755982988', 0.5);
  this.assert_equals('radcos 1.0471975511965976', 0.5);
  this.assert_equals('radtan 0.7853981633974483', 1);

  this.assert_equals('iseq 1 4', [1, 2, 3, 4]);
  this.assert_equals('iseq 3 7', [3, 4, 5, 6, 7]);
  this.assert_equals('iseq 7 3', [7, 6, 5, 4, 3]);

  this.assert_equals('rseq 3 5 9', [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5]);
  this.assert_equals('rseq 3 5 5', [3, 3.5, 4, 4.5, 5]);

  //
  // 4.2 Numeric Predicates
  //

  this.assert_equals('greaterp 3 4', 0);
  this.assert_equals('greaterp 3 3', 0);
  this.assert_equals('greaterp 3 2', 1);
  this.assert_equals('greater? 3 4', 0);
  this.assert_equals('greater? 3 3', 0);
  this.assert_equals('greater? 3 2', 1);
  this.assert_equals('3 > 4', 0);
  this.assert_equals('3 > 3', 0);
  this.assert_equals('3 > 2', 1);
  this.assert_equals('greaterequalp 3 4', 0);
  this.assert_equals('greaterequalp 3 3', 1);
  this.assert_equals('greaterequalp 3 2', 1);
  this.assert_equals('greaterequal? 3 4', 0);
  this.assert_equals('greaterequal? 3 3', 1);
  this.assert_equals('greaterequal? 3 2', 1);
  this.assert_equals('3 >= 4', 0);
  this.assert_equals('3 >= 3', 1);
  this.assert_equals('3 >= 2', 1);
  this.assert_equals('lessp 3 4', 1);
  this.assert_equals('lessp 3 3', 0);
  this.assert_equals('lessp 3 2', 0);
  this.assert_equals('less? 3 4', 1);
  this.assert_equals('less? 3 3', 0);
  this.assert_equals('less? 3 2', 0);
  this.assert_equals('3 < 4', 1);
  this.assert_equals('3 < 3', 0);
  this.assert_equals('3 < 2', 0);
  this.assert_equals('lessequalp 3 4', 1);
  this.assert_equals('lessequalp 3 3', 1);
  this.assert_equals('lessequalp 3 2', 0);
  this.assert_equals('lessequal? 3 4', 1);
  this.assert_equals('lessequal? 3 3', 1);
  this.assert_equals('lessequal? 3 2', 0);
  this.assert_equals('3 <= 4', 1);
  this.assert_equals('3 <= 3', 1);
  this.assert_equals('3 <= 2', 0);

  this.assert_equals('"3 < "22', 1);

  //
  // 4.3 Random Numbers
  //

  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('random 10', function(x) { return 0 <= x && x < 10; });
  }
  for (i = 0; i < 10; i += 1) {
    this.assert_predicate('(random 1 6)', function(x) { return 1 <= x && x <= 6; });
  }
  this.assert_equals('rerandom  make "x random 100  rerandom  make "y random 100  :x - :y', 0);
  this.assert_equals('(rerandom 123) make "x random 100  (rerandom 123)  make "y random 100  :x - :y', 0);

  //
  // 4.4 Print Formatting
  //

  this.assert_stream('type form 123.456 10 0', '       123');
  this.assert_stream('type form 123.456 10 1', '     123.5'); // note rounding
  this.assert_stream('type form 123.456 10 2', '    123.46'); // note rounding
  this.assert_stream('type form 123.456 10 3', '   123.456');
  this.assert_stream('type form 123.456 10 4', '  123.4560');
  this.assert_stream('type form 123.456 10 5', ' 123.45600');
  this.assert_stream('type form 123.456 10 6', '123.456000');
  this.assert_stream('type form 123.456 10 7', '123.4560000');
  this.assert_stream('type form 123.456 10 8', '123.45600000');

  //
  // 4.5 Bitwise Operations
  //

  this.assert_equals('bitand 1 2', 0);
  this.assert_equals('bitand 7 2', 2);
  this.assert_equals('(bitand 7 11 15)', 3);

  this.assert_equals('bitor 1 2', 3);
  this.assert_equals('bitor 7 2', 7);
  this.assert_equals('(bitor 1 2 4)', 7);

  this.assert_equals('bitxor 1 2', 3);
  this.assert_equals('bitxor 7 2', 5);
  this.assert_equals('(bitxor 1 2 7)', 4);

  this.assert_equals('bitnot 0', -1);
  this.assert_equals('bitnot -1', 0);
  this.assert_equals('bitand (bitnot 123) 123', 0);

  this.assert_equals('ashift 1 2', 4);
  this.assert_equals('ashift 8 -2', 2);
  this.assert_equals('lshift 1 2', 4);
  this.assert_equals('lshift 8 -2', 2);

  this.assert_equals('ashift -1024 -1', -512);
  this.assert_equals('ashift -1 -1', -1);
  this.assert_equals('lshift -1 -1', 0x7fffffff);
});

QUnit.test("Logical Operations", function(t) {
  t.expect(29);

  this.assert_equals('true', 1);
  this.assert_equals('false', 0);
  this.assert_equals('and 0 0', 0);
  this.assert_equals('and 0 1', 0);
  this.assert_equals('and 1 0', 0);
  this.assert_equals('and 1 1', 1);
  this.assert_equals('(and 0 0 0)', 0);
  this.assert_equals('(and 1 0 1)', 0);
  this.assert_equals('(and 1 1 1)', 1);
  this.assert_equals('or 0 0', 0);
  this.assert_equals('or 0 1', 1);
  this.assert_equals('or 1 0', 1);
  this.assert_equals('or 1 1', 1);
  this.assert_equals('(or 0 0 0)', 0);
  this.assert_equals('(or 1 0 1)', 1);
  this.assert_equals('(or 1 1 1)', 1);
  this.assert_equals('xor 0 0', 0);
  this.assert_equals('xor 0 1', 1);
  this.assert_equals('xor 1 0', 1);
  this.assert_equals('xor 1 1', 0);
  this.assert_equals('(xor 0 0 0)', 0);
  this.assert_equals('(xor 1 0 1)', 0);
  this.assert_equals('(xor 1 1 1)', 1);
  this.assert_equals('not 0', 1);
  this.assert_equals('not 1', 0);

  // short circuits

  this.assert_stream('and 0 (print "nope)', '');
  this.assert_stream('or 1 (print "nope)', '');

  this.assert_stream('and 1 (type "yup)', 'yup');
  this.assert_stream('or 0 (type "yup)', 'yup');
});

QUnit.test("Graphics", function(t) {
  t.expect(158);

  // NOTE: test canvas is 300,300 (so -150...150 coordinates before hitting)
  // edge
  var white = [0xff, 0xff, 0xff, 0xff],
      black = [0, 0, 0, 0xff],
      red = [0xff, 0, 0, 0xff];

  this.run('clearscreen');
  this.assert_equals('clean home (list heading xcor ycor)', [0, 0, 0]);
  this.assert_pixel('cs', 150, 150, [0xff,0xff,0xff,0xff]);

  //
  // 6.1 Turtle Motion
  //

  this.assert_equals('home forward 100 pos', [0, 100]);
  this.assert_equals('home fd 100 pos', [0, 100]);
  this.assert_equals('home back 100 pos', [0, -100]);
  this.assert_equals('home bk 100 pos', [0, -100]);
  this.assert_equals('home left 45 heading', -45);
  this.assert_equals('home lt 45 heading', -45);
  this.assert_equals('home right 45 heading', 45);
  this.assert_equals('home rt 45 heading', 45);

  this.assert_equals('home \u2190 heading', -15);
  this.assert_equals('home \u2192 heading', 15);
  this.assert_equals('home \u2191 pos', [0, 10]);
  this.assert_equals('home \u2193 pos', [0, -10]);


  this.assert_equals('setpos [ 12 34 ] pos', [12, 34]);
  this.assert_equals('setxy 56 78 pos', [56, 78]);
  this.assert_equals('setxy 0 0 (list xcor ycor)', [0, 0]);
  this.assert_equals('setx 123 xcor', 123);
  this.assert_equals('sety 45 ycor', 45);
  this.assert_equals('setheading 69 heading', 69);
  this.assert_equals('seth 13 heading', 13);

  this.assert_equals('forward 100 rt 90 home (list heading xcor ycor)', [0, 0, 0]);

  this.assert_equals('home arc 123 456 (list heading xcor ycor)', [0, 0, 0]);

  this.assert_pixels('cs  setpw 10  arc 45 100', [
    [150, 150, white],
    [150+100*Math.cos(Math.PI * 8/8), 150-100*Math.sin(Math.PI * 8/8)|0, white],
    [150+100*Math.cos(Math.PI * 7/8), 150-100*Math.sin(Math.PI * 7/8)|0, white],
    [150+100*Math.cos(Math.PI * 6/8), 150-100*Math.sin(Math.PI * 6/8)|0, white],
    [150+100*Math.cos(Math.PI * 5/8), 150-100*Math.sin(Math.PI * 5/8)|0, white],
    [150+100*Math.cos(Math.PI * 4/8), 150-100*Math.sin(Math.PI * 4/8)|0, black],
    [150+100*Math.cos(Math.PI * 3/8), 150-100*Math.sin(Math.PI * 3/8)|0, black],
    [150+100*Math.cos(Math.PI * 2/8), 150-100*Math.sin(Math.PI * 2/8)|0, black],
    [150+100*Math.cos(Math.PI * 1/8), 150-100*Math.sin(Math.PI * 1/8)|0, white],
    [150+100*Math.cos(Math.PI * 0/8), 150-100*Math.sin(Math.PI * 0/8)|0, white]
  ]);
  this.assert_pixels('cs  setpw 10  arc -45 100', [
    [150, 150, white],
    [150+100*Math.cos(Math.PI * 8/8), 150-100*Math.sin(Math.PI * 8/8)|0, white],
    [150+100*Math.cos(Math.PI * 7/8), 150-100*Math.sin(Math.PI * 7/8)|0, white],
    [150+100*Math.cos(Math.PI * 6/8), 150-100*Math.sin(Math.PI * 6/8)|0, black],
    [150+100*Math.cos(Math.PI * 5/8), 150-100*Math.sin(Math.PI * 5/8)|0, black],
    [150+100*Math.cos(Math.PI * 4/8), 150-100*Math.sin(Math.PI * 4/8)|0, black],
    [150+100*Math.cos(Math.PI * 3/8), 150-100*Math.sin(Math.PI * 3/8)|0, white],
    [150+100*Math.cos(Math.PI * 2/8), 150-100*Math.sin(Math.PI * 2/8)|0, white],
    [150+100*Math.cos(Math.PI * 1/8), 150-100*Math.sin(Math.PI * 1/8)|0, white],
    [150+100*Math.cos(Math.PI * 0/8), 150-100*Math.sin(Math.PI * 0/8)|0, white]
  ]);

  this.assert_pixels('cs  pu  setxy 50 50  arc 360 20  fill', [
    [150, 150, white],
    [150 + 50, 150 - 50, black]
  ]);

  ['"red', '4', '[99 0 0]'].forEach(function(color) {
    this.assert_pixels('cs  pu  filled ' + color + ' [ arc 135 100 ]', [
      [150, 150, white],
      [150 + 100, 150 - 100, white],
      [150 + 10, 150 - 90, red],
      [150 + 90, 150, red],
    ]);
  }.bind(this));

  //
  // 6.2 Turtle Motion Queries
  //

  this.assert_equals('setpos [ 12 34 ] pos', [12, 34]);
  this.assert_equals('setx 123 xcor', 123);
  this.assert_equals('sety 45 ycor', 45);
  this.assert_equals('setheading 69 heading', 69);
  this.assert_equals('seth 69 heading', 69);
  this.assert_equals('setxy -100 -100 towards [ 0 0 ]', 45);

  //
  // 6.3 Turtle and Window Control
  //

  this.assert_equals('showturtle shownp', 1);
  this.assert_equals('st shownp', 1);
  this.assert_equals('hideturtle shownp', 0);
  this.assert_equals('ht shownp', 0);
  this.assert_equals('setpos [ 12 34 ] clean pos', [12, 34]);
  this.assert_equals('setpos [ 12 34 ] clearscreen (list heading xcor ycor)', [0, 0, 0]);
  this.assert_equals('setpos [ 12 34 ] cs (list heading xcor ycor)', [0, 0, 0]);
  this.assert_equals('wrap turtlemode', 'WRAP');

  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [-140, -140]);
  this.assert_equals('window turtlemode', 'WINDOW');
  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [160, 160]);

  this.assert_equals('fence turtlemode', 'FENCE');
  this.assert_equals('setxy 0 0 setxy 160 160 (list xcor ycor)', [150, 150]);

  this.assert_equals('wrap turtlemode', 'WRAP');

  this.assert_equals('(label "a 1 [ 2 [ 3 ] ])', undefined);
  this.assert_equals('setlabelheight 5 labelsize', [5, 5]);
  this.assert_equals('setlabelheight 10 labelsize', [10, 10]);

  this.assert_equals('setpalette 8 "pink  palette 8', 'pink');
  this.assert_equals('setpalette 9 [0 50 99]  palette 9', '#0080ff');

  this.assert_equals('setlabelfont "Times\\ New\\ Roman  labelfont', 'Times New Roman');

  this.assert_equals('cs  wrap  setscrunch 0.5 0.5  fd 50 pos', [0, 50]);
  this.assert_equals('cs  wrap  setscrunch 0.5 0.5  fd 350 pos', [0, -250]);
  this.assert_equals('cs  setscrunch 1 0.5  setxy 50 50  setscrunch 1 1  pos', [50, 25]);


  // SETSCRUNCH + ARC
  this.assert_pixels('cs  setscrunch 0.5 1.5  setpw 10  arc 360 100', [
    [150, 150, white],

    [150 - 100, 150, white],
    [150 + 100, 150, white],
    [150 - 50, 150, black],
    [150 + 50, 150, black],

    [150, 150 - 100, white],
    [150, 150 + 100, white],
    [150, 150 - 149, black],
    [150, 150 + 149, black]
  ]);

  // WRAP + SETSCRUNCH + ARC
  this.assert_pixels('cs  setscrunch 0.5 3  setpw 10  arc 360 100', [
    [150, 150, black],

    [150 - 100, 150, white],
    [150 + 100, 150, white],
    [150 - 50, 150, black],
    [150 + 50, 150, black],

    [150, 150 - 100, white],
    [150, 150 + 100, white],
    [150, 150 - 149, white],
    [150, 150 + 149, white]
  ]);

  this.run('cs setscrunch 1 1');

  //
  // 6.4 Turtle and Window Queries
  //

  this.assert_equals('showturtle shownp', 1);
  this.assert_equals('hideturtle shownp', 0);

  this.assert_equals('wrap turtlemode', 'WRAP');
  this.assert_equals('window turtlemode', 'WINDOW');
  this.assert_equals('fence turtlemode', 'FENCE');
  this.assert_equals('wrap turtlemode', 'WRAP');


  this.assert_equals('setlabelheight 5 labelsize', [5, 5]);

  //
  // 6.5 Pen and Background Control
  //

  this.assert_equals('pendown pendownp', 1);
  this.assert_equals('penup pendownp', 0);
  this.assert_equals('pd pendownp', 1);
  this.assert_equals('pu pendownp', 0);
  this.run('pendown');

  this.assert_equals('penpaint penmode', 'PAINT');
  this.assert_equals('penerase penmode', 'ERASE');
  this.assert_equals('penreverse penmode', 'REVERSE');
  this.run('penpaint');

  this.assert_equals('setpencolor 0 pencolor', 'black');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, black);

  this.assert_equals('setpc 0 pencolor', 'black');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, black);

  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, [0x12, 0x34, 0x56, 0xff]);

  this.assert_equals('setpencolor [0 50 99] pencolor', '#0080ff');
  this.assert_pixel('cs setpw 10  fd 0', 150, 150, [0, 0x80, 0xff, 0xff]);

  this.assert_equals('setpensize 6 pensize', [6, 6]);
  this.assert_equals('setpensize [6 6] pensize', [6, 6]);

  this.assert_equals('setbackground 0 background', 'black');
  this.assert_equals('setscreencolor 0 background', 'black');
  this.assert_equals('setsc 0 background', 'black');
  this.assert_equals('setbackground "#123456 background', '#123456');
  this.assert_equals('setbackground [0 50 99] background', '#0080ff');
  this.assert_pixel('setbackground "white', 150, 150, white);
  this.assert_pixel('setbackground "red', 150, 150, red);

  //
  // 6.6 Pen Queries
  //

  this.assert_equals('pendown pendownp', 1);
  this.assert_equals('penup pendownp', 0);

  this.assert_equals('penpaint penmode', 'PAINT');
  this.assert_equals('penerase penmode', 'ERASE');
  this.assert_equals('penreverse penmode', 'REVERSE');

  this.assert_equals('setpencolor 0 pencolor', 'black');
  this.assert_equals('setpencolor "#123456 pencolor', '#123456');

  this.assert_equals('setpalette 8 "pink  palette 8', 'pink');
  this.assert_equals('setpalette 9 [0 50 99]  palette 9', '#0080ff');

  this.assert_equals('setpensize 6 pensize', [6, 6]);

  this.assert_equals('setsc 0 background', 'black');
  this.assert_equals('setsc 0 getscreencolor', 'black');
  this.assert_equals('setsc 0 getsc', 'black');
  this.assert_equals('setsc "#123456 background', '#123456');
  this.assert_equals('setsc "#123456 getscreencolor', '#123456');
  this.assert_equals('setsc "#123456 getsc', '#123456');
  this.assert_equals('setsc [0 50 99] background', '#0080ff');
  this.assert_equals('setsc [0 50 99] getscreencolor', '#0080ff');

  // 6.7 Saving and Loading Pictures

  // 6.8 Mouse Queries

  this.assert_equals('button', 0);
  this.assert_equals('buttonp', 0);
  this.assert_equals('button?', 0);
  this.assert_equals('mousepos', [0, 0]);
  this.assert_equals('clickpos', [0, 0]);
});

QUnit.test("Workspace Management", function(t) {
  t.expect(197);

  //
  // 7.1 Procedure Definition
  //

  this.assert_equals('to square :x output :x * :x end  square 5', 25);
  this.assert_equals('to foo output 5 end  foo', 5);
  this.assert_equals('to foo :x :y output 5 end  foo 1 2', 5);
  this.assert_equals('to foo :x :y output :x + :y end  foo 1 2', 3);
  this.assert_equals('to foo :x :y output :x + :y end  def "foo', 'to foo :x :y\n  output :x + :y\nend');
  this.assert_equals('to foo :x bar 1 "a + :x [ 1 2 ] end  def "foo', 'to foo :x\n  bar 1 "a + :x [ 1 2 ]\nend');
  this.assert_equals('to foo output 1 + 2 - 3 * 4 / 5 % 6 ^ -1 end  def "foo', 'to foo\n  output 1 + 2 - 3 * 4 / 5 % 6 ^ -1\nend');

  this.assert_equals('to square :x output :x * :x end  copydef "multbyself "square  multbyself 5', 25);

  this.assert_equals('define "square [[x][output :x * :x]]  square 5', 25);
  this.assert_equals('make "a 0  define "p [[][repeat 5 [ make "a :a + 1 ]]]  p 5  :a', 5);

  this.assert_equals('to foo :x :y output :x + :y end  text "foo',
                     [['x', 'y'], ['output', ':x', '+', ':y']]);
  this.assert_equals('to foo :x bar 1 "a + :x [ 1 2 ] end  text "foo',
                     [['x'], ['bar', '1', '"a', '+', ':x', [ '1', '2' ]]]);
  this.assert_equals('to foo output 1 + 2 - 3 * 4 / 5 % 6 ^ -1 end  text "foo',
                     [[], ['output', '1', '+', '2', '-', '3', '*', '4', '/', '5', '%', '6', '^', '<UNARYMINUS>', '1']]);

  // Various combinations of inputs, optional inputs, rest, and default length

  // No inputs
  this.assert_equals('to foo (output 1) end  (foo)', 1);

  // + Required inputs
  this.assert_error('to foo :a (output :a) end  (foo)', 'Not enough inputs for FOO');
  this.assert_equals('to foo :a (output :a) end  (foo 1)', 1);

  this.assert_error('to foo :a :b output (list :a :b) end  (foo)', 'Not enough inputs for FOO');
  this.assert_error('to foo :a :b output (list :a :b) end  (foo 1)', 'Not enough inputs for FOO');
  this.assert_equals('to foo :a :b output (list :a :b)) end  (foo 1 2)', [1, 2]);
  this.assert_equals('to foo :a :b output (list :a :b)) end  foo 1 2', [1, 2]);
  this.assert_equals('to foo :a :b output (list :a :b)) end  foo 1 2 3', 3);

  // + Optional inputs
  this.assert_equals('to foo [:a 6] output (list :a) end  (foo)', [6]);
  this.assert_equals('to foo [:a 6] output (list :a) end  (foo 1)', [1]);
  this.assert_equals('to foo [:a 6] [:b 7] output (list :a :b) end  (foo)', [6, 7]);
  this.assert_equals('to foo [:a 6] [:b 7] output (list :a :b) end  (foo 1)', [1, 7]);
  this.assert_equals('to foo [:a 6] [:b 7] output (list :a :b) end  (foo 1 2)', [1, 2]);
  this.assert_error('to foo [:a 6] [:b 7] output (list :a :b) end  (foo 1 2 3)', 'Too many inputs for FOO');

  this.assert_equals('to foo :a [:b 6] output (list :a :b) end  (foo 1)', [1, 6]);
  this.assert_equals('to foo :a [:b 6] output (list :a :b) end  (foo 1 2)', [1, 2]);

  this.assert_error('to foo :a :b [:c 6] output (list :a :b :c) end  (foo 1)', 'Not enough inputs for FOO');
  this.assert_equals('to foo :a :b [:c 6] output (list :a :b :c) end  (foo 1 2)', [1, 2, 6]);
  this.assert_equals('to foo :a :b [:c 6] output (list :a :b :c) end  (foo 1 2 3)', [1, 2, 3]);

  // + Rest inputs
  this.assert_equals('to foo [:r] output :r end  (foo)', []);
  this.assert_equals('to foo [:r] output :r end  (foo 1 2)', [1, 2]);

  this.assert_error('to foo :a [:r] output (list :a :r) end  (foo)', 'Not enough inputs for FOO');
  this.assert_equals('to foo :a [:r] output (list :a :r) end  (foo 1)', [1, []]);
  this.assert_equals('to foo :a [:r] output (list :a :r) end  (foo 1 2)', [1, [2]]);
  this.assert_equals('to foo :a [:r] output (list :a :r) end  (foo 1 2 3)', [1, [2, 3]]);

  this.assert_equals('to foo :a :b [:r] output (list :a :b :r) end  (foo 1 2)', [1, 2, []]);
  this.assert_equals('to foo :a :b [:r] output (list :a :b :r) end  (foo 1 2 3)', [1, 2, [3]]);
  this.assert_equals('to foo [:a 6] [:r] output (list :a :r) end  (foo)', [6, []]);
  this.assert_equals('to foo [:a 6] [:r] output (list :a :r) end  (foo 1)', [1, []]);
  this.assert_equals('to foo [:a 6] [:r] output (list :a :r) end  (foo 1 2)', [1, [2]]);
  this.assert_equals('to foo [:a 6] [:r] output (list :a :r) end  (foo 1 2 3)', [1, [2, 3]]);

  // + Default length
  this.assert_error('to foo 4 end', 'TO: Bad default number of inputs for FOO');
  this.assert_error('to foo :a :b 1 end', 'TO: Bad default number of inputs for FOO');
  this.assert_error('to foo :a :b 3 end', 'TO: Bad default number of inputs for FOO');
  this.assert_error('to foo :a [:b 0] 0 end', 'TO: Bad default number of inputs for FOO');
  this.assert_error('to foo :a [:b 0] 3 end', 'TO: Bad default number of inputs for FOO');

  this.assert_equals('to foo :a 1 output (list :a) end  (foo 1)', [1]);
  this.assert_equals('to foo :a :b 2 output (list :a :b) end  (foo 1 2)', [1, 2]);
  this.assert_equals('to foo [:a 6] 0 output (list :a) end  (list foo 1 2 3)', [[6], 1, 2, 3]);
  this.assert_equals('to foo [:a 6] 1 output (list :a) end  (list foo 1 2 3)', [[1], 2, 3]);
  this.assert_equals('to foo :a [:b 6] 1 output (list :a :b) end  (list foo 1 2 3)', [[1, 6], 2, 3]);
  this.assert_equals('to foo :a [:b 6] 2 output (list :a :b) end  (list foo 1 2 3)', [[1, 2], 3]);

  this.assert_equals('to foo [:r] 2 output :r end  (list foo 1 2 3 4)', [[1, 2], 3, 4]);
  this.assert_equals('to foo :a [:r] 1 output (list :a :r) end  (list foo 1 2 3 4)', [[1, []], 2, 3, 4]);
  this.assert_equals('to foo :a [:r] 2 output (list :a :r) end  (list foo 1 2 3 4)', [[1, [2]], 3, 4]);
  this.assert_equals('to foo :a [:r] 3 output (list :a :r) end  (list foo 1 2 3 4)', [[1, [2, 3]], 4]);
  this.assert_equals('to foo [:a 6] [:r] 0 output (list :a :r) end  (list foo 1 2 3 4)', [[6, []], 1, 2, 3, 4]);
  this.assert_equals('to foo [:a 6] [:r] 1 output (list :a :r) end  (list foo 1 2 3 4)', [[1, []], 2, 3, 4]);
  this.assert_equals('to foo [:a 6] [:r] 2 output (list :a :r) end  (list foo 1 2 3 4)', [[1, [2]], 3, 4]);
  this.assert_equals('to foo [:a 6] [:r] 3 output (list :a :r) end  (list foo 1 2 3 4)', [[1, [2, 3]], 4]);
  this.assert_equals('to foo :a [:b 6] [:r] 1 output (list :a :b :r) end  (list foo 1 2 3 4)', [[1, 6, []], 2, 3, 4]);
  this.assert_equals('to foo :a [:b 6] [:r] 2 output (list :a :b :r) end  (list foo 1 2 3 4)', [[1, 2, []], 3, 4]);
  this.assert_equals('to foo :a [:b 6] [:r] 3 output (list :a :b :r) end  (list foo 1 2 3 4)', [[1, 2, [3]], 4]);
  this.assert_equals('to foo :a [:b 6] [:r] 4 output (list :a :b :r) end  (list foo 1 2 3 4)', [[1, 2, [3, 4]]]);

  // "a default value expression can be based on earlier inputs"
  this.assert_equals('to foo :a [:b :a + 5] output (list :a :b) end  (foo 1)', [1, 6]);
  this.assert_equals('to foo :a [:b :a + 5] [:c :b * :b ] output :c  end  (foo 1)', 36);

  this.assert_equals('to foo :a [:b 1 + 2] [:c] 2 (show :a :b :c)  end  text "foo',
                     [['a', ["b", ['1', '+', '2']], ['c'], 2], ['(', 'show', ':a', ':b', ':c', ')']]);

  this.assert_equals('to foo :a [:b 1 + 2] [:c] 2 (show :a :b :c)  end  def "foo',
                     'to foo :a [:b 1 + 2] [:c] 2\n  ( show :a :b :c )\nend');

  this.assert_equals('define "foo [[a [b 1 + 2] [c] 2] [ (show :a :b :c) ]]  text "foo',
                     [['a', ["b", ['1', '+', '2']], ['c'], 2], ['(', 'show', ':a', ':b', ':c', ')']]);

  // TODO: copydef + redefp

  //
  // 7.2 Variable Definition
  //

  this.assert_equals('make "foo 5 :foo', 5);
  this.assert_equals('make "foo "a :foo', 'a');
  this.assert_equals('make "foo [a b] :foo', ["a", "b"]);
  this.assert_equals('make "n "alpha make :n "beta :alpha', 'beta');

  // by default, make operates in global scope
  this.assert_equals('to dofoo ' +
                '  make "foo 456 ' +
                '  output :foo ' +
                'end ' +
                'make "foo 123 ' +
                'dofoo + :foo', 456 + 456);

  this.assert_equals('to dofoo2 :foo ' +
                '  make "foo 456 ' +
                '  output :foo + :foo ' +
                'end ' +
                'make "foo 123 ' +
                '(dofoo2 111) + :foo', 123 + 456 + 456);

  this.assert_equals('name 5 "foo :foo', 5);
  this.assert_equals('name "a "foo :foo', 'a');
  this.assert_equals('name [a b] "foo :foo', ["a", "b"]);
  this.assert_equals('name "gamma "m  name "delta :m :gamma', 'delta');

  this.assert_equals('to dofoo ' +
                '  local "foo ' +
                '  make "foo 456' +
                '  output :foo ' +
                'end ' +
                'make "foo 123 ' +
                'dofoo + :foo', 456 + 123);

  this.assert_equals('to dofoo ' +
                '  localmake "foo 456' +
                '  output :foo ' +
                'end ' +
                'make "foo 123 ' +
                'dofoo + :foo', 456 + 123);

  this.assert_equals('make "baz 321 thing "baz', 321);
  this.assert_equals('make "baz "a thing "baz', 'a');
  this.assert_equals('make "baz [a b c] thing "baz', ["a", "b", "c"]);

  this.assert_equals('global "foo 1', 1); // Doesn't actually test anything
  this.assert_equals('(global "foo "bar) 1', 1); // Doesn't actually test anything

  this.assert_equals('procedurep "notdefined', 0);
  this.assert_equals('to foo end  procedurep "foo', 1);
  this.assert_equals('procedure? "notdefined', 0);
  this.assert_equals('to foo end  procedure? "foo', 1);

  this.assert_equals('primitivep "notdefined', 0);
  this.assert_equals('to foo end  primitivep "foo', 0);
  this.assert_equals('primitivep "sentence', 1);
  this.assert_equals('primitive? "notdefined', 0);
  this.assert_equals('to foo end  primitive? "foo', 0);
  this.assert_equals('primitive? "sentence', 1);

  this.assert_equals('definedp "notdefined', 0);
  this.assert_equals('to foo end  definedp "foo', 1);
  this.assert_equals('definedp "sentence', 0);
  this.assert_equals('defined? "notdefined', 0);
  this.assert_equals('to foo end  defined? "foo', 1);
  this.assert_equals('defined? "sentence', 0);

  this.assert_equals('namep "notdefined', 0);
  this.assert_equals('make "foo 5 namep "foo', 1);

  // 7.3 Property Lists

  this.assert_equals('plistp "lname', 0);
  this.assert_equals('pprop "lname "pname 123  gprop "lname "pname', 123);
  this.assert_equals('gprop "lname "nosuchprop', []);
  this.assert_equals('plist "lname', ["pname", 123]);
  this.assert_equals('plistp "lname', 1);
  this.assert_equals('remprop "lname "pname  plist "lname', []);
  this.assert_equals('plistp "lname', 0);
  this.assert_equals('pprop "lname "pname 123  gprop "LNAME "PNAME', 123);

  // 7.4 Workspace Predicates
  // (tested above)

  //
  // 7.5 Workspace Queries
  //

  this.assert_equals('unburyall erall  contents', [[], [], []]);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  contents', [['b'], ['a'], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  procedures', ['b']);

  this.assert_equals('memberp "firsts primitives', 1);
  this.assert_equals('memberp "nopenopefirsts primitives', 0);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  globals', ['a']);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  names', [[], ['a']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  plists', [[], [], ['c']]);

  this.assert_equals('namelist "a', [[], ['a']]);
  this.assert_equals('namelist [a]', [[], ['a']]);
  this.assert_equals('namelist [a b c]', [[], ['a', 'b', 'c']]);
  this.assert_equals('pllist "a', [[], [], ['a']]);
  this.assert_equals('pllist [a]', [[], [], ['a']]);
  this.assert_equals('pllist [a b c]', [[], [], ['a', 'b', 'c']]);

  this.assert_equals('to foo end  arity "foo', [0, 0, 0]);
  this.assert_equals('to foo :a end  arity "foo', [1, 1, 1]);
  this.assert_equals('to foo :a :b end  arity "foo', [2, 2, 2]);
  this.assert_equals('to foo [:a 1] end  arity "foo', [0, 0, 1]);
  this.assert_equals('to foo [:a 1] [:b 1] end  arity "foo', [0, 0, 2]);
  this.assert_equals('to foo :a [:b 1] end  arity "foo', [1, 1, 2]);
  this.assert_equals('to foo :a :b [:c 1] end  arity "foo', [2, 2, 3]);
  this.assert_equals('to foo [:r] end  arity "foo', [0, 0, -1]);
  this.assert_equals('to foo :a [:r] end  arity "foo', [1, 1, -1]);
  this.assert_equals('to foo :a :b [:r] end  arity "foo', [2, 2, -1]);
  this.assert_equals('to foo [:a 1] [:r] end  arity "foo', [0, 0, -1]);
  this.assert_equals('to foo [:a 1] [:b 1] [:r] end  arity "foo', [0, 0, -1]);
  this.assert_equals('to foo :a [:b 1] [:r] end  arity "foo', [1, 1, -1]);
  this.assert_equals('to foo :a :b [:c 1] [:r] end  arity "foo', [2, 2, -1]);

  this.assert_equals('to foo 0 end  arity "foo', [0, 0, 0]);
  this.assert_equals('to foo :a 1 end  arity "foo', [1, 1, 1]);
  this.assert_equals('to foo :a :b 2 end  arity "foo', [2, 2, 2]);
  this.assert_equals('to foo [:a 1] 0 end  arity "foo', [0, 0, 1]);
  this.assert_equals('to foo [:a 1] 1 end  arity "foo', [0, 1, 1]);
  this.assert_equals('to foo [:a 1] [:b 1] 0 end  arity "foo', [0, 0, 2]);
  this.assert_equals('to foo [:a 1] [:b 1] 1 end  arity "foo', [0, 1, 2]);
  this.assert_equals('to foo [:a 1] [:b 1] 2 end  arity "foo', [0, 2, 2]);
  this.assert_equals('to foo :a [:b 1] 1 end  arity "foo', [1, 1, 2]);
  this.assert_equals('to foo :a [:b 1] 2 end  arity "foo', [1, 2, 2]);
  this.assert_equals('to foo :a :b [:c 1] 2 end  arity "foo', [2, 2, 3]);
  this.assert_equals('to foo :a :b [:c 1] 3 end  arity "foo', [2, 3, 3]);
  this.assert_equals('to foo [:r] 4 end  arity "foo', [0, 4, -1]);
  this.assert_equals('to foo :a [:r] 4 end  arity "foo', [1, 4, -1]);
  this.assert_equals('to foo :a :b [:r] 4 end  arity "foo', [2, 4, -1]);
  this.assert_equals('to foo :a [:b 1] [:r] 4 end  arity "foo', [1, 4, -1]);
  this.assert_equals('to foo [:a 1] [:r] 4 end  arity "foo', [0, 4, -1]);
  this.assert_equals('to foo [:a 1] [:b 1] [:r] 4 end  arity "foo', [0, 4, -1]);
  this.assert_equals('to foo :a :b [:c 1] [:r] 4 end  arity "foo', [2, 4, -1]);

  this.assert_equals('unburyall erall  make "a 1  make "b 2  to a output 1 end  to b output 2 end  erase [[a] [b]]  contents', [['b'], ['a'], []]);
  this.assert_equals('unburyall erall  make "a 1  make "b 2  to a output 1 end  to b output 2 end  erall  contents', [[], [], []]);
  // TODO: erase + redefp

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  erps [[b]]  contents', [[], ['a'], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  erns [[a]]  contents', [['b'], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  erpls [[c]]  contents', [['b'], ['a'], []]);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  ern "a  contents', [['b'], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  ern [a]  contents', [['b'], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  erpl "c  contents', [['b'], ['a'], []]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  erpl [c]  contents', [['b'], ['a'], []]);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[b]]  contents', [[], ['a'], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [a]]  contents', [['b'], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [] [c]]  contents', [['b'], ['a'], []]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall  contents', [[], [], []]);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall unbury [[b]]  contents', [['b'], [], []]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall unbury [[] [a]]  contents', [[], ['a'], []]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall unbury [[] [] [c]]  contents', [[], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall  unburyall  contents', [['b'], ['a'], ['c']]);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buriedp [[b]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[b]]  buriedp [[b]]', 1);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[b]]  buriedp [[] [a]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[b]]  buriedp [[] [] [c]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buriedp [[] [a]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [a]]  buriedp [[b]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [a]]  buriedp [[] [a]]', 1);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [a]]  buriedp [[] [] [c]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buriedp [[] [] [c]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [] [c]]  buriedp [[b]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [] [c]]  buriedp [[] [a]]', 0);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  bury [[] [] [c]]  buriedp [[] [] [c]]', 1);

  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryname "a  contents', [['b'], [], ['c']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  buryall unburyname "a  contents', [[], ['a'], []]);

  this.assert_equals('buried', [['b'], [], ['c']]);
  // TODO: tests when STEP and TRACE are actually implemented.
  this.assert_equals('stepped', [[],[],[]]);
  this.assert_equals('traced', [[],[],[]]);

  // 7.6 Workspace Inspection
  // 7.7 Workspace Control

  this.assert_equals('pprop "pl "p 1  erase [[] [] [pl]]  gprop "pl "p', []);

});

QUnit.test("Control Structures", function(t) {
  t.expect(114);
  //
  // 8.1 Control
  //
  this.assert_equals('make "c 0  run [ ]  :c', 0);
  this.assert_equals('make "c 0  run [ make "c 5 ]  :c', 5);

  this.assert_equals('run [1]', 1);
  this.assert_error('show run [ ]', 'No output from procedure');

  this.assert_equals('runresult [ make "x 1 ]', []);
  this.assert_equals('runresult [ 1 + 2 ]', [3]);

  this.assert_equals('make "c 0  repeat 5 [ make "c :c + 1 ]  :c', 5);
  this.assert_equals('make "c 0  repeat 4 [ make "c :c + repcount ]  :c', 10);
  this.assert_equals('make "c 0  repeat 4 [ make "c :c + # ]  :c', 10);

  this.assert_equals('make "c 0  to foo forever [ make "c :c + 1 if repcount = 5 [ stop ] ] end  foo  :c', 5);
  this.assert_equals('make "c 0  to foo forever [ make "c :c + repcount if repcount = 4 [ stop ] ] end  foo  :c', 10);

  this.assert_equals('make "r "a  if 1 [ make "r "b ]  :r', 'b');
  this.assert_equals('make "r "a  if 0 [ make "r "b ]  :r', 'a');
  this.assert_equals('if 1 [ "a ]', 'a');
  this.assert_error('show if 0 [ "a ]', 'No output from procedure');
  this.assert_equals('make "r "a  if [1<2] [ make "r "b ]  :r', 'b');
  this.assert_equals('make "r "a  if [1>2] [ make "r "b ]  :r', 'a');
  this.assert_equals('if [1<2] [ "a ]', 'a');
  this.assert_error('show if [1>2] [ "a ]', 'No output from procedure');

  this.assert_equals('(if 1 [ make "r "a ] [ make "r "b ])  :r', 'a');
  this.assert_equals('(if 0 [ make "r "a ] [ make "r "b ])  :r', 'b');
  this.assert_equals('(if 1 [ "a ] [ "b ])', 'a');
  this.assert_equals('(if 0 [ "a ] [ "b ])', 'b');
  this.assert_equals('(if [1<2] [ make "r "a ] [ make "r "b ])  :r', 'a');
  this.assert_equals('(if [1>2] [ make "r "a ] [ make "r "b ])  :r', 'b');
  this.assert_equals('(if [1<2] [ "a ] [ "b ])', 'a');
  this.assert_equals('(if [1>2] [ "a ] [ "b ])', 'b');

  this.assert_equals('ifelse 1 [ make "r "a ] [ make "r "b ]  :r', 'a');
  this.assert_equals('ifelse 0 [ make "r "a ] [ make "r "b ]  :r', 'b');
  this.assert_equals('ifelse 1 [ "a ] [ "b ]', 'a');
  this.assert_equals('ifelse 0 [ "a ] [ "b ]', 'b');
  this.assert_equals('ifelse [1<2] [ make "r "a ] [ make "r "b ]  :r', 'a');
  this.assert_equals('ifelse [1>2] [ make "r "a ] [ make "r "b ]  :r', 'b');
  this.assert_equals('ifelse [1<2] [ "a ] [ "b ]', 'a');
  this.assert_equals('ifelse [1>2] [ "a ] [ "b ]', 'b');

  this.assert_equals('to foo if 1 [ output "a ] output "b end  foo', 'a');
  this.assert_equals('to foo if 0 [ output "a ] output "b end  foo', 'b');

  this.assert_equals('make "c 1  test 2 > 1  iftrue  [ make "c 2 ]  :c', 2);
  this.assert_equals('make "c 1  test 2 > 1  ift  [ make "c 2 ]  :c', 2);
  this.assert_equals('make "c 1  test 2 > 1  iffalse [ make "c 2 ]  :c', 1);
  this.assert_equals('make "c 1  test 2 > 1  iff [ make "c 2 ]  :c', 1);

  this.assert_equals('test 2 > 1  iftrue  [ "a ]', 'a');
  this.assert_error('test 1 > 2  show iftrue  [ "a ]', 'No output from procedure');
  this.assert_equals('test 1 > 2  iffalse [ "a ]', 'a');
  this.assert_error('test 2 > 1  show iffalse [ "a ]', 'No output from procedure');

  // Introduce new scope, since root scope persists across tests.
  this.assert_error('to x iftrue [ "a ] end  x', 'IFTRUE: Called without TEST');
  this.assert_error('to x iffalse [ "b ] end  x', 'IFFALSE: Called without TEST');

  this.assert_equals('to foo forever [ if repcount = 5 [ make "c 234 stop ] ] end  foo  :c', 234);

  this.assert_stream('catch "x [ show "a throw "x show "b ] show "b', 'a\nb\n');
  this.assert_equals('catch "x [ show "a (throw "x "z) show "b ]', 'z');
  this.assert_error('catch "x [ throw "q ]', 'No CATCH for tag Q');
  this.assert_error('throw "q', 'No CATCH for tag Q');

  this.assert_equals('catch "x [ show "a throw "x show "b ] error',
                     [21, 'No CATCH for tag X', 'THROW', -1]);
  this.assert_equals('catch "x [ show "a (throw "x "z) show "b ] error',
                     [35, 'No CATCH for tag X', 'THROW', -1]);
  this.assert_equals('catch "ERROR [ show 1 / 0 ] error',
                     [4, 'Division by zero', 'SHOW', -1]);

  var now;
  this.queue(function() { now = Date.now(); });
  this.assert_equals('wait 60/6', undefined);
  this.queue(function() { t.ok((Date.now() - now) >= (1000/6)); });

  this.assert_equals('forever [ if repcount = 5 [ bye ] ]', undefined);

  this.assert_equals('to foo output 123 end  foo', 123);
  this.assert_equals('to foo op 123 end  foo', 123);


  this.assert_equals('to foo .maybeoutput 5 end  foo', 5);
  this.assert_equals('to foo .maybeoutput make "c 0 end  foo', undefined);


  this.assert_equals('ignore 1 > 2', undefined);

  this.assert_equals('`[foo baz ,[bf [a b c]] garply ,@[bf [a b c]]]',
                     [ 'foo', 'baz', ['b', 'c'], 'garply', 'b', 'c']);
  this.assert_equals('make "n "x `[",:n]', ['"x']);
  this.assert_equals('make "n "x `[:,:n]', [':x']);


  this.assert_equals('make "x 0  for [ r 1 5 ] [ make "x :x + :r ]  :x', 15);
  this.assert_equals('make "x 0  for [ r 0 10 2 ] [ make "x :x + :r ]  :x', 30);

  this.assert_equals('make "x 0  for [ r 10 0 -2 ] [ make "x :x + :r ]  :x', 30);
  this.assert_equals('make "x 0  for [ r 10 0 -2-2 ] [ make "x :x + :r ]  :x', 18);

  this.assert_equals('make "x 0  for [ r 10 10 ] [ make "x :x + :r ]  :x', 10);
  this.assert_equals('make "x 0  for [ r 10 10 1 ] [ make "x :x + :r ]  :x', 10);
  this.assert_equals('make "x 0  for [ r 10 10 -1 ] [ make "x :x + :r ]  :x', 10);

  this.assert_equals('make "x 0  for [ r 10 20 -1 ] [ make "x :x + :r ]  :x', 0);
  this.assert_equals('make "x 0  for [ r 20 10 1 ] [ make "x :x + :r ]  :x', 0);

  this.assert_equals('make "x 0  dotimes [ i 5 ] [ make "x :x + :i ]  :x', 15);
  this.assert_equals('make "x 0  dotimes [ i 0 ] [ make "x :x + :i ]  :x', 0);

  this.assert_equals('make "x 0  do.while [ make "x :x + 1 ] :x < 10  :x', 10);
  this.assert_equals('make "x 0  do.while [ make "x :x + 1 ] [:x < 10]  :x', 10);
  this.assert_equals('make "x 0  while :x < 10 [ make "x :x + 1 ]     :x', 10);
  this.assert_equals('make "x 0  while [:x < 10] [ make "x :x + 1 ]     :x', 10);

  this.assert_equals('make "x 0  do.until [ make "x :x + 1 ] :x > 10  :x', 11);
  this.assert_equals('make "x 0  do.until [ make "x :x + 1 ] [:x > 10]  :x', 11);
  this.assert_equals('make "x 0  until :x > 10 [ make "x :x + 1 ]     :x', 11);
  this.assert_equals('make "x 0  until [:x > 10] [ make "x :x + 1 ]     :x', 11);

  this.assert_equals('to vowelp :letter ' +
                     '  output case :letter [ [[a e i o u] "true] [else "false] ] ' +
                     'end ' +
                     '(list vowelp "a vowelp "b', ['true', 'false']);

  this.assert_equals('to evenp :n ' +
                     '  output not bitand :n 1 ' +
                     'end ' +
                     'to evens :numbers ' +
                     '  op cond [ [ [emptyp :numbers]      [] ] ' +
                     '            [ [evenp first :numbers] ' +
                     '              fput first :numbers evens butfirst :numbers] '+
                     '            [ else evens butfirst :numbers] '+
                     ' ] ' +
                     'end ' +
                     'evens [ 1 2 3 4 5 6 ]', ['2', '4', '6']);

  this.assert_equals('cond [ [ [2<3] "yep ] [ else "nope ]]', 'yep');
  this.assert_equals('cond [ [ [2>3] "yep ] [ else "nope ]]', 'nope');

  //
  // 8.2 Template-based Iteration
  //

  this.run("to add_async :a :b output .promise :a + :b end");
  this.run("to numberp_async :a output .promise numberp :a end");

  this.assert_equals('apply "word ["a "b "c]', '"a"b"c');
  this.assert_equals('apply "add_async [1 2]', 3);

  this.assert_equals('invoke "word "a', 'a');
  this.assert_equals('(invoke "word "a "b "c)', 'abc');
  this.assert_equals('(invoke "word)', '');
  this.assert_equals('(invoke "add_async 1 2)', 3);

  this.assert_equals('make "x 0  to addx :a make "x :x+:a end  foreach "addx [ 1 2 3 4 5 ]  :x', 15);
  this.assert_equals('make "x 0  to addx :a make "x .promise :x+:a end  foreach "addx [ 1 2 3 4 5 ]  :x', 15);

  this.assert_equals('to double :x output :x * 2 end  map "double [ 1 2 3 ]', [2, 4, 6]);
  this.assert_equals('to double :x output .promise :x * 2 end  map "double [ 1 2 3 ]', [2, 4, 6]);

  this.assert_equals('(map "sum [1 2 3] [40 50 60] [700 800 900])', [741, 852, 963]);
  this.assert_equals('(map "item [2 1 2 3] [john paul george ringo])', ['o', 'p', 'e', 'n']);

  this.assert_equals('to odd :x output :x % 2 end  filter "odd [ 1 2 3 ]', ["1", "3"]);
  this.assert_equals('to odd :x output .promise :x % 2 end  filter "odd [ 1 2 3 ]', ["1", "3"]);

  this.assert_equals('find "numberp (list "a "b "c 4 "e "f )', 4);
  this.assert_equals('find "numberp (list "a "b "c "d "e "f )', []);
  this.assert_equals('find "numberp_async (list "a "b "c 4 "e "f )', 4);
  this.assert_equals('find "numberp_async (list "a "b "c "d "e "f )', []);

  this.assert_equals('reduce "sum [ 1 2 3 4 ]', 10);
  this.assert_equals('(reduce "sum [ 1 2 3 4 ] 10)', 20);
  this.assert_equals('reduce "add_async [ 1 2 3 4 ]', 10);
  this.assert_equals('(reduce "add_async [ 1 2 3 4 ] 10)', 20);

  this.assert_equals('(crossmap "word [a b c] [1 2 3 4])',
                     ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4']);
  this.assert_equals('(crossmap "word [a b] [1 2])', ['a1', 'a2', 'b1', 'b2']);
  this.assert_equals('crossmap "word [[a b] [1 2]]', ['a1', 'a2', 'b1', 'b2']);

  // TODO: Order of operations
  // TODO: Structures, lists of lists
});

QUnit.test("Error Messages", function(t) {
  this.assert_error("to foo end show foo", "No output from procedure", 5);
  this.assert_error("[ 1 2", "Expected ']'", 26);
  this.assert_error("{ 1 2", "Expected '}'", 27);
  this.assert_error("[ 1 2 }", "Unexpected '}'", 27);
  this.assert_error("{ 1 2 ]", "Unexpected ']'", 26);
  this.assert_error('make "a { 1 2 3 }@1.5', "Don't know what to do with 0.5", 9);

  //this.assert_error("!@#$", "Couldn't parse: '!@#$'");
  this.assert_error("show :nosuchvar", "Don't know about variable NOSUCHVAR", 11);
  this.assert_error("1 / 0", "Division by zero", 4);
  this.assert_error("1 % 0", "Division by zero", 4);
  this.assert_error("1 + -", "Unexpected end of instructions");
  this.assert_error("( 1 + 2", "Expected ')'", 10);
  this.assert_error("( 1 + 2 3", "Expected ')', saw 3", 10);
  this.assert_error("nosuchproc", "Don't know how to NOSUCHPROC", 24);
  this.assert_error("1 + \"1+2", "Expected number", 4);
  this.assert_error("1 + []", "Expected number", 4);
  this.assert_error("(minus [])", "Expected number", 4);
  this.assert_error("make [] 123", "Expected string", 4);
  this.assert_error("(def [])", "Expected string", 4);

  this.assert_error('fd50', "Need a space between FD and 50", 39);

  this.assert_error("(erase {})", "ERASE: Expected list", 4);
  this.assert_error("(map \"show {})", "MAP: Expected list", 4);
  this.assert_error("(map \"sum [1 2] [1])", "MAP: Expected lists of equal length", 4);
  this.assert_error("to 123", "TO: Expected identifier");
  this.assert_error("to +", "TO: Expected identifier");
  this.assert_error("to fd :x bk :x end", "TO: Can't redefine primitive FD", 22);
  this.assert_error("define \"fd [[x] [bk :x]]", "DEFINE: Can't redefine primitive FD", 22);
  this.assert_error("define \"fd [[x]]", "DEFINE: Expected list of length 2", 4);
  this.assert_error("def \"nosuchproc", "DEF: Don't know how to NOSUCHPROC", 24);
  this.assert_error("def \"def", "DEF: Can't show definition of primitive DEF", 22);
  this.assert_error("text \"nosuchproc", "TEXT: Don't know how to NOSUCHPROC", 24);
  this.assert_error("text \"text", "TEXT: Can't show definition of primitive TEXT", 22);
  this.assert_error("text \"nosuchproc", "TEXT: Don't know how to NOSUCHPROC", 24);
  this.assert_error("text \"def", "TEXT: Can't show definition of primitive DEF", 22);
  this.assert_error("item 5 [ 1 2 ]", "ITEM: Index out of bounds", 4);
  this.assert_error("copydef \"newname \"nosuchproc", "COPYDEF: Don't know how to NOSUCHPROC", 24);
  this.assert_error("to foo end  copydef \"to \"foo", "COPYDEF: Can't overwrite special TO", 4);
  this.assert_error("to foo end  copydef \"show \"foo", "COPYDEF: Can't overwrite primitives unless REDEFP is TRUE", 4);
  this.assert_error("erase [ [ TO ] [ ] ]", "Can't ERASE special TO", 4);
  this.assert_error("erase [ [ SHOW ] [ ] ]", "Can't ERASE primitives unless REDEFP is TRUE", 4);
  this.assert_error("do.while 1 2", "DO.WHILE: Expected block", 4);
  this.assert_error("while 1 2", "WHILE: Expected block", 4);
  this.assert_error("do.until 1 2", "DO.UNTIL: Expected block", 4);
  this.assert_error("until 1 2", "UNTIL: Expected block", 4);
  this.assert_error("apply \"nosuch [ 1 2 ]", "APPLY: Don't know how to NOSUCH", 24);
  this.assert_error("apply \"to [ 1 2 ]", "Can't apply APPLY to special TO", 4);
  this.assert_error("apply \"while [ 1 2 ]", "Can't apply APPLY to special WHILE", 4);
  this.assert_error("foreach \"nosuch [ 1 2 ]", "FOREACH: Don't know how to NOSUCH", 24);
  this.assert_error("foreach \"to [ 1 2 ]", "Can't apply FOREACH to special TO", 4);
  this.assert_error("foreach \"while [ 1 2 ]", "Can't apply FOREACH to special WHILE", 4);
  this.assert_error("invoke \"nosuch [ 1 2 ]", "INVOKE: Don't know how to NOSUCH", 24);
  this.assert_error("invoke \"to [ 1 2 ]", "Can't apply INVOKE to special TO", 4);
  this.assert_error("invoke \"while [ 1 2 ]", "Can't apply INVOKE to special WHILE", 4);
  this.assert_error("map \"nosuch [ 1 2 ]", "MAP: Don't know how to NOSUCH", 24);
  this.assert_error("map \"to [ 1 2 ]", "Can't apply MAP to special TO", 4);
  this.assert_error("map \"while [ 1 2 ]", "Can't apply MAP to special WHILE", 4);
  this.assert_error("filter \"nosuch [ 1 2 ]", "FILTER: Don't know how to NOSUCH", 24);
  this.assert_error("filter \"to [ 1 2 ]", "Can't apply FILTER to special TO", 4);
  this.assert_error("filter \"while [ 1 2 ]", "Can't apply FILTER to special WHILE", 4);
  this.assert_error("find \"nosuch [ 1 2 ]", "FIND: Don't know how to NOSUCH", 24);
  this.assert_error("find \"to [ 1 2 ]", "Can't apply FIND to special TO", 4);
  this.assert_error("find \"while [ 1 2 ]", "Can't apply FIND to special WHILE", 4);
  this.assert_error("reduce \"nosuch [ 1 2 ]", "REDUCE: Don't know how to NOSUCH", 24);
  this.assert_error("reduce \"to [ 1 2 ]", "Can't apply REDUCE to special TO", 4);
  this.assert_error("reduce \"while [ 1 2 ]", "Can't apply REDUCE to special WHILE", 4);
  this.assert_error("0", "Don't know what to do with 0", 9);
  this.assert_error("1 + 2", "Don't know what to do with 3", 9);
  this.assert_error("to foo output 123 end  foo", "Don't know what to do with 123", 9);
  this.assert_error('setpos []', 'SETPOS: Expected list of length 2', 4);
  this.assert_error('setpos [1 2 3]', 'SETPOS: Expected list of length 2', 4);
  this.assert_error('towards []', 'TOWARDS: Expected list of length 2', 4);
  this.assert_error('item 3 { 1 2 }', 'ITEM: Index out of bounds', 4);
  this.assert_error('setitem 3 { 1 2 } 0', 'SETITEM: Index out of bounds', 4);

});

QUnit.test("Regression Tests", function(t) {
  this.assert_error('ern "i  make "x :i + 1', "Don't know about variable I");
  this.assert_equals('make "x 0  repeat 3 [ for [ i 1 4 ] [ make "x :x + 1 ] ]  :x', 12);
  this.assert_error('ern "i  for [i 0 100 :i+1] []', "Don't know about variable I");
  this.assert_error('ern "i  for [i 0 100 :i + 1] []', "Don't know about variable I");
  this.assert_equals('make "i 5  make "x 0  for [ i 0 100 :i ] [ make "x :x + :i ]  :x', 1050);
  this.assert_error("fd 100 50 rt 90", "Don't know what to do with 50");
  this.assert_equals("to foo output 123 end  make \"v foo", undefined);
  this.assert_equals("to foo end", undefined);
  this.assert_equals("setpos [ -1 0 ]  123", 123);
  this.assert_equals("to foo output 234 end foo", 234);
  this.assert_equals("to foo output 234 END foo", 234);
  this.assert_error("to whatever fd 100", "TO: Expected END");
  this.assert_equals('"abc;def', "abc");
  this.assert_equals('"abc\\;def', "abc;def");
  this.assert_equals('"abc\\\\def', "abc\\def");
  this.assert_equals('"a\\ b', 'a b');
  this.assert_equals('repeat 1 [ make "v "abc\\;def ]  :v', "abc\\;def");
  this.assert_error('repeat 1 [ make "v "abc;def ]  :v', "Expected ']'");
  this.assert_equals('make "a [ a b c ]  make "b :a  pop "a  :b', ["a", "b", "c"]);
  this.assert_equals('to foo :BAR output :BAR end  foo 1', 1);
  this.assert_equals('(word "a (char 10) "b)', 'a\nb');

  this.assert_equals('equalp "1 1', 1);
  this.assert_equals('equalp 1 "1', 1);
  this.assert_equals('equalp "1.0 1', 1);
  this.assert_equals('equalp 1.0 "1', 1);
  this.assert_equals('equalp "1 1.0', 1);
  this.assert_equals('equalp 1 "1.0', 1);
  this.assert_equals('equalp "1 "1.0', 0);

  this.assert_equals('make "a { 1 }  make "b :a  setitem 1 :a 2  item 1 :b', 2);
  this.assert_equals('show "b\n1', 1);

  this.assert_equals('to f output 1 end (f + 1)', 2);
  this.assert_equals('setpos [150 150]  setheading 0  fd 10  pos ', [150, -140]);

  this.assert_equals(
    'make "a 0  do.while [ make "a :a + 1 ] notequalp :a 5  :a', 5);
});

QUnit.test("API Tests", function(t) {
  // LogoInterpeter#copydef(newname, oldname)
  this.assert_error('yup', "Don't know how to YUP");
  this.assert_error('nope', "Don't know how to NOPE");

  this.queue(function() {
    this.interpreter.copydef('yup', 'true');
    this.interpreter.copydef('nope', 'false');
  });
  this.assert_equals('yup', 1);
  this.assert_equals('nope', 0);

  // LogoInterpreter#localize
  this.assert_error("1 / 0", "Division by zero");
  this.assert_error("item 5 [ 1 2 ]", "ITEM: Index out of bounds");
  this.queue(function() {
    this.interpreter.localize = function(s) {
      return {
        'Division by zero': 'Divido per nulo',
        '{_PROC_}: Index out of bounds': '{_PROC_}: Indekso ekster limojn'
      }[s];
    };
  });
  this.assert_error("1 / 0", "Divido per nulo");
  this.assert_error("item 5 [ 1 2 ]", "ITEM: Indekso ekster limojn");

  // LogoInterpreter#keywordAlias
  this.assert_error('to foo output 2 fino  foo', "TO: Expected END");
  this.assert_equals('case 2 [[[1] "a"] [alie "b]]', undefined);
  this.queue(function() {
    this.interpreter.keywordAlias = function(s) {
      return {
        'FINO': 'END',
        'ALIE': 'ELSE'
      }[s];
    };
  });
  this.assert_equals('case 2 [[[1] "a"] [alie "b]]', 'b');
  this.assert_equals('to foo output 2 fino  foo', 2);

  // LogoInterpreter#colorAlias
  var done = t.async();
  var hookCalled = false;
  this.queue(function() {
    this.interpreter.colorAlias = function(s) {
      hookCalled = hookCalled || (s === 'internationalorange');
    };
  });
  this.run('setpencolor "internationalorange');
  this.queue(function() {
    t.ok(hookCalled);
    done();
  });
});

QUnit.test("Arity of Primitives", function(t) {
  var arities = [
    //['*', [1, 1, 1]],
    //['+', [1, 1, 1]],
    //['-', [1, 1, 1]],
    //['--', [1, 1, 1]],
    //['.defmacro', [2, 2, 2]],
    //['.eq', [2, 2, 2]],
    //['.macro', [-1, -1, -1]],
    ['.maybeoutput', [1, 1, 1]],
    ['.setbf', [2, 2, 2]],
    ['.setfirst', [2, 2, 2]],
    ['.setitem', [3, 3, 3]],
    //['.setsegmentsize', [1, 1, 1]],
    //['/', [1, 1, 1]],
    //['<', [2, 2, 2]],
    //['<=', [2, 2, 2]],
    //['<>', [2, 2, 2]],
    //['=', [2, 2, 2]],
    //['>', [2, 2, 2]],
    //['>=', [2, 2, 2]],
    //['?', [0, 0, 1]],
    //['allopen', [0, 0, 0]],
    ['and', [0, 2, -1]],
    ['apply', [2, 2, 2]],
    ['arc', [2, 2, 2]],
    ['arctan', [1, 1, 2]],
    ['arity', [1, 1, 1]],
    ['array', [1, 1, 2]],
    ['array?', [1, 1, 1]],
    ['arrayp', [1, 1, 1]],
    ['arraytolist', [1, 1, 1]],
    ['ascii', [1, 1, 1]],
    ['ashift', [2, 2, 2]],
    ['back', [1, 1, 1]],
    ['background', [0, 0, 0]],
    ['before?', [2, 2, 2]],
    ['beforep', [2, 2, 2]],
    ['bf', [1, 1, 1]],
    ['bfs', [1, 1, 1]],
    ['bg', [0, 0, 0]],
    ['bitand', [0, 2, -1]],
    ['bitnot', [1, 1, 1]],
    ['bitor', [0, 2, -1]],
    ['bitxor', [0, 2, -1]],
    ['bk', [1, 1, 1]],
    ['bl', [1, 1, 1]],
    ['buried', [0, 0, 0]],
    ['buried?', [1, 1, 1]],
    ['buriedp', [1, 1, 1]],
    ['bury', [1, 1, 1]],
    ['butfirst', [1, 1, 1]],
    ['butfirsts', [1, 1, 1]],
    ['butlast', [1, 1, 1]],
    ['button', [0, 0, 0]],
    ['button?', [0, 0, 0]],
    ['buttonp', [0, 0, 0]],
    ['bye', [0, 0, 0]],
    ['catch', [2, 2, 2]],
    ['char', [1, 1, 1]],
    ['clean', [0, 0, 0]],
    ['clearscreen', [0, 0, 0]],
    ['cleartext', [0, 0, 0]],
    ['clickpos', [0, 0, 0]],
    //['close', [1, 1, 1]],
    //['co', [0, 1, 1]],
    ['contents', [0, 0, 0]],
    //['continue', [0, 1, 1]],
    ['copydef', [2, 2, 2]],
    ['cos', [1, 1, 1]],
    ['count', [1, 1, 1]],
    ['cs', [0, 0, 0]],
    //['cslsload', [1, 1, 1]],
    ['ct', [0, 0, 0]],
    //['cursor', [0, 0, 0]],
    ['decreasefont', [0, 0, 0]],
    ['define', [2, 2, 2]],
    ['defined?', [1, 1, 1]],
    ['definedp', [1, 1, 1]],
    ['difference', [2, 2, 2]],
    //['dribble', [1, 1, 1]],
    //['ed', [0, 1, 1]],
    //['edit', [0, 1, 1]],
    //['editfile', [1, 1, 1]],
    ['empty?', [1, 1, 1]],
    ['emptyp', [1, 1, 1]],
    //['eof?', [0, 0, 0]],
    //['eofp', [0, 0, 0]],
    //['epspict', [1, 1, 1]],
    ['equal?', [2, 2, 2]],
    ['equalp', [2, 2, 2]],
    //['er', [1, 1, 1]],
    ['erall', [0, 0, 0]],
    ['erase', [1, 1, 1]],
    //['erasefile', [1, 1, 1]],
    //['erf', [1, 1, 1]],
    ['erns', [0, 0, 0]],
    ['erpls', [0, 0, 0]],
    ['erps', [0, 0, 0]],
    ['error', [0, 0, 0]],
    ['exp', [1, 1, 1]],
    ['fd', [1, 1, 1]],
    ['fence', [0, 0, 0]],
    ['fill', [0, 0, 0]],
    ['filled', [2, 2, 2]],
    ['first', [1, 1, 1]],
    ['firsts', [1, 1, 1]],
    ['font', [0, 0, 0]],
    ['forever', [1, 1, 1]],
    ['form', [3, 3, 3]],
    ['forward', [1, 1, 1]],
    ['fput', [2, 2, 2]],
    //['fs', [0, 0, 0]],
    //['fullscreen', [0, 0, 0]],
    //['fulltext', [1, 1, 1]],
    //['gc', [0, 0, 1]],
    ['global', [1, 1, -1]],
    //['goto', [1, 1, 1]],
    ['gprop', [2, 2, 2]],
    ['greater?', [2, 2, 2]],
    ['greaterequal?', [2, 2, 2]],
    ['greaterequalp', [2, 2, 2]],
    ['greaterp', [2, 2, 2]],
    ['heading', [0, 0, 0]],
    //['help', [0, 1, 1]],
    ['hideturtle', [0, 0, 0]],
    ['home', [0, 0, 0]],
    ['ht', [0, 0, 0]],
    ['if', [2, 2, 3]],
    ['ifelse', [3, 3, 3]],
    ['iff', [1, 1, 1]],
    ['iffalse', [1, 1, 1]],
    ['ift', [1, 1, 1]],
    ['iftrue', [1, 1, 1]],
    ['increasefont', [0, 0, 0]],
    ['int', [1, 1, 1]],
    ['item', [2, 2, 2]],
    //['key?', [0, 0, 0]],
    //['keyp', [0, 0, 0]],
    ['label', [1, 1, /*1*/ -1]], // nonstandard: unlimited, like PRINT
    ['labelsize', [0, 0, 0]],
    ['last', [1, 1, 1]],
    ['left', [1, 1, 1]],
    ['less?', [2, 2, 2]],
    ['lessequal?', [2, 2, 2]],
    ['lessequalp', [2, 2, 2]],
    ['lessp', [2, 2, 2]],
    ['list', [0, 2, -1]],
    ['list?', [1, 1, 1]],
    ['listp', [1, 1, 1]],
    ['listtoarray', [1, 1, 2]],
    ['ln', [1, 1, 1]],
    //['load', [1, 1, 1]],
    //['loadpict', [1, 1, 1]],
    ['local', [1, 1, -1]],
    ['log10', [1, 1, 1]],
    ['lowercase', [1, 1, 1]],
    ['lput', [2, 2, 2]],
    ['lshift', [2, 2, 2]],
    ['lt', [1, 1, 1]],
    //['macro?', [1, 1, 1]],
    //['macrop', [1, 1, 1]],
    ['make', [2, 2, 2]],
    ['member', [2, 2, 2]],
    ['member?', [2, 2, 2]],
    ['memberp', [2, 2, 2]],
    ['minus', [1, 1, 1]],
    ['modulo', [2, 2, 2]],
    ['mousepos', [0, 0, 0]],
    ['name?', [1, 1, 1]],
    ['namep', [1, 1, 1]],
    ['names', [0, 0, 0]],
    //['nodes', [0, 0, 0]],
    //['nodribble', [0, 0, 0]],
    //['norefresh', [0, 0, 0]],
    ['not', [1, 1, 1]],
    ['notequal?', [2, 2, 2]],
    ['notequalp', [2, 2, 2]],
    ['number?', [1, 1, 1]],
    ['numberp', [1, 1, 1]],
    ['op', [1, 1, 1]],
    //['openappend', [1, 1, 1]],
    //['openread', [1, 1, 1]],
    //['openupdate', [1, 1, 1]],
    //['openwrite', [1, 1, 1]],
    ['or', [0, 2, -1]],
    ['output', [1, 1, 1]],
    ['palette', [1, 1, 1]],
    ['parse', [1, 1, 1]],
    //['pause', [0, 0, 0]],
    ['pc', [0, 0, 0]],
    ['pd', [0, 0, 0]],
    ['pe', [0, 0, 0]],
    ['pencolor', [0, 0, 0]],
    ['pendown', [0, 0, 0]],
    ['pendown?', [0, 0, 0]],
    ['pendownp', [0, 0, 0]],
    ['penerase', [0, 0, 0]],
    ['penmode', [0, 0, 0]],
    ['penpaint', [0, 0, 0]],
    //['penpattern', [0, 0, 0]],
    ['penreverse', [0, 0, 0]],
    ['pensize', [0, 0, 0]],
    ['penup', [0, 0, 0]],
    ['plist', [1, 1, 1]],
    ['plist?', [1, 1, 1]],
    ['plistp', [1, 1, 1]],
    ['plists', [0, 0, 0]],
    //['po', [1, 1, 1]],
    ['pos', [0, 0, 0]],
    //['pot', [1, 1, 1]],
    ['power', [2, 2, 2]],
    ['pprop', [3, 3, 3]],
    ['ppt', [0, 0, 0]],
    ['pr', [0, 1, -1]],
    //['prefix', [0, 0, 0]],
    ['primitive?', [1, 1, 1]],
    ['primitivep', [1, 1, 1]],
    ['primitives', [0, 0, 0]],
    ['print', [0, 1, -1]],
    //['printout', [1, 1, 1]],
    //['printpict', [0, 0, 1]],
    //['printtext', [0, 0, 1]],
    ['procedure?', [1, 1, 1]],
    ['procedurep', [1, 1, 1]],
    ['procedures', [0, 0, 0]],
    ['product', [0, 2, -1]],
    ['pu', [0, 0, 0]],
    ['px', [0, 0, 0]],
    ['quotient', [1, 2, 2]],
    ['radarctan', [1, 1, 2]],
    ['radcos', [1, 1, 1]],
    ['radsin', [1, 1, 1]],
    ['random', [1, 1, 2]],
    //['rawascii', [1, 1, 1]],
    //['rc', [0, 0, 0]],
    //['rcs', [1, 1, 1]],
    //['readchar', [0, 0, 0]],
    //['readchars', [1, 1, 1]],
    //['reader', [0, 0, 0]],
    ['readlist', [0, 0, /*0*/ 1]], // nonstandard: prompt
    //['readpos', [0, 0, 0]],
    //['readrawline', [0, 0, 0]],
    ['readword', [0, 0, /*0*/ 1]], // nonstandard: prompt
    //['refresh', [0, 0, 0]],
    ['remainder', [2, 2, 2]],
    ['remprop', [2, 2, 2]],
    ['repcount', [0, 0, 0]],
    ['repeat', [2, 2, 2]],
    ['rerandom', [0, 0, 1]],
    ['right', [1, 1, 1]],
    //['rl', [0, 0, 0]],
    ['round', [1, 1, 1]],
    ['rt', [1, 1, 1]],
    ['run', [1, 1, 1]],
    ['runparse', [1, 1, 1]],
    ['runresult', [1, 1, 1]],
    //['rw', [0, 0, 0]],
    //['save', [0, 1, 1]],
    //['savepict', [1, 1, 1]],
    //['screenmode', [0, 0, 0]],
    ['scrunch', [0, 0, 0]],
    ['se', [0, 2, -1]],
    ['sentence', [0, 2, -1]],
    ['setbackground', [1, 1, 1]],
    //['setbg', [1, 1, 1]],
    //['setcslsloc', [1, 1, 1]],
    //['setcursor', [1, 1, 1]],
    //['seteditor', [1, 1, 1]],
    ['setfont', [1, 1, 1]],
    ['seth', [1, 1, 1]],
    ['setheading', [1, 1, 1]],
    //['sethelploc', [1, 1, 1]],
    ['setitem', [3, 3, 3]],
    ['setlabelheight', [1, 1, 1]],
    //['setlibloc', [1, 1, 1]],
    //['setmargins', [1, 1, 1]],
    ['setpalette', [2, 2, 2]],
    ['setpc', [1, 1, 1]],
    ['setpencolor', [1, 1, 1]],
    //['setpenpattern', [1, 1, 1]],
    ['setpensize', [1, 1, 1]],
    ['setpos', [1, 1, 1]],
    //['setprefix', [1, 1, 1]],
    //['setread', [1, 1, 1]],
    //['setreadpos', [1, 1, 1]],
    ['setscrunch', [2, 2, 2]],
    //['settc', [2, 2, 2]],
    //['settemploc', [1, 1, 1]],
    ['settextcolor', /*[2, 2, 2]*/ [1, 1, 1]], /* Does not support background color */
    ['settextsize', [1, 1, 1]],
    //['setwrite', [1, 1, 1]],
    //['setwritepos', [1, 1, 1]],
    ['setx', [1, 1, 1]],
    ['setxy', [2, 2, 2]],
    ['sety', [1, 1, 1]],
    //['shell', [1, 1, 2]],
    ['show', [0, 1, -1]],
    ['shown?', [0, 0, 0]],
    ['shownp', [0, 0, 0]],
    ['showturtle', [0, 0, 0]],
    ['sin', [1, 1, 1]],
    //['splitscreen', [0, 0, 0]],
    ['sqrt', [1, 1, 1]],
    //['ss', [0, 0, 0]],
    ['st', [0, 0, 0]],
    ['standout', [1, 1, 1]],
    //['step', [1, 1, 1]],
    ['stepped', [0, 0, 0]],
    //['stepped?', [1, 1, 1]],
    //['steppedp', [1, 1, 1]],
    ['stop', [0, 0, 0]],
    ['substring?', [2, 2, 2]],
    ['substringp', [2, 2, 2]],
    ['sum', [0, 2, -1]],
    //['tag', [1, 1, 1]],
    ['test', [1, 1, 1]],
    ['text', [1, 1, 1]],
    //['textscreen', [0, 0, 0]],
    //['textsize', [0, 0, 0]],
    ['thing', [1, 1, 1]],
    ['throw', [1, 1, 2]],
    ['to', [-1, -1, -1]],
    //['tone', [2, 2, 2]],
    ['towards', [1, 1, 1]],
    //['trace', [1, 1, 1]],
    ['traced', [0, 0, 0]],
    //['traced?', [1, 1, 1]],
    //['tracedp', [1, 1, 1]],
    //['ts', [0, 0, 0]],
    ['turtlemode', [0, 0, 0]],
    ['type', [0, 1, -1]],
    ['unbury', [1, 1, 1]],
    //['unstep', [1, 1, 1]],
    //['untrace', [1, 1, 1]],
    ['uppercase', [1, 1, 1]],
    //['vbarred?', [1, 1, 1]],
    //['vbarredp', [1, 1, 1]],
    ['wait', [1, 1, 1]],
    ['window', [0, 0, 0]],
    ['word', [0, 2, -1]],
    ['word?', [1, 1, 1]],
    ['wordp', [1, 1, 1]],
    ['wrap', [0, 0, 0]],
    //['writepos', [0, 0, 0]],
    //['writer', [0, 0, 0]],

    ['quoted', [1, 1, 1]],
    ['xor', [0, 2, -1]],
    ['`', [1, 1, 1]],
  ];
  arities.forEach(function(pair) {
    var proc = pair[0];
    var arity = pair[1];
    this.assert_equals('arity "' + proc, arity);
  }.bind(this));
});
