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
     ],"clear()"]
 
]],

["forward", 0, [
 ["* forward * steps *", [
     "Let's forward #2# steps!",
     "Okay, let's move ahead #2# steps!"
     ],"forward (#2#)"]
 
]],

["left", 0, [
 ["* turn left * degrees *", [
     "Let's turn left (2) steps!",
     "Okay, let's turn (2) degrees to the left!"
     ],"left (#2#)"]
 
]],

["repeat", 0, [
 ["* repeat last * commands for * times", [
     "Okay, Let's repeat last #2# commands for #3# times!",
     ],"repeat (\"last\",#2#,#3#)"]
 
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