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

module("Logo Unit Tests", {
  setup: function() {

    // TODO: Replace with mock
    canvas_ctx = canvas_ctx || canvas_element.getContext('2d');
    turtle_ctx = turtle_ctx || turtle_element.getContext('2d');

    this.turtle = new CanvasTurtle(
      canvas_ctx,
      turtle_ctx,
      canvas_element.width, canvas_element.height);

    this.stream = {
      inputbuffer: "",

      read: function() {
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
      }
    };

    this.interpreter = new LogoInterpreter(this.turtle, this.stream);

    var EPSILON = 1e-12;

    this.assert_equals = function (expression, expected) {
      var actual = this.interpreter.run(expression);
      if (typeof expected === 'object') {
        deepEqual(actual, expected, expression);
      } else if (typeof expected === 'number' && typeof actual === 'number') {
        ok(Math.abs(actual - expected) < EPSILON, expression);
      } else {
        strictEqual(actual, expected, expression);
      }
    };

    this.assert_stream = function (expression, expected) {
      this.stream.clear();
      this.interpreter.run(expression);
      var actual = this.stream.outputbuffer;
      this.stream.clear();
      equal(actual, expected, expression);
    };

    this.assert_predicate = function(expression, predicate) {
      ok(predicate(this.interpreter.run(expression)), expression);
    };

    this.assert_error = function(expression, expected) {
      raises(function() { this.interpreter.run(expression); }.bind(this), function(e) { return e.message === expected; }, expression);
    };
  }
});

test("Parser", 30, function () {

  //
  // Types
  //

  this.assert_equals('"test', 'test');
  this.assert_equals('1', 1);
  this.assert_equals('[ 1 2 3 ]', [1, 2, 3]);

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
});


