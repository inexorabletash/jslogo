// data for elizabot.js
// entries prestructured as layed out in Weizenbaum's description 
// [cf: Communications of the ACM, Vol. 9, #1 (January 1966): p 36-45.]

var elizaInitials = [
"How do you do.  Please tell me your problem.",
// additions (not original)
"Please tell me what's been bothering you.",
"Is something troubling you ?"
];

var elizaFinals = [
"Goodbye.  It was nice talking to you.",
// additions (not original)
"Goodbye.  This was really a nice talk.",
"Goodbye.  I'm looking forward to our next session.",
"This was a good session, wasn't it -- but time is over now.   Goodbye.",
"Maybe we could discuss this moreover in our next session ?   Goodbye."
];

var elizaQuits = [
"bye",
"goodbye",
"done",
"exit",
"quit"
];

var elizaPres = [
"dont", "don't",
"cant", "can't",
"wont", "won't",
"recollect", "remember",
"recall", "remember",
"dreamt", "dreamed",
"dreams", "dream",
"maybe", "perhaps",
"certainly", "yes",
"machine", "computer",
"machines", "computer",
"computers", "computer",
"were", "was",
"you're", "you are",
"i'm", "i am",
"same", "alike",
"identical", "alike",
"equivalent", "alike"
];

var elizaPosts = [
"am", "are",
"your", "my",
"me", "you",
"myself", "yourself",
"yourself", "myself",
"i", "you",
"you", "I",
"my", "your",
"i'm", "you are"
];

var elizaSynons = {
"be": ["am", "is", "are", "was"],
"belief": ["feel", "think", "believe", "wish"],
"cannot": ["can't"],
"desire": ["want", "need"],
"everyone": ["everybody", "nobody", "noone"],
"family": ["mother", "mom", "father", "dad", "sister", "brother", "wife", "children", "child"],
"happy": ["elated", "glad", "better"],
"sad": ["unhappy", "depressed", "sick"]
};

