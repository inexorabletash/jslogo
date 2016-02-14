// Russian Localization (Sample)
(function() {

  //////////////////////////////////////////////////
  // Page

  // For RTL languages:
  // document.body.dir = 'rtl';

  // Override examples link e.g.:
  // examples = "l10n/examples.txt"

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
    "title": "Интерпретатор Лого",
    "tl-title": "Интерпретатор Лого",
    "tl-contact": "Контакты",
    "tl-tests": "Юнит-тесты",
    "tl-source": "Исходный код",
    "tl-reference": "Справочник",
    "start-togetherjs": "Сотрудничество",
    "no-canvas": "Нам очень жаль. Ваш браузер не поддерживает HTML-элемент canvas.",
    "ip-button-run": "Запустить",
    "ip-button-clear": "Очистить",
    "logo-ta-single-line.placeholder": "Место для ввода программного кода",
    "logo-ta-multi-line.placeholder": "Место для ввода программного кода",
    "sb-link-reference": "Справочник",
    "sb-link-text-reference": "язык Лого",
    "sb-link-library": "Библиотека",
    "sb-link-text-library": "ваши процедуры",
    "sb-link-history": "История",
    "sb-link-text-history": "ваши действия на сайте",
    "sb-link-examples": "Примеры",
    "sb-link-text-examples": "классные демонстрационные программы",
    "sb-link-extras": "Дополнительно",
    "sb-link-text-extras": "полезные утилиты",
    "sb-link-links": "Ссылки",
    "sb-link-text-links": "другие ресурсы о Лого",
    "extras-download-library": "Скачать библиотеку",
    "extras-download-drawing": "Скачать рисунок",
    "extras-clear-history": "Очистить историю",
    "extras-clear-library": "Очистить библиотеку",
    "github-forkme": "Сделать fork на GitHub-е"
  }));

  //////////////////////////////////////////////////
  // Interpreter

  // Messages
  logo.localize = function(s) {
    return {
      // default-text: replacement-text
      'Division by zero': 'Деление на ноль',
      'Index out of bounds': 'Индекс вышел за допустимые границы'
      // ...
    }[s];
  };

  // Keywords
  logo.keywordAlias = function(name) {
    return {
      // alias: keyword
      'ИНАЧЕ': 'ELSE',
      'КОНЕЦ': 'END'
      // ...
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
    // procname: [alias, ...]
    'true': ['истина'],
    'false': ['ложь']
  }));

  //////////////////////////////////////////////////
  // Turtle Graphics

  // Additional color names
  // Colors are specified per https://drafts.csswg.org/css-color-3
  turtle.colorAlias = function(name) {
    return {
      // alias: css-color
      'красный': 'red',
      'оранжевый': 'orange',
      'жёлтый': 'yellow',
      'зелёный': 'green',
      'синий': 'blue',
      'фиолетовый': 'violet',
      'белый': 'white',
      'серый': 'gray',
      'чёрный': 'black'
    }[name];
  };

}());
