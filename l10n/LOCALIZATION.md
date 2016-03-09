## Translations welcome! ##

To provide a translation:

* Add an entry to `l10n/languages.txt` of the form `language CODE`
* Add a localization file `l10n/lang-CODE.json`

... where `CODE` is the language code (e.g. `eo` is Esperanto)

The localization file must be a valid JSON file with the following structure:

```json
{
  "page": {
```

_Optional:_ include for RTL languages (Arabic, Hebrew, etc)

```json
    "dir": "rtl",
```

_Optional:_ include if you want a custom set of examples, e.g. with translated keywords:

```json
    "examples": "l10n/examples.eo.txt",
```

```json
    "translations": {
      "title": "...",
      ...
    }
```

Translations of the HTML page, for elements with `data-l10n-id` attributes.

* key: data-l10n-id _or_ data-l10n-id `.` attribute
* value: replacement text

If a translation is not found, the element text will not be translated.

```json
  },
  "interpreter": {
    "messages": {
      "Array size must be positive integer": "...",
      ...
    },
```

Translations of messages (errors) from the interpreter.
These can be found in `__("...")` strings in the code.

* key: the untranslated (English) string
* value: translated string

Parts of the string in `{...}` are substitutions and must be left alone.
If a translation is not found, the English text will be used.

```json
    "keywords": {
      "...": "END",
      "...": "ELSE"
    },
```      
      
Translations of _keywords_ - words in the Logo language which are not procedures.
There are only two - `ELSE` and `END`.

* key: the keyword alias
* value: the untranslated (English) keyword

These function as aliases when parsing programs.

```json   
    "procedures": {
      "abs": ["...", ...],
      ...
    }
```

Translations of _procedure_ names.

* key: the untranslated (English) procedure name
* value: an array of one or more aliases

The aliases are added to the environment.

```json
},
"graphics": {
  "colors": {
    "...": "black",
    ...
    }
```    

Translations of _color_ names.

* key: the color alias
* value: a CSS color string


```json
  }
}
```
