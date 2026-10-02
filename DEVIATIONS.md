# Deviations from UCBLogo

jslogo is intentionally a browser-friendly subset of Berkeley Logo rather than a complete UCBLogo port. This note summarizes the differences that are currently documented in the source (`logo.js`, `turtle.js`, `tests.js`, and `language.html`) and cross-checked against Brian Harvey's Berkeley Logo reference manual.

This list focuses on verified differences in syntax, semantics, extensions, and large unimplemented areas. It does **not** try to repeat every standard alias (`FD`, `BK`, `SE`, etc.) that jslogo already shares with UCBLogo.

## Parsing and syntax differences

- **Scientific notation is accepted in numeric literals.** jslogo accepts literals such as `1.23e-45`; the Berkeley manual documents decimal literals plus the `EXP` primitive, not exponential literal syntax.
- **`%` and `^` are parsed as infix operators.** UCBLogo's tokenization chapter only treats `+-*/=<>` as infix operators. jslogo adds `%` for remainder and `^` for exponentiation.
- **Unicode arrow words are special one-token commands.** `←`, `↑`, `→`, and `↓` are parsed as standalone words and bound to small turtle motions/turns.
- **Getter/setter variable syntax is not implemented.** UCBLogo supports the optional `FOO`/`SETFOO` style described in manual section 1.2 (via `ALLOWGETSET`/`USEALTERNATENAMES`). jslogo always uses traditional Logo variable syntax (`:foo`, `MAKE "foo ...`).
- **Vertical-bar words are not implemented.** UCBLogo supports `|...|` quoting and the `VBARREDP` predicate; jslogo does not.

## Semantic differences in shared primitives

- **`ASK` is turtle-specific, not object-oriented.**
  - UCBLogo: `ASK object runlist` temporarily changes the current object and can act as either a command or an operation.
  - jslogo: `ASK turtleIndex statements` temporarily selects a turtle number and runs a statement list. There is no general object system, and `ASK` does not output an expression value.
- **`DEQUEUE` is LIFO in jslogo.**
  - UCBLogo specifies that `DEQUEUE` removes the **least recently** queued item.
  - jslogo's implementation removes the **most recently** queued item, and the test suite documents that behavior.
- **Color handling is browser-oriented rather than UCBLogo's numeric/RGB model.**
  - jslogo accepts **CSS color names** and `#rrggbb` strings anywhere `parseColor` is used (`SETPENCOLOR`, `SETBACKGROUND`, `SETTEXTCOLOR`, `SETPALETTE`, etc.).
  - UCBLogo documents color numbers and 0..99 RGB lists; `SETPALETTE` specifically takes an RGB list.
  - jslogo's query procedures return browser-style color values: `PENCOLOR`, `BACKGROUND`, and `PALETTE` return CSS names or hex strings, not UCBLogo's color slot numbers / RGB lists.
  - The built-in palette is close to, but not identical with, UCBLogo's documented names. In particular jslogo uses CSS `lime`, `green`, `aquamarine`, and `gray` where the manual lists `green`, `forest`, `aqua`, and `grey` for slots 2, 10, 11, and 15.
- **`SETTEXTCOLOR` has different arity and behavior.**
  - UCBLogo: `SETTEXTCOLOR foreground background`
  - jslogo: `SETTEXTCOLOR color` (single input, foreground only), plus a non-standard `TEXTCOLOR` query.
- **`STANDOUT` is approximated with Unicode bold characters.** UCBLogo returns a machine-specific standout word intended for terminal display; jslogo maps ASCII letters/digits to Unicode mathematical bold code points instead.
- **`ERROR` never reports a real instruction line number.** UCBLogo says the fourth member of `ERROR`'s result is the instruction line where the error occurred. In jslogo that slot is always `-1`.

## jslogo extensions

### Extra general-purpose primitives

- `SPLIT thing list`
- `DEF procname` (pretty-printed procedure text as a string, distinct from standard `TEXT`)
- `DOTIMES`
- `ABS`, `TAN`, `RADTAN`, `XOR`

There is also an undocumented joke predicate, `NUMBERWANG`, in `logo.js`.

