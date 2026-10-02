jslogo - Logo in JavaScript
===========================

This is hosted at https://inexorabletash.github.io/jslogo/ for playing with live.

[Language Reference](https://htmlpreview.github.io/?https://github.com/inexorabletash/jslogo/blob/master/language.html) -
this attempts to implement a subset of [UCBLogo](https://www.cs.berkeley.edu/~bh/v2ch14/manual.html)
defined in in *Brian Harvey's Computer Science Logo Style*

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
* [Logo](https://en.wikipedia.org/wiki/Logo_%28programming_language%29) on Wikipedia
* [The Logo Foundation](http://el.media.mit.edu/logo-foundation/)
* [Berkeley Logo (UCBLogo)](https://www.cs.berkeley.edu/~bh/logo.html)
* [The Logo Tree Project](https://pavel.it.fmi.uni-sofia.bg/logotree/)
* [Ian Bicking on Logo](https://ianbicking.org/blog/2007/10/logo)
* [PyLogo](http://pylogo.sourceforge.net/)
* [Introduction to Computer Programming](http://www.guyhaas.com/bfoit/itp/itp.html)
* [Logo 15-word challenge](http://www.mathcats.com/gallery/15wordcontest.html)

To Do
-----
* Document deviations from UCB Logo standard