test("Data Structure Primitives", 135, function () {

  //
  // 2.1 Constructors
  //

  this.assert_equals('word "hello "world', 'hello world');
  this.assert_equals('(word "a "b "c)', 'a b c');
  this.assert_equals('(word)', '');

  this.assert_equals('list 1 2', [1, 2]);
  this.assert_equals('(list 1 2 3)', [1, 2, 3]);

  this.assert_equals('sentence 1 2', [1, 2]);
  this.assert_equals('se 1 2', [1, 2]);
  this.assert_equals('(sentence 1)', [1]);
  this.assert_equals('(sentence 1 2 3)', [1, 2, 3]);
  this.assert_equals('sentence [1] [2]', [1, 2]);
  this.assert_equals('sentence [1 2] [3 4]', [1, 2, 3, 4]);
  this.assert_equals('sentence 1 [2 3]', [1, 2, 3]);

  this.assert_equals('fput 0 [ 1 2 3 ]', [0, 1, 2, 3]);
  this.assert_equals('lput 0 [ 1 2 3 ]', [1, 2, 3, 0]);

  this.assert_equals('combine "a "b', 'a b');
  this.assert_equals('combine 1 [2]', [1, 2]);

  this.assert_equals('reverse [ 1 2 3 ]', [3, 2, 1]);

  this.assert_equals('gensym <> gensym', 1);

  //
  // 2.2 Data Selectors
  //

  this.assert_equals('first (LIST 1 2 3 )', 1);
  this.assert_equals('firsts [ [ 1 2 3 ] [ "a "b "c] ]', [1, '"a']);
  this.assert_equals('last  [ 1 2 3 ]', 3);
  this.assert_equals('butfirst [ 1 2 3 ]', [2, 3]);
  this.assert_equals('bf [ 1 2 3 ]', [2, 3]);
  this.assert_equals('butfirsts [ [ 1 2 3 ] [ "a "b "c] ]', [[2, 3], ['"b', '"c']]);
  this.assert_equals('bfs [ [ 1 2 3 ] [ "a "b "c] ]', [[2, 3], ['"b', '"c']]);
  this.assert_equals('butlast  [ 1 2 3 ]', [1, 2]);
  this.assert_equals('bl  [ 1 2 3 ]', [1, 2]);

  this.assert_equals('first "123', '1');
  this.assert_equals('last  "123', '3');
  //assert_equals('butfirst "123', '23');
  //assert_equals('butlast  "123', '12');

  this.assert_equals('first 123', '1');
  this.assert_equals('last  123', '3');
  //assert_equals('butfirst 123', '23');
  //assert_equals('butlast  123', '12');


  this.assert_error('item 0 [ 1 2 3 ]', 'Index out of bounds');
  this.assert_equals('item 1 [ 1 2 3 ]', 1);
  this.assert_equals('item 2 [ 1 2 3 ]', 2);
  this.assert_equals('item 3 [ 1 2 3 ]', 3);
  this.assert_error('item 4 [ 1 2 3 ]', 'Index out of bounds');
  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('pick [ 1 2 3 4 ]', function(x) { return 1 <= x && x <= 4; });
  }
  this.assert_equals('remove 2 [ 1 2 3 ]', [1, 3]);
  this.assert_equals('remove 4 [ 1 2 3 ]', [1, 2, 3]);
  this.assert_equals('remdup [ 1 2 3 1 2 3 ]', [1, 2, 3]);

  //
  // 2.3 Data Mutators
  //

  this.assert_equals('make "s [] repeat 5 [ push "s repcount ] :s', [5, 4, 3, 2, 1]);
  this.assert_equals('make "s [ 1 2 3 ] (list pop "s pop "s pop "s)', [1, 2, 3]);
  this.assert_equals('make "q [] repeat 5 [ queue "q repcount ] :q', [1, 2, 3, 4, 5]);
  this.assert_equals('make "q [ 1 2 3 ] (list dequeue "q dequeue "q dequeue "q)', [1, 2, 3]);

  //
  // 2.4 Predicates
  //

  this.assert_equals('wordp "a', 1);
  this.assert_equals('wordp 1', 0);
  this.assert_equals('wordp [ 1 ]', 0);
  this.assert_equals('word? "a', 1);
  this.assert_equals('word? 1', 0);
  this.assert_equals('word? [ 1 ]', 0);

  this.assert_equals('listp "a', 0);
  this.assert_equals('listp 1', 0);
  this.assert_equals('listp [ 1 ]', 1);
  this.assert_equals('list? "a', 0);
  this.assert_equals('list? 1', 0);
  this.assert_equals('list? [ 1 ]', 1);

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
  this.assert_equals('number? "a', 0);
  this.assert_equals('number? 1', 1);
  this.assert_equals('number? [ 1 ]', 0);

  this.assert_equals('emptyp []', 1);
  this.assert_equals('empty? []', 1);
  this.assert_equals('emptyp [ 1 ]', 0);
  this.assert_equals('empty? [ 1 ]', 0);
  this.assert_equals('emptyp "', 1);
  this.assert_equals('empty? "', 1);
  this.assert_equals('emptyp "a', 0);
  this.assert_equals('empty? "a', 0);

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

  this.assert_equals('memberp 2 [ 1 2 3 ]', 1);
  this.assert_equals('memberp 5 [ 1 2 3 ]', 0);
  this.assert_equals('memberp [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
  this.assert_equals('member? 2 [ 1 2 3 ]', 1);
  this.assert_equals('member? 5 [ 1 2 3 ]', 0);
  this.assert_equals('member? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);

  //
  // 2.5 Queries
  //

  this.assert_equals('count [ ]', 0);
  this.assert_equals('count [ 1 ]', 1);
  this.assert_equals('count [ 1 2 ]', 2);
  this.assert_equals('count "', 0);
  this.assert_equals('count "a', 1);
  this.assert_equals('count "ab', 2);

  this.assert_equals('ascii "A', 65);
  this.assert_equals('char 65', 'A');

  this.assert_equals('lowercase "ABcd', 'abcd');
  this.assert_equals('uppercase "ABcd', 'ABCD');
  this.assert_equals('standout "whatever', 'whatever');

});


test("Communication", 18, function () {

  // 3.1 Transmitters

  this.assert_stream('print "a', 'a\n');
  this.assert_stream('print 1', '1\n');
  this.assert_stream('print [ 1 ]', '1\n');
  this.assert_stream('print [ 1 [ 2 ] ]', '1 [ 2 ]\n');
  this.assert_stream('(print "a 1 [ 2 [ 3 ] ])', 'a 1 2 [ 3 ]\n');

  this.assert_stream('type "a', 'a');
  this.assert_stream('(type "a 1 [ 2 [ 3 ] ])', 'a12 [ 3 ]');

  this.assert_stream('(print "hello "world)', "hello world\n");
  this.assert_stream('(type "hello "world)', "helloworld");

  this.assert_stream('show "a', 'a\n');
  this.assert_stream('show 1', '1\n');
  this.assert_stream('show [ 1 ]', '[ 1 ]\n');
  this.assert_stream('show [ 1 [ 2 ] ]', '[ 1 [ 2 ] ]\n');
  this.assert_stream('(show "a 1 [ 2 [ 3 ] ])', 'a 1 [ 2 [ 3 ] ]\n');

  // 3.2 Receivers

  this.stream.inputbuffer = "test";
  this.assert_equals('readword', 'test');

  this.stream.inputbuffer = "a b c 1 2 3";
  this.assert_equals('readword', 'a b c 1 2 3');

  // 3.3 File Access
  // 3.4 Terminal Access

  this.assert_stream('print "a cleartext', '');
  this.assert_stream('print "a ct', '');

  this.stream.clear();

});


test("Arithmetic", 137, function () {

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


test("Logical Operations", 29, function () {

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


test("Graphics", 69, function () {

  // NOTE: test canvas is 300,300 (so -150...150 coordinates before hitting)
  // edge

  this.interpreter.run('clearscreen');
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

  this.assert_equals('(label "a 1 [ 2 [ 3 ] ])', 'a 1 2 [ 3 ]');
  this.assert_equals('setlabelheight 5 labelsize', [5, 5]);
  this.assert_equals('setlabelheight 10 labelsize', [10, 10]);

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

  this.assert_equals('setpencolor 0 pencolor', 'black');
  this.assert_equals('setpc 0 pencolor', 'black');
  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_equals('(setpencolor 0 50 99) pencolor', '#0081ff');

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

  this.assert_equals('setpencolor 0 pencolor', 'black');
  this.assert_equals('setpencolor "#123456 pencolor', '#123456');
  this.assert_equals('setpensize 6 pensize', [6, 6]);

  // 6.7 Saving and Loading Pictures
  // 6.8 Mouse Queries
});

test("Workspace Management", 57, function () {

  //
  // 7.1 Procedure Definition
  //

  this.assert_equals('to square :x output :x * :x end  square 5', 25);
  this.assert_equals('to foo output 5 end  foo', 5);
  this.assert_equals('to foo :x :y output 5 end  foo 1 2', 5);
  this.assert_equals('to foo :x :y output :x + :y end  foo 1 2', 3);
  this.assert_equals('to foo :x :y output :x + :y end  def "foo', 'to foo :x :y output :x + :y end');
  this.assert_equals('to foo :x bar 1 "a + :x [ 1 2 ] end  def "foo', 'to foo :x bar 1 "a + :x [ 1 2 ] end');
  this.assert_equals('to foo 1 + 2 - 3 * 4 / 5 % 6 ^ -1 end  def "foo', 'to foo 1 + 2 - 3 * 4 / 5 % 6 ^ -1 end');

  this.assert_equals('to square :x output :x * :x end  copydef "multbyself "square  multbyself 5', 25);
  // TODO: copydef + redefp

  //
  // 7.2 Variable Definition
  //

  this.assert_equals('make "foo 5 :foo', 5);
  this.assert_equals('make "foo "a :foo', 'a');
  this.assert_equals('make "foo [1 2] :foo', [1, 2]);
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
  this.assert_equals('name [1 2] "foo :foo', [1, 2]);
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
  this.assert_equals('make "baz [1 2 3] thing "baz', [1, 2, 3]);

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

  // 7.4 Workspace Predicates
  // (tested above)

  //
  // 7.5 Workspace Queries
  //

  this.assert_equals('erall  contents', [[], [], []]);

  this.assert_equals('erall  make "a 1  to b output 2 end  contents', [['b'], ['a'], []]);
  this.assert_equals('erall  make "a 1  to b output 2 end  procedures', ['b']);
  // TODO: primitives
  this.assert_equals('erall  make "a 1  to b output 2 end  globals', ['a']);
  this.assert_equals('erall  make "a 1  to b output 2 end  names', [[], ['a']]);

  this.assert_equals('erall  make "a 1  make "b 2  to a output 1 end  to b output 2 end  erase [[a] [b]]  contents', [['b'], ['a'], []]);
  this.assert_equals('erall  make "a 1  make "b 2  to a output 1 end  to b output 2 end  erall  contents', [[], [], []]);
  // TODO: erase + redefp


  // 7.6 Workspace Inspection
  // 7.7 Workspace Control

});

test("Control Structures", 40, function () {

  //
  // 8.1 Control
  //

  this.assert_equals('make "c 0  run [ ]  :c', 0);
  this.assert_equals('make "c 0  run [ make "c 5 ]  :c', 5);

  this.assert_equals('runresult [ make "x 1 ]', []);
  this.assert_equals('runresult [ 1 + 2]', [3]);

  this.assert_equals('make "c 0  repeat 5 [ make "c :c + 1 ]  :c', 5);
  this.assert_equals('make "c 0  repeat 4 [ make "c :c + repcount ]  :c', 10);

  this.assert_equals('make "c 0  to foo forever [ make "c :c + 1 if repcount = 5 [ stop ] ] end  foo  :c', 5);
  this.assert_equals('make "c 0  to foo forever [ make "c :c + repcount if repcount = 4 [ stop ] ] end  foo  :c', 10);

  this.assert_equals('ifelse 1 [ "a ] [ "b ]', 'a');
  this.assert_equals('ifelse 0 [ "a ] [ "b ]', 'b');

  this.assert_equals('to foo if 1 [ output "a ] output "b end  foo', 'a');
  this.assert_equals('to foo if 0 [ output "a ] output "b end  foo', 'b');

  this.assert_equals('make "c 1  test 2 > 1  iftrue  [ make "c 2 ]  :c', 2);
  this.assert_equals('make "c 1  test 2 > 1  ift  [ make "c 2 ]  :c', 2);
  this.assert_equals('make "c 1  test 2 > 1  iffalse [ make "c 2 ]  :c', 1);
  this.assert_equals('make "c 1  test 2 > 1  iff [ make "c 2 ]  :c', 1);

  this.assert_equals('to foo forever [ if repcount = 5 [ make "c 234 stop ] ] end  foo  :c', 234);

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

  //
  // 8.2 Template-based Iteration
  //

  this.assert_equals('apply "word ["a "b "c]', '"a "b "c');
  this.assert_equals('(invoke "word "a "b "c)', 'a b c');
  this.assert_equals('make "x 0  to addx :a make "x :x+:a end  foreach "addx [ 1 2 3 4 5 ]  :x', 15);
  this.assert_equals('to double :x output :x * 2 end  map "double [ 1 2 3 ]', [2, 4, 6]);
  this.assert_equals('to odd :x output :x % 2 end  filter "odd [ 1 2 3 ]', [1, 3]);
  this.assert_equals('find "numberp [ "a "b "c 4 "e "f ]', 4);
  this.assert_equals('find "numberp [ "a "b "c "d "e "f ]', []);
  this.assert_equals('reduce "sum [ 1 2 3 4 ]', 10);
  this.assert_equals('(reduce "sum [ 1 2 3 4 ] 10)', 20);

  // TODO: Order of operations
  // TODO: Structures, lists of lists

});

test("Error Messages", 51, function () {

  this.assert_error("to foo end show foo", "No output from procedure");
  this.assert_error("[ 1 2", "Expected ']'");
  this.assert_error("!@#$", "Couldn't parse: '!@#$'");
  this.assert_error("show :nosuchvar", "Don't know about variable NOSUCHVAR");
  this.assert_error("1 / 0", "Division by zero");
  this.assert_error("1 % 0", "Division by zero");
  this.assert_error("1 + -", "Unexpected end of instructions");
  this.assert_error("( 1 + 2", "Expected ')'");
  this.assert_error("( 1 + 2 3", "Expected ')', saw 3");
  this.assert_error("nosuchproc", "Don't know how to NOSUCHPROC");
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
  this.assert_error("to foo end  copydef \"to \"foo", "Can't overwrite special form TO");
  this.assert_error("to foo end  copydef \"show \"foo", "Can't overwrite primitives unless REDEFP is TRUE");
  this.assert_error("erase [ [ TO ] [ ] ]", "Can't ERASE special form TO");
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
});

test("Regression Tests", function() {
  this.assert_equals('make "x 0  repeat 3 [ for [ i 1 4 ] [ make "x :x + 1 ] ]  :x', 12);
  this.assert_equals('make "x 0  for [i 0 100 :i + 1] [make "x :x + :i]  :x', 120);
});
