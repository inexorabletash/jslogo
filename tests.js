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

var canvas_element = document.getElementById("sandbox"), canvas_ctx;
var turtle_element = document.getElementById("turtle"), turtle_ctx;

QUnit.module("Logo Unit Tests", {
  setup: function(t) {
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
        return res;
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
      }
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
          t.ok(Math.abs(result - expected) < EPSILON, expression);
        } else {
          t.strictEqual(result, expected, expression);
        }
      }, function (failure) {
        t.strictEqual(failure, expected, expression);
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

    this.assert_error = function(expression, expected) {
      var done = t.async();
      try {
        var result = this.interpreter.run(expression);
        result.then(function (result) {
          t.push(false, '(no error)', expected, 'Expected to error but did not: ' + expression);
          done();
        }, function (ex) {
          t.push(ex.message === expected, ex.message, expected, 'Expected error from: ' + expression);
          done();
        });
      } catch (ex) {
        t.push(ex.message === expected, ex.message, expected, 'Expected error from: ' + expression);
        done();
      }
    };

    this.queue = function(task) {
      this.interpreter.queueTask(task.bind(this));
    };

    this.run = function(code) {
      this.interpreter.run(code).catch(function(error) {
        console.warn(error);
        ok(false, 'Failed: ' + code + ' - ' + error);
      });
    };
  }
});

