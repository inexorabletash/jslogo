# Tutorial
## Introduction

### Get in a dialogue with PiE
#### First Try
* Type in ``Can you forward 150 steps?`` and Click the ``Talk``. See what happen?
* Great! The "turtle" just move forward 100 steps! And PiE confirmed your command in the response box.
* Then Type in ``Turn left 90 degrees!`` and Click the ``Talk``. You can also type the ``Enter`` on the keyboard.
* You will then see the "turtle" turn left 90 degrees!
* Next, let's try move the turtle quicker by using ``repeat``.
* Type in ``Repeat last 2 commands for 3 times!``.
* Yeah! You got a square! right?

#### Attributes can be modified
* Change the width of the line by ``Can you use a bolder pen?`` and ``Can you use a lighter pen?``.
* Change the color of the line by ``Can you change to color red?``. You can change to any other colors like: ``grey`` ``purple`` ``green`` ``yellow`` ``black`` ``blue`` ``red``.
* Suspend the turtle by ``Get up!`` and the turtle will be off the canvas. There will be no trace left when the turtle is off the paper. You can try ``Can you forward 150 steps?`` to double check.
* Put down the turtle

#### Move the turtle
* The turtle can move forward and backward. Try ``Go forward 150 steps!`` and ``Get back 150 Steps``.
* The turtle can turn clockwise or anti-clockwise. Try ``Turn left 90 degrees`` and ``Turn right 90 degrees``. You can name any degree between 0 to 360. In addition, try ``Turn left`` and ``Turn right``. The turtle will by default turn 90 degrees.

#### Basics in Programming
##### Condition
* Condition in programming is similar to the choices in real life. Such as: if it rains, I should bring the umbrella, otherwise, I should not. In PiE-LOGO, Try ``If `` 
##### Loop
* Loop is a faster way to get things done if you want to repeat several commands over and over again. Try ``Can you go forward 100 steps?`` ``Turn left`` ``can you repeat last 2 commands for 3 times?`` What do you get? A square!

#### Examples
##### Red Star
```
Use a red pen!
Can you forward 150 steps?
turn right 144 degrees please!
Repeat the last 2 commands for 5 times.
```
##### 



```
clearscreen window
repeat 144 [
  setlabelheight repcount
  penup
  fd repcount * repcount / 30
  label "Logo
  bk repcount * repcount / 30
  pendown
  rt 10
]
```