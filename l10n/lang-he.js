// Hebrew Localization
(function() {

  //////////////////////////////////////////////////
  // Page

  examples = "l10n/examples.he.txt";

  document.body.parentNode.dir = 'rtl';
  document.getElementById("links").style.direction = "ltr";

  // UI Text
  (function(translation) {
    var ids = new Set();
    Object.keys(translation).forEach(function(key) {
      var parts = key.split('.'), id = parts[0], attr = parts[1], s = translation[key];
      ids.add(id);
      var elem = document.querySelector('[data-l10n-id="'+id+'"]');
      if (!elem)
        console.warn('Unused translation: ' + id);
      else if (attr)
        elem.setAttribute(attr, s);
      else
        elem.textContent = s;
    });
    Array.from(document.querySelectorAll('[data-l10n-id]'))
      .map(function(element) { return element.getAttribute('data-l10n-id'); })
      .filter(function(id) { return !ids.has(id); })
      .forEach(function(id) { console.warn('Missing translation: ' + id); });
  }({
    // data-l10n-id: replacement-text
    // data-l10n-id.attribute: replacement-text
    "no-canvas": "הדפדפן אינו תומך בציור, לא ניתן לפעול.",
    "title": "לוגו",
    "tl-title": "לוגו",
    "tl-contact": "קשר",
    "tl-tests": "בדיקות",
    "tl-source": "קוד",
    "tl-reference": "מדריך",
    "start-togetherjs": "שתף",
    "logo-ta-single-line.placeholder": "כתוב את התוכנית כאן",
    "logo-ta-multi-line.placeholder": "כתוב את התוכנית כאן",
    "ip-button-run": "הרץ",
    "ip-button-clear": "נקה",
    "sb-link-reference": "מדריך",
    "sb-link-text-reference": "שפת לוגו",
    "sb-link-library": "ספריה",
    "sb-link-text-library": "פרוצדורות שלך",
    "sb-link-history": "הסטוריה",
    "sb-link-text-history": "כל מה שעשית עד כה",
    "sb-link-examples": "דומגאות",
    "sb-link-text-examples": "דוגמאות שכיף לנסות",
    "sb-link-extras": "תוספות",
    "sb-link-text-extras": "תוספות שימושיות",
    "sb-link-links": "קישורים",
    "sb-link-text-links": "מקורות נוספים לשפת לוגו",
    "extras-download-library": "הורד ספריה",
    "extras-download-drawing": "הורד ציור",
    "extras-clear-history": "נקה הסטוריה",
    "extras-clear-library": "נקה ספריה",
    "github-forkme": "שכפל אותי",
  }));

  //////////////////////////////////////////////////
  // Interpreter

  // Messages
  logo.localize = function(string) {
    return {
      "Array size must be positive integer": "גודל מערך חייב להיות חיובי",
      "Can't apply {proc} to special {name:U}": "לא יכול לשמור {proc} לשם מיוחד {name:U}",
      "Can't ERASE primitives unless REDEFP is TRUE": "לא יכול למחוק פרמטיביים אלא אם REDEFP הוא אמת",
      "Can't ERASE special form {name:U}": "לא יכול למחוק תבנית מיוחדת {name:U}",
      "Can't overwrite primitives unless REDEFP is TRUE": "לא יכול להגדיר מחדש על פרמטיבים אלא אם REDEFP הוא אמת",
      "Can't overwrite special form {name:U}": "לא יכול להגדיר מחדש תבנית מיוחדת {name:U}",
      "Can't redefine primitive {name:U}": "לא יכול להגדיר מחדש פרמיטבי {name:U}",
      "Can't show definition of primitive {name:U}": "לא יכול להראות הגדרה של פרמיטיב {name:U}",
      "Couldn't parse: '{string}'": "לא יכול לפענח: '{string}'",
      "Division by zero": "חלוקה באפס",
      "Don't know about variable {name:U}": "לא מכיר משתנה {name:U}",
      "Don't know how to {name:U}": "לא יודע כיצד לבצע {name:U}",
      "Don't know what to do with {result}": "לא יודע מה לעשות עם {result}",
      "Expected ')'": "מצפה ל-')'",
      "Expected ']'": "מצפה ל-']'",
      "Expected '}'": "מצפה ל-'}'",
      "Expected array": "מצפה למערך",
      "Expected block": "מצפה לבלוק",
      "Expected END": "מצפה לסוף",
      "Expected identifier": "מצפה לשם",
      "Expected list": "מצפה לרשימה",
      "Expected list of length 2": "מצפה לרשימה באורך 2",
      "Expected number": "מצפה למספר",
      "Expected number after @": "מצפה למספר לאחר @",
      "Expected ')', saw {word}": "מצפה ל-')', נמצא {word}",
      "Expected string": "מצפה למחרוזת",
      "Index out of bounds": "אינדקס מחוץ לתחום",
      "Internal error in expression parser": "שגיאה פנימית במפענח ביטויים",
      "No output from procedure": "פרוצדורה לא החזירה פלט",
      "Unexpected '{c}'": "'{c}' אינו צפוי",
      "Unexpected end of instructions": "סיום הוראות אינו צפוי",
      "Unexpected value: null": "ערך null אינו צפוי",
      "Unexpected value: unknown type": "ערך עם טיפוס לא ידוע לא צפוי",
    }[string]
  };

  // Keywords
  logo.keywordAlias = function(name) {
    return {
      'סוף': 'END',
      'אחרת': 'ELSE',
    }[name];
  };

  // Procedures
  (function(defs) {
    Object.keys(defs).forEach(function(def) {
      defs[def].forEach(function(alias) {
        logo.copydef(alias, def);
      });
    });
  }({
    "abs": ["ערךמוחלט"],
    "and": ["וגם"],
    "apply": ["ישם"],
    "arc": ["קשת"],
    "array": ["מערך"],
    "arraytolist": ["מערךלרשימה"],
    "back": ["אחורה", "אח"],
    "butfirst": ["בליראשון", "בר"],
    "butfirsts": ["בליראשונים"],
    "butlast": ["בליאחרון", "בא"],
    "bye": ["להתראות"],
    "char": ["תו"],
    "clean": ["נקה"],
    "clearscreen": ["נקהמסך", "נמ"],
    "cleartext": ["נקהטקסט"],
    "combine": ["צרף"],
    "contents": ["תוכן"],
    "copydef": ["העתקהגדר"],
    "count": ["כמות"],
    "def": ["הגדר"],
    "dequeue": ["הוצא"],
    "difference": ["הפרש"],
    "erall": ["מחקהכל"],
    "erase": ["מחק"],
    "false": ["שקר"],
    "fence": ["גדר"],
    "fill": ["מלא"],
    "filled": ["ממולא"],
    "filter": ["סנן"],
    "find": ["מצא"],
    "first": ["ראשון"],
    "firsts": ["ראשונים"],
    "for": ["עבור"],
    "foreach": ["עבורכל"],
    "forever": ["לתמיד"],
    "form": ["מבנה"],
    "forward": ["קדימה", "קד"],
    "fput": ["שיםראשון"],
    "gensym": ["יצרסימן"],
    "global": ["כללי"],
    "globals": ["כלליים"],
    "heading": ["לאן"],
    "hideturtle": ["החבאצב"],
    "home": ["הביתה"],
    "if": ["אם"],
    "ifelse": ["אםאחרת"],
    "iffalse": ["אםשקר", "אםש"],
    "iftrue": ["אםאמת", "אםא"],
    "ignore": ["התעלם"],
    "int": ["מספר"],
    "invoke": ["הפעל"],
    "item": ["פריט"],
    "label": ["תווית"],
    "labelsize": ["גודלתווית"],
    "last": ["אחרון"],
    "left": ["שמאלה", "שמ"],
    "list": ["רשימה"],
    "listtoarray": ["רשימהלמערך"],
    "local": ["מקומי"],
    "localmake": ["עשהמקומי"],
    "lput": ["שיםאחרון"],
    "make": ["עשה"],
    "map": ["מפה"],
    "minus": ["פחות"],
    "modulo": ["שארית"],
    "name": ["שם"],
    "namelist": ["רשימתשמות"],
    "names": ["שמות"],
    "not": ["לא"],
    "or": ["או"],
    "output": ["פלט"],
    "pencolor": ["צבעעט"],
    "pendown": ["הורדעט"],
    "penmode": ["מצבעט"],
    "pensize": ["גודלעט"],
    "penup": ["הרםעט"],
    "pick": ["בחר"],
    "pop": ["משוך"],
    "pos": ["מיקום"],
    "power": ["חזקה"],
    "primitives": ["פרמטיבים"],
    "print": ["הדפס", "הד"],
    "procedures": ["פרוצדורות"],
    "push": ["דחוף"],
    "queue": ["הוסף"],
    "random": ["אקראי"],
    "readword": ["קראמילה"],
    "reduce": ["צמצם"],
    "remainder": ["מחלק"],
    "remdup": ["הסרכפולים"],
    "remove": ["הסר"],
    "repcount": ["מונהחז"],
    "repeat": ["חזור"],
    "rerandom": ["אתחלאקראי"],
    "reverse": ["הפוך"],
    "right": ["ימינה", "ימ"],
    "round": ["עגל"],
    "run": ["הרץ"],
    "runresult": ["תוצאתהרצה"],
    "sentence": ["משפט", "מש"],
    "setheading": ["כווןראש", "כר"],
    "setitem": ["קבעפריט"],
    "setlabelheight": ["קבעגודלתווית"],
    "setpencolor": ["שנהצבע"],
    "setpensize": ["שנהרוחב"],
    "setpos": ["קבעמיקום"],
    "setx": ["קבעמיקוםאפקי"],
    "setxy": ["קבעמיקוםצב"],
    "sety": ["קבעמיקוםאנגי"],
    "show": ["הצג"],
    "showturtle": ["הצגצב"],
    "sqrt": ["שורש"],
    "stop": ["עצור"],
    "sum": ["סכום"],
    "test": ["בדיקה"],
    "thing": ["דבר"],
    "to": ["למד"],
    "towards": ["כיצדלהגיע"],
    "true": ["אמת"],
    "turtlemode": ["מצבצב"],
    "type": ["כתוב"],
    "window": ["חלון"],
    "word": ["מילה"],
    "wrap": ["עטוף"],
    "xcor": ["מיקוםאפקי"],
    "xor": ["אוס"],
    "ycor": ["מיקוםאנכי"],
  }));

  //////////////////////////////////////////////////
  // Turtle Graphics

  // Additional color names
  turtle.colorAlias = function(string) {
    return {
      "שחור": "black", "כחול": "blue", "ירקרק": "lime", "טורקיז": "cyan",
      "אדום": "red", "ארגמן": "magenta", "צהוב": "yellow", "לבן": "white",
      "חום": "brown", "חוםבהיר": "tan", "ירוק": "green", "תכלת": "aquamarine",
      "אדמדם": "salmon", "סגול": "purple", "כתום": "orange", "אפור": "gray",
    }[string]
  };

}());