QUnit.test("Parser", function(t) {
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
  this.assert_error('make "a count { 1 2 3 }@1.5', "Don't know what to do with 0.5");

  //
  // Nested Structures
  //

  this.assert_equals('count [ a b [ c d e ] f ]', 4);
  this.assert_equals('count { a b { c d e } f }', 4);
  this.assert_equals('count { a b [ c d e ] f }', 4);
  this.assert_equals('count [ a b { c d e } f ]', 4);
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

  this.assert_stream('make "a (array 5 0) ' +
                     'repeat 5 [ setitem repcount-1 :a repcount*repcount ] ' +
                     'show :a', '{1 4 9 16 25}@0\n');
  this.assert_stream('make "a { 1 2 3 } ' +
                     'show :a', '{1 2 3}\n');
  this.assert_stream('make "a { 1 2 3 } @ 10' +
                     'show :a', '{1 2 3}@10\n');

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


  this.assert_error('item 0 [ a b c ]', 'Index out of bounds');
  this.assert_equals('item 1 [ a b c ]', "a");
  this.assert_equals('item 2 [ a b c ]', "b");
  this.assert_equals('item 3 [ a b c ]', "c");
  this.assert_error('item 4 [ a b c ]', 'Index out of bounds');

  this.assert_error('item 0 { a b c }', 'Index out of bounds');
  this.assert_equals('item 1 { a b c }', "a");
  this.assert_equals('item 2 { a b c }', "b");
  this.assert_equals('item 3 { a b c }', "c");
  this.assert_error('item 4 { a b c }', 'Index out of bounds');

  this.assert_equals('item 0 { a b c }@0', 'a');
  this.assert_equals('item 1 { a b c }@0', 'b');
  this.assert_equals('item 2 { a b c }@0', 'c');
  this.assert_error('item 3 { a b c }@0', 'Index out of bounds');

  this.assert_error('item 0 "abc', 'Index out of bounds');
  this.assert_equals('item 1 "abc', "a");
  this.assert_equals('item 2 "abc', "b");
  this.assert_equals('item 3 "abc', "c");
  this.assert_error('item 4 "abc', 'Index out of bounds');

  this.assert_error('item 0 456', 'Index out of bounds');
  this.assert_equals('item 1 456', "4");
  this.assert_equals('item 2 456', "5");
  this.assert_equals('item 3 456', "6");
  this.assert_error('item 4 456', 'Index out of bounds');

  this.assert_stream('make "a { a b c } ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a q c}\n');
  this.assert_stream('make "a { a b c }@0 ' +
                     'setitem 2 :a "q ' +
                     'show :a', '{a b q}@0\n');


  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('pick [ 1 2 3 4 ]', function(x) { return 1 <= x && x <= 4; });
  }
  this.assert_equals('remove "b [ a b c ]', ["a", "c"]);
  this.assert_equals('remove "d [ a b c ]', ["a", "b", "c"]);
  this.assert_equals('remove "b "abc', 'ac');

  this.assert_equals('remdup [ a b c a b c ]', ["a", "b", "c"]);
  this.assert_equals('remdup "abcabc', 'abc');

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
  this.assert_error('make "a { 1 }  setitem 1 :a :a', "SETITEM can't create circular array");
  this.assert_error('make "a { 1 }  make "b { 1 }  setitem 1 :b :a  setitem 1 :a :b', "SETITEM can't create circular array");

  this.assert_equals('make "a []  .setfirst :a "s  :a', ['s']);
  this.assert_error('.setfirst "x "y', '.SETFIRST expected list');

  this.assert_equals('make "a [a]  .setbf :a [b c]  :a', ['a', 'b', 'c']);
  this.assert_error('.setbf "x [1]', '.SETBF expected non-empty list');
  this.assert_error('.setbf [] [1]', '.SETBF expected non-empty list');

  this.assert_equals('make "a { 1 }  make "b :a  .setitem 1 :a 2  item 1 :b', 2);
  this.assert_equals('make "a { 1 }  .setitem 1 :a :a  equalp item 1 :a :a', 1);
  this.assert_error('.setitem 1 "x 123', 'Expected array');

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

  this.assert_equals('substringp "a "abc', 1);
  this.assert_equals('substringp "z "abc', 0);
  this.assert_equals('substring? "a "abc', 1);
  this.assert_equals('substring? "z "abc', 0);

  this.assert_equals('memberp "b [ a b c ]', 1);
  this.assert_equals('memberp "e [ a b c ]', 0);
  this.assert_equals('memberp [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
  this.assert_equals('member? "b [ a b c ]', 1);
  this.assert_equals('member? "e [ a b c ]', 0);
  this.assert_equals('member? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);

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

  this.assert_equals('lowercase "ABcd', 'abcd');
  this.assert_equals('uppercase "ABcd', 'ABCD');
  this.assert_equals('standout "whatever', 'whatever');
});

QUnit.test("Communication", function(t) {
  t.expect(22);

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

  this.queue(function() {
    this.stream.inputbuffer = "test";
  });
  this.assert_equals('readword', 'test');

  this.queue(function() {
    this.stream.inputbuffer = "a b c 1 2 3";
  });
  this.assert_equals('readword', 'a b c 1 2 3');

  this.assert_prompt('readword', undefined);
  this.assert_prompt('(readword "query)', 'query');
  this.assert_prompt('(readword "query "extra)', 'query');
  this.assert_prompt('(readword [a b c])', 'a b c');

  // 3.3 File Access
  // 3.4 Terminal Access

  this.assert_stream('print "a cleartext', '');
  this.assert_stream('print "a ct', '');

  this.stream.clear();
});

QUnit.test("Arithmetic", function(t) {
  t.expect(137);

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
  t.expect(70);

  // NOTE: test canvas is 300,300 (so -150...150 coordinates before hitting)
  // edge

  this.run('clearscreen');
  this.assert_equals('clean home (list heading xcor ycor)', [0, 0, 0]);

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

  this.assert_equals('setpos [ 12 34 ] pos', [12, 34]);
  this.assert_equals('setxy 56 78 pos', [56, 78]);
  this.assert_equals('setxy 0 0 (list xcor ycor)', [0, 0]);
  this.assert_equals('setx 123 xcor', 123);
  this.assert_equals('sety 45 ycor', 45);
  this.assert_equals('setheading 69 heading', 69);
  this.assert_equals('seth 13 heading', 13);

  this.assert_equals('forward 100 rt 90 home (list heading xcor ycor)', [0, 0, 0]);

  this.assert_equals('home arc 123 456 (list heading xcor ycor)', [0, 0, 0]);

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

  this.assert_equals('setlabelfont "Times\\ New\\ Roman  labelfont', 'Times New Roman');

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

  this.assert_equals('penpaint penmode', 'PAINT');
  this.assert_equals('penerase penmode', 'ERASE');
  this.assert_equals('penreverse penmode', 'REVERSE');

  this.assert_equals('setpencolor 0 pencolor', '0');
  this.assert_equals('setpc 0 pencolor', '0');
  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_equals('setpencolor [0 50 99] pencolor', '#0080ff');

  this.assert_equals('setpensize 6 pensize', [6, 6]);
  this.assert_equals('setpensize [6 6] pensize', [6, 6]);

  //
  // 6.6 Pen Queries
  //

  this.assert_equals('pendown pendownp', 1);
  this.assert_equals('penup pendownp', 0);

  this.assert_equals('penpaint penmode', 'PAINT');
  this.assert_equals('penerase penmode', 'ERASE');
  this.assert_equals('penreverse penmode', 'REVERSE');

  this.assert_equals('setpencolor 0 pencolor', '0');
  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_equals('setpensize 6 pensize', [6, 6]);

  // 6.7 Saving and Loading Pictures
  // 6.8 Mouse Queries
});

QUnit.test("Workspace Management", function(t) {
  t.expect(92);

  //
  // 7.1 Procedure Definition
  //

  this.assert_equals('to square :x output :x * :x end  square 5', 25);
  this.assert_equals('to foo output 5 end  foo', 5);
  this.assert_equals('to foo :x :y output 5 end  foo 1 2', 5);
  this.assert_equals('to foo :x :y output :x + :y end  foo 1 2', 3);
  this.assert_equals('to foo :x :y output :x + :y end  def "foo', 'to foo :x :y\n  output :x + :y\nend');
  this.assert_equals('to foo :x bar 1 "a + :x [ 1 2 ] end  def "foo', 'to foo :x\n  bar 1 "a + :x [ 1 2 ]\nend');
  this.assert_equals('to foo 1 + 2 - 3 * 4 / 5 % 6 ^ -1 end  def "foo', 'to foo\n  1 + 2 - 3 * 4 / 5 % 6 ^ -1\nend');

  this.assert_equals('to square :x output :x * :x end  copydef "multbyself "square  multbyself 5', 25);
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
  // TODO: primitives
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  globals', ['a']);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  names', [[], ['a']]);
  this.assert_equals('unburyall erall  make "a 1  to b output 2 end  pprop "c "d "e  plists', [[], [], ['c']]);

  this.assert_equals('namelist "a', [[], ['a']]);
  this.assert_equals('namelist [a]', [[], ['a']]);
  this.assert_equals('namelist [a b c]', [[], ['a', 'b', 'c']]);
  this.assert_equals('pllist "a', [[], [], ['a']]);
  this.assert_equals('pllist [a]', [[], [], ['a']]);
  this.assert_equals('pllist [a b c]', [[], [], ['a', 'b', 'c']]);


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

  // 7.6 Workspace Inspection
  // 7.7 Workspace Control
});

