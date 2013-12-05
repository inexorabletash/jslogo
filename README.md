jslogo - Logo in JavaScript
===========================

This is hosted at http://calormen.com/jslogo for playing with live.

[Language Reference](http://htmlpreview.github.com/?https://github.com/inexorabletash/jslogo/blob/master/language.htm) -
this attempts to implement a subset of [UCBLogo](http://www.cs.berkeley.edu/~bh/v2ch14/manual.html)
defined in in *Brian Harvey's Computer Science Logo Style*

Use `git clone --recursive` to get [polyfill](https://github.com/inexorabletash/polyfill) for older browsers.

Logo Examples
-------------
    to star repeat 5 [ fd 100 rt 144 ] end
    star
    to square :length repeat 4 [ fd :length rt 90 ] end
    repeat 36 [ square 50 rt 10 ]
    to randomcolor setcolor pick [ red orange yellow green blue violet ] end
    repeat 36 [ randomcolor square random 200 rt 10 ]
    window pu repeat 72 [ setlabelheight repcount fd repcount * 2.5 label "Logo bk repcount * 2.5 rt 10 ]

Logo Links
----------
* [Logo](http://en.wikipedia.org/wiki/Logo_%28programming_language%29) on Wikipedia
* Other Logo implementations that run in a Web browser:
  * [papert - logo in your browser](http://logo.twentygototen.org/) ([source code](https://code.google.com/p/papert/))
  * [Curly Logo](https://github.com/drj11/curlylogo)
* [The Logo Foundation](http://el.media.mit.edu/logo-foundation/)
* [Berkeley Logo (UCBLogo)](http://www.cs.berkeley.edu/~bh/logo.html)
* [The Logo Tree Project](http://elica.net/download/papers/LogoTreeProject.pdf)
* [Ian Bicking on Logo](http://blog.ianbicking.org/2007/10/19/logo/)
* [PyLogo](http://pylogo.sourceforge.net/)
* [Introduction to Computer Programming](http://www.bfoit.org/itp/itp.html)
* [LogoForum](http://groups.yahoo.com/group/LogoForum/)

To Do
-----
* Document deviations from UCB Logo standard
* Make these examples all work: [Logo 15-word challenge](http://www.mathcats.com/gallery/15wordcontest.html)
* Use Workers, so you can see the turtle move
* Tail-call optimization