### Browser and canvas extensions

- **Multiple-turtle support**: `SETTURTLE`, `TURTLE`, `TURTLES`, `CLEARTURTLES`
- **Canvas/geometry helpers**: `BOUNDS`, `TOUCHES`, `BITCUT`, `BITPASTE`
- **Label font control**: `SETLABELFONT`, `LABELFONT`
- **Arrow-word commands**: `←`, `↑`, `→`, `↓`

These are not Berkeley Logo primitives; they exist to make the in-browser turtle graphics environment more capable.

## Standard UCBLogo facilities that are missing or only partial

### Entire UCBLogo subsystems not implemented

- **Object system / message passing** from manual chapter 3: `KINDOF`, `ONEOF`, `SOMETHING`, `HAVE`, `HAVEMAKE`, `TALKTO`, `SELF`, `PARENTS`, `MYNAMES`, `MYNAMEP`, `MYPROCS`, `MYPROCP`, `WHOSENAME`, `WHOSEPROC`, etc.
- **Macros and macro inspection**: `.MACRO`, `.DEFMACRO`, `MACROP`, `MACROEXPAND`
- **Editor / library / host integration** commands such as `EDIT`, `EDITFILE`, `ED*`, `LOAD`, `LOADNOISILY`, `SAVE`, `SAVEL`, `HELP`, `GC`, `LOGOPLATFORM`, `LOGOVERSION`, `CSLSLOAD`, `SETEDITOR`, `SETLIBLOC`, `SETTEMPLOC`, `SETCSLSLOC`, `SETHELPLOC`, `COMMANDLINE`, `STARTUP`

### File and raw terminal I/O omitted

jslogo does not implement UCBLogo's file access and raw terminal primitives, including:

- `READRAWLINE`, `READCHAR`, `READCHARS`, `SHELL`
- `SETPREFIX`, `PREFIX`
- `OPENREAD`, `OPENWRITE`, `OPENAPPEND`, `OPENUPDATE`, `CLOSE`, `ALLOPEN`, `CLOSEALL`, `ERASEFILE`
- `DRIBBLE`, `NODRIBBLE`
- `SETREAD`, `SETWRITE`, `READER`, `WRITER`
- `SETREADPOS`, `SETWRITEPOS`, `READPOS`, `WRITEPOS`
- `EOFP`, `FILEP`, `KEYP`, `SETCURSOR`, `CURSOR`, `SETMARGINS`

### Graphics/window features omitted

The browser turtle supports the core drawing model, but not these UCBLogo features:

- `TEXTSCREEN`, `FULLSCREEN`, `SPLITSCREEN`, `SCREENMODE`
- `REFRESH`, `NOREFRESH`
- `SETPENPATTERN`, `SETPEN`, `PEN`
- `SAVEPICT`, `LOADPICT`, `EPSPICT`

### Workspace and control features omitted or partial

- Not implemented: `FULLTEXT`, `NODES`, `PAUSE`, `CONTINUE`, `GOTO`, `TAG`, `CASCADE`, `CASCADE.2`, `TRANSFER`
- Tracing/stepping controls are missing: `TRACE`, `UNTRACE`, `TRACEDP`, `STEP`, `UNSTEP`, `STEPPEDP`
  - jslogo does define the query procedures `TRACED` and `STEPPED`, but without the standard control primitives there is no supported way to mark procedures that way.
- UCBLogo special variables and compatibility switches are largely absent, including `REDEFP`, `CASEIGNOREDP`, `PRINTDEPTHLIMIT`, `PRINTWIDTHLIMIT`, `ERRACT`, `BUTTONACT`, `KEYACT`, `UNBURYONEDIT`, and `USEALTERNATENAMES`.
  - Some jslogo code paths check for names such as `REDEFP`, but there is no full UCBLogo special-variable subsystem behind them.

## Notes

- `language.html` documents the primitives that jslogo *does* support, including several extensions listed above.
- `tests.js` deliberately codifies some of the current deviations (for example `DEQUEUE` and the `ERROR` line-number placeholder), so the behavior described here is current, not hypothetical.