QUnit.test("Control Structures", function(t) {
  t.expect(69);
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

  this.assert_equals('make "c 0  to foo forever [ make "c :c + 1 if repcount = 5 [ stop ] ] end  foo  :c', 5);
  this.assert_equals('make "c 0  to foo forever [ make "c :c + repcount if repcount = 4 [ stop ] ] end  foo  :c', 10);

  this.assert_equals('make "r "a  if 1 [ make "r "b ]  :r', 'b');
  this.assert_equals('make "r "a  if 0 [ make "r "b ]  :r', 'a');
  this.assert_equals('if 1 [ "a ]', 'a');
  this.assert_error('show if 0 [ "a ]', 'No output from procedure');

  this.assert_equals('ifelse 1 [ make "r "a ] [ make "r "b ]  :r', 'a');
  this.assert_equals('ifelse 0 [ make "r "a ] [ make "r "b ]  :r', 'b');
  this.assert_equals('ifelse 1 [ "a ] [ "b ]', 'a');
  this.assert_equals('ifelse 0 [ "a ] [ "b ]', 'b');

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

  this.assert_equals('to foo forever [ if repcount = 5 [ make "c 234 stop ] ] end  foo  :c', 234);

  var now;
  this.queue(function() { now = Date.now(); });
  this.assert_equals('wait 60/6', undefined);
  this.queue(function() { t.ok((Date.now() - now) > (1000/6)); });

  this.assert_equals('forever [ if repcount = 5 [ bye ] ]', undefined);

  this.assert_equals('to foo output 123 end  foo', 123);
  this.assert_equals('to foo op 123 end  foo', 123);


  this.assert_equals('to foo .maybeoutput 5 end  foo', 5);
  this.assert_equals('to foo .maybeoutput make "c 0 end  foo', undefined);


  this.assert_equals('ignore 1 > 2', undefined);

  this.assert_equals('make "x 0  for [ r 1 5 ] [ make "x :x + :r ]  :x', 15);
  this.assert_equals('make "x 0  for [ r 0 10 2 ] [ make "x :x + :r ]  :x', 30);

  this.assert_equals('make "x 0  for [ r 10 0 -2 ] [ make "x :x + :r ]  :x', 30);
  this.assert_equals('make "x 0  for [ r 10 0 -2-2 ] [ make "x :x + :r ]  :x', 18);

  this.assert_equals('make "x 0  do.while [ make "x :x + 1 ] :x < 10  :x', 10);
  this.assert_equals('make "x 0  while :x < 10 [ make "x :x + 1 ]     :x', 10);

  this.assert_equals('make "x 0  do.until [ make "x :x + 1 ] :x > 10  :x', 11);
  this.assert_equals('make "x 0  until :x > 10 [ make "x :x + 1 ]     :x', 11);

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

  // TODO: Order of operations
  // TODO: Structures, lists of lists
});