var elizaKeywords = [


/*
  Array of                        // **keyword** - (ELIZA feature) words to look for (and then do the following actions)
  ["<key>", <rank>, [             // **rank** - (ELIZA feature) keyword hierarchy, just like Math PEMDAs; e.g. `repeat` has greater precendence than `function`
    ["<decomp>", [                // **decomp** - rules used by the system to match natural language descriptions
      "<reasmb>",                 // **reasmb** - A natural language response (chosen sequentially)
      "<reasmb>",                 // **logo_command** - logo command to execute. Put * findings into <placeholders>.
      "<reasmb>"
    ],<logo_command>,
    ["<decomp>", [
      "<reasmb>",
      "<reasmb>",
      "<reasmb>"
    ],<logo_command>]
  ]]
*/

["xnone", 0, [
 ["*", [
     "I'm not sure I understand you fully.",
     "Please go on.",
     "What does that suggest to you ?",
     "Do you feel strongly about discussing such things ?",
     "That is interesting.  Please continue.",
     "Tell me more about that.",
     "Does talking about this bother you ?"
  ],"none"]
]],

["clear", 0, [
 ["* clear *", [
     "Let's clear the screen!",
     "Okay, let's clear up all the drawings!"
     ],"cs"]
 
]],

// Move the turtle
["forward", 0, [
 ["* forward * steps *", [
     "Let's forward #2# steps!",
     "Okay, let's move ahead #2# steps!"
     ],"fd #2#"]
 
]],

["back", 0, [
 ["* back * steps *", [
     "Let's get back #2# steps!",
     "Okay, let's move back #2# steps!"
     ],"bk #2#"]
 
]],

["ahead", 0, [
 ["* ahead * steps *", [
     "Let's forward #2# steps!",
     "Okay, let's move ahead #2# steps!"
     ],"fd #2#"]
 
]],

["backwards", 0, [
 ["* backwards * steps *", [
     "Let's get back #2# steps!",
     "Okay, let's move back #2# steps!"
     ],"bk #2#"]
 
]],

["forward", 0, [
 ["* forward * step *", [
     "Let's forward #2# steps!",
     "Okay, let's move ahead #2# steps!"
     ],"fd #2#"]
 
]],

["back", 0, [
 ["* back * step *", [
     "Let's get back #2# steps!",
     "Okay, let's move back #2# steps!"
     ],"bk #2#"]
 
]],

["ahead", 0, [
 ["* ahead * step *", [
     "Let's forward #2# steps!",
     "Okay, let's move ahead #2# steps!"
     ],"fd #2#"]
 
]],

["backwards", 0, [
 ["* backwards * step *", [
     "Let's get back #2# steps!",
     "Okay, let's move back #2# steps!"
     ],"bk #2#"]
 
]],


["left", 1, [
 ["* turn left * degrees *", [
     "Let's turn left #2# degrees!",
     "Okay, let's turn #2# degrees to the left!"
     ],"left #2#"] 
]],

["left", 1, [
 ["* turn * degrees to the left*", [
     "Let's turn #2# degrees to the left!",
     "Okay, let's turn #2# degrees to the left!"
     ],"left #2#"] 
]],


["left", 0, [
 ["* turn left", [
     "Let's turn left!",
     "Okay, let's turn to the left!"
     ],"left 90"]
]],



["right", 1, [
 ["* turn right * degrees *", [
     "Let's turn right #2# degrees!",
     "Okay, let's turn #2# degrees to the right!"
     ],"right #2#"] 
]],

["right", 1, [
 ["* turn * degrees to the right*", [
     "Let's turn #2# degrees to the right!",
     "Okay, let's turn #2# degrees to the right!"
     ],"right #2#"] 
]],


["right", 0, [
 ["* turn right", [
     "Let's turn right!",
     "Okay, let's turn to the right!"
     ],"right 90"]
]],


["left", 1, [
 ["* turn left * degree *", [
     "Let's turn left #2# degree!",
     "Okay, let's turn #2# degree to the left!"
     ],"left #2#"] 
]],

["left", 1, [
 ["* turn * degree to the left*", [
     "Let's turn #2# degree to the left!",
     "Okay, let's turn #2# degree to the left!"
     ],"left #2#"] 
]],




["right", 1, [
 ["* turn right * degree *", [
     "Let's turn right #2# degree!",
     "Okay, let's turn #2# degree to the right!"
     ],"right #2#"] 
]],

["right", 1, [
 ["* turn * degree to the right*", [
     "Let's turn #2# degree to the right!",
     "Okay, let's turn #2# degree to the right!"
     ],"right #2#"] 
]],


["repeat", 0, [
 ["* repeat * last * commands for * times", [
     "Okay, Let's repeat last #3# commands for #4# times!",
     ],"repeat #4# \"last\" #3#"]
 
]],

// change attributes
["bolder", 0, [
 ["* bolder *", [
     "Okay, Let's make the line bolder!",
     ],"setpensize pensize+1"]
 
]],

["lighter", 0, [
 ["* lighter *", [
     "Okay, Let's make the line lighter!",
     ],"setpensize pensize-1"]
 
]],

["red", 0, [
 ["* red *", [
     "Okay, Let's make the pen color be red!",
     ],"setpencolor 4"]
 
]],

["blue", 0, [
 ["* blue *", [
     "Okay, Let's make the pen color be blue!",
     ],"setpencolor 1"]
 
]],

["black", 0, [
 ["* black *", [
     "Okay, Let's make the pen color be black!",
     ],"setpencolor 0"]
 
]],

["yellow", 0, [
 ["* yellow *", [
     "Okay, Let's make the pen color be yellow!",
     ],"setpencolor 6"]
 
]],

["green", 0, [
 ["* green *", [
     "Okay, Let's make the pen color be green!",
     ],"setpencolor 2"]
 
]],

["purple", 0, [
 ["* purple *", [
     "Okay, Let's make the pen color be purple!",
     ],"setpencolor 13"]
 
]],

["grey", 0, [
 ["* grey *", [
     "Okay, Let's make the pen color be grey!",
     ],"setpencolor 15"]
 
]],

["up", 0, [
 ["* get up *", [
     "Okay, Let's lift the turtle off the canvas!",
     ],"penup"]
 
]],

["pen", 0, [
 ["* pen off * paper *", [
     "Okay, Let's lift the turtle off the canvas!",
     ],"penup"]
 
]],

["pen", 0, [
 ["* pen off * canvas *", [
     "Okay, Let's lift the turtle off the canvas!",
     ],"penup"]
 
]],

["down", 0, [
 ["* get down *", [
     "Okay, Let's put the turtle back on the canvas!",
     ],"pendown"]
 
]],

["down", 0, [
 ["* pen down *", [
     "Okay, Let's put the turtle back on the canvas!",
     ],"pendown"]
 
]],

// scope

["if", 1, [
 ["* get down *", [
     "Okay, Let's put the turtle back on the canvas!",
     ],"pendown"]
 
]],

["repeat", 1, [
 ["* repeat * following * for * times", [
     "Okay, Let's repeat these commands for #4# times!",
     ],"repeat #4# \["]
]],

["end", 0, [
 ["* end * repeat*", [
     "Okay, Let's end the repeat!",
     ],"\]"]
]],

["end", 0, [
 ["* end * function*", [
     "Okay, Let's end the repeat!",
     ],"END"]
]],

["function", 1, [
 ["* function called *", [
     "Okay, Let's define #2# as a function!",
     ],"TO #2#"]
]],

["function", 1, [
 ["* call the function *", [
     "Okay, Let's call #2#!",
     ],"#2#"]
]],

 // let the label height be the same as repeat count
["label", 1, [
 ["* label height * repeat count *", [
     "Okay, Let's make the label height the same as the repeat count!",
     ],"setlabelheight repcount"]
]],

["label", 1, [
 ["* put the label * here *", [
     "Okay, Let's put the label #2# here!",
     ],"label \"#2#"]
]],

["randomcolor", 3, [
 ["* randomcolor *", [
     "Okay, Let's use random color!",
     ],"TO randomcolor setcolor pick \[ red orange yellow green blue violet \] END randomcolor"]
]],






];

// regexp/replacement pairs to be performed as final cleanings
// here: cleanings for multiple bots talking to each other
var elizaPostTransforms = [
	/ old old/g, " old",
	/\bthey were( not)? me\b/g, "it was$1 me",
	/\bthey are( not)? me\b/g, "it is$1 me",
	/Are they( always)? me\b/, "it is$1 me",
	/\bthat your( own)? (\w+)( now)? \?/, "that you have your$1 $2 ?",
	/\bI to have (\w+)/, "I have $1",
	/Earlier you said your( own)? (\w+)( now)?\./, "Earlier you talked about your $2."
];

// eof