jslogo - Logo in JavaScript
===========================

This is hosted at http://calormen.com/jslogo for playing with live.

Logo Examples
-------------
    to star repeat 5 [ fd 100 rt 144 ] end
    star
    to square :length repeat 4 [ fd :length rt 90 ] end
    repeat 36 [ square 50 rt 10 ]
    to randomcolor setcolor pick [ red orange yellow green blue violet ] end
    repeat 36 [ randomcolor square random 200 rt 10 ]
    window pu repeat 72 [ setlabelheight repcount fd repcount * 2.5 label "Logo bk repcount * 2.5 rt 10 ]