QUnit.test("Error Messages", function(t) {
  this.assert_error("to foo end show foo", "No output from procedure");
  this.assert_error("[ 1 2", "Expected ']'");
  this.assert_error("{ 1 2", "Expected '}'");
  this.assert_error("[ 1 2 }", "Unexpected '}'");
  this.assert_error("{ 1 2 ]", "Unexpected ']'");
  this.assert_error("!@#$", "Couldn't parse: '!@#$'");
  this.assert_error("show :nosuchvar", "Don't know about variable NOSUCHVAR");
  this.assert_error("1 / 0", "Division by zero");
  this.assert_error("1 % 0", "Division by zero");
  this.assert_error("1 + -", "Unexpected end of instructions");
  this.assert_error("( 1 + 2", "Expected ')'");
  this.assert_error("( 1 + 2 3", "Expected ')', saw 3");
  this.assert_error("nosuchproc", "Don't know how to NOSUCHPROC");
  this.assert_error("1 + \"1+2", "Expected number");
  this.assert_error("1 + []", "Expected number");
  this.assert_error("(minus)", "Expected number");
  this.assert_error("make [] 123", "Expected string");
  this.assert_error("(def)", "Expected string");
  this.assert_error("(erase)", "Expected list");
  this.assert_error("(map \"show)", "Expected list");
  this.assert_error("to +", "Expected identifier");
  this.assert_error("to fd :x bk :x end", "Can't redefine primitive FD");
  this.assert_error("def \"nosuchproc", "Don't know how to NOSUCHPROC");
  this.assert_error("def \"def", "Can't show definition of primitive DEF");
  this.assert_error("item 5 [ 1 2 ]", "Index out of bounds");
  this.assert_error("copydef \"newname \"nosuchproc", "Don't know how to NOSUCHPROC");
  this.assert_error("to foo end  copydef \"to \"foo", "Can't overwrite special TO");
  this.assert_error("to foo end  copydef \"show \"foo", "Can't overwrite primitives unless REDEFP is TRUE");
  this.assert_error("erase [ [ TO ] [ ] ]", "Can't ERASE special TO");
  this.assert_error("erase [ [ SHOW ] [ ] ]", "Can't ERASE primitives unless REDEFP is TRUE");
  this.assert_error("do.while 1 2", "Expected block");
  this.assert_error("while 1 2", "Expected block");
  this.assert_error("do.until 1 2", "Expected block");
  this.assert_error("until 1 2", "Expected block");
  this.assert_error("apply \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("apply \"to [ 1 2 ]", "Can't apply APPLY to special TO");
  this.assert_error("apply \"while [ 1 2 ]", "Can't apply APPLY to special WHILE");
  this.assert_error("foreach \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("foreach \"to [ 1 2 ]", "Can't apply FOREACH to special TO");
  this.assert_error("foreach \"while [ 1 2 ]", "Can't apply FOREACH to special WHILE");
  this.assert_error("invoke \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("invoke \"to [ 1 2 ]", "Can't apply INVOKE to special TO");
  this.assert_error("invoke \"while [ 1 2 ]", "Can't apply INVOKE to special WHILE");
  this.assert_error("map \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("map \"to [ 1 2 ]", "Can't apply MAP to special TO");
  this.assert_error("map \"while [ 1 2 ]", "Can't apply MAP to special WHILE");
  this.assert_error("filter \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("filter \"to [ 1 2 ]", "Can't apply FILTER to special TO");
  this.assert_error("filter \"while [ 1 2 ]", "Can't apply FILTER to special WHILE");
  this.assert_error("find \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("find \"to [ 1 2 ]", "Can't apply FIND to special TO");
  this.assert_error("find \"while [ 1 2 ]", "Can't apply FIND to special WHILE");
  this.assert_error("reduce \"nosuch [ 1 2 ]", "Don't know how to NOSUCH");
  this.assert_error("reduce \"to [ 1 2 ]", "Can't apply REDUCE to special TO");
  this.assert_error("reduce \"while [ 1 2 ]", "Can't apply REDUCE to special WHILE");
  this.assert_error("0", "Don't know what to do with 0");
  this.assert_error("1 + 2", "Don't know what to do with 3");
  this.assert_error("to foo output 123 end  foo", "Don't know what to do with 123");
  this.assert_error('setpos []', 'Expected list of length 2');
  this.assert_error('setpos [1 2 3]', 'Expected list of length 2');
  this.assert_error('towards []', 'Expected list of length 2');
  this.assert_error('make "a { 1 2 3 }@1.5', "Don't know what to do with 0.5");
});

