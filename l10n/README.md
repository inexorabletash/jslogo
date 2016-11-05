## Translations welcome! ##

To provide a translation:

* Add an entry to `l10n/languages.txt` of the form `language CODE`
* Add a localization file `l10n/lang-CODE.json`

... where `CODE` is the language code (e.g. `eo` is Esperanto)

The localization file must be a valid JSON file with the following structure:

```js
{
  "page": { ... },
  "interpreter": { ... },
  "graphics": { ... }
}
```

## Page

_Optional:_ include for RTL languages (Arabic, Hebrew, etc)

```js
    "dir": "rtl"
```

_Optional:_ include if you want a custom set of examples, e.g. with translated keywords:

```js
    "examples": "l10n/examples.eo.txt"
```

### Text

Page elements with `data-l10n-id` attributes can have text replaced.

* key: data-l10n-id _or_ data-l10n-id `.` attribute
* value: replacement text

If a translation is not found, the element text will not be translated.

```js
    "translations": {
      "title": "...",
      ...
    }
```

## Interpreter

### Error messages

These can be found in `err("...")` strings in the code.

* key: the untranslated (English) string
* value: translated string

Parts of the string in `{...}` are substitutions and must be left alone.
If a translation is not found or is `null`, the English text will be used.

```js
    "messages": {
      "Array size must be positive integer": "...",
      ...
    }
```

### Keywords

Keywords are special words in the Logo language which are not procedures.
There are only two - `ELSE` and `END`.

* key: the keyword alias
* value: the untranslated (English) keyword

These function as aliases when parsing programs.

```js
    "keywords": {
      "...": "END",
      "...": "ELSE"
    }
```

### Procedure Names

* key: the procedure alias
* value: the untranslated (English) procedure name

The aliases are added to the environment.

```js
    "procedures": {
      "...": "abs",
      ...
    }
```

## Graphics

### Color Names

* key: the color alias
* value: a CSS color string

```js
    "colors": {
      "...": "black",
      ...
    }
```