QUnit.test("Regression Tests", function(t) {
  this.assert_equals('make "x 0  repeat 3 [ for [ i 1 4 ] [ make "x :x + 1 ] ]  :x', 12);
  this.assert_equals('make "x 0  for [i 0 100 :i + 1] [make "x :x + :i]  :x', 120);
  this.assert_error("fd 100 50 rt 90", "Don't know what to do with 50");
  this.assert_equals("to foo output 123 end  make \"v foo", undefined);
  this.assert_equals("to foo end", undefined);
  this.assert_equals("5;comment", 5);
  this.assert_equals("5;comment\n", 5);
  this.assert_equals("5 ; comment", 5);
  this.assert_equals("5 ; comment\n", 5);
  this.assert_equals("setpos [ -1 0 ]  123", 123);
  this.assert_equals("to foo output 234 end foo", 234);
  this.assert_equals("to foo output 234 END foo", 234);
  this.assert_error("to whatever fd 100", "Expected END");
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
  this.assert_error("item 5 [ 1 2 ]", "Index out of bounds");
  this.queue(function() {
    this.interpreter.localize = function(s) {
      return {
        'Division by zero': 'Divido per nulo',
        'Index out of bounds': 'Indekso ekster limojn'
      }[s];
    };
  });
  this.assert_error("1 / 0", "Divido per nulo");
  this.assert_error("item 5 [ 1 2 ]", "Indekso ekster limojn");

  // LogoInterpreter#keywordAlias
  this.assert_error('to foo output 2 fino  foo', "Expected END");
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

  // CanvasTurtle#colorAlias
  var done = t.async();
  var hookCalled = false;
  this.queue(function() {
    this.turtle.colorAlias = function(s) {
      hookCalled = hookCalled || (s === 'internationalorange');
    };
  });
  this.run('setpencolor "internationalorange');
  this.queue(function() {
    t.ok(hookCalled);
    done();
  });
});
