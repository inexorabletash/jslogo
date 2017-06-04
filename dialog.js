// Dialog.prompt(message, default) - like window.prompt(), returns a Promise
// Dialog.alert(message) - like window.alert(), returns a Promise

var Dialog = {
  prompt: function(message, def) { return new Promise(function(resolve, reject) {
    const previous = document.activeElement;
    const bg = document.body.appendChild(document.createElement('div'));
    Object.assign(bg.style, {
      backgroundColor: 'rgba(0,0,0,0.85)',
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      zIndex: 1000
    });

    const fg = bg.appendChild(document.createElement('form'));
    Object.assign(fg.style, {
      backgroundColor: 'white',
      color: 'black',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      position: 'absolute',
      width: '280px',
      height: 'auto',
      padding: '15px',
      left: '50%',
      top: '50%',
      transform: 'translateY(-50%) translateX(-50%)'
    });

    const label = fg.appendChild(document.createElement('label'));
    Object.assign(label.style, {
      display: 'block',
      width: '100%'
    });
    label.appendChild(document.createTextNode(message));

    const input = label.appendChild(document.createElement('input'));
    input.type = 'text';
    input.value = (def !== undefined) ? def : '';
    Object.assign(input.style, {
      width: '100%',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      border: '1px solid gray',
      padding: '4px',
      margin: '-5px',
      marginTop: '10px'
    });

    const buttons = fg.appendChild(document.createElement('div'));
    Object.assign(buttons.style, {
      marginTop: '15px',
      textAlign: 'center'
    });

    const ok = buttons.appendChild(document.createElement('input'));
    ok.type = 'submit';
    ok.value = 'OK';
    Object.assign(ok.style, {
      fontWeight: 'bold',
      border: '1px solid black'
    });

    const cancel = buttons.appendChild(document.createElement('input'));
    cancel.type = 'button';
    cancel.value = 'Cancel';
    Object.assign(cancel.style, {
      border: '1px solid gray'
    });

    [ok, cancel].forEach(b => Object.assign(b.style, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      width: '100px',
      textAlign: 'center',
      marginLeft: '15px',
      marginRight: '15px',
      padding: '5px'
    }));

    fg.addEventListener('submit', e => {
      e.preventDefault();
      bg.remove();
      previous.focus();
      resolve(input.value);
    });
    cancel.addEventListener('click', e => {
      e.preventDefault();
      bg.remove();
      previous.focus();
      resolve(null);
    });
    fg.addEventListener('keydown', e => {
      const VK_ESCAPE = 27;
      if (e.keyCode === VK_ESCAPE) {
        e.preventDefault();
        cancel.click();
      }
    });

    input.focus();
  }); },

  alert: function(message) { return new Promise(function(resolve, reject) {
    const previous = document.activeElement;
    const bg = document.body.appendChild(document.createElement('div'));
    Object.assign(bg.style, {
      backgroundColor: 'rgba(0,0,0,0.85)',
      position: 'absolute',
      left: 0, right: 0, top: 0, bottom: 0,
      zIndex: 1000
    });

    const fg = bg.appendChild(document.createElement('form'));
    Object.assign(fg.style, {
      backgroundColor: 'white',
      color: 'black',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      position: 'absolute',
      width: '280px',
      height: 'auto',
      padding: '15px',
      left: '50%',
      top: '50%',
      transform: 'translateY(-50%) translateX(-50%)'
    });

    const label = fg.appendChild(document.createElement('label'));
    Object.assign(label.style, {
      display: 'block',
      width: '100%'
    });
    label.appendChild(document.createTextNode(message));

    const buttons = fg.appendChild(document.createElement('div'));
    Object.assign(buttons.style, {
      marginTop: '15px',
      textAlign: 'center'
    });

    const ok = buttons.appendChild(document.createElement('input'));
    ok.type = 'submit';
    ok.value = 'OK';
    Object.assign(ok.style, {
      fontWeight: 'bold',
      border: '1px solid black',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      width: '100px',
      textAlign: 'center',
      marginLeft: '15px',
      marginRight: '15px',
      padding: '5px'
    });

    fg.addEventListener('submit', e => {
      e.preventDefault();
      bg.remove();
      previous.focus();
      resolve();
    });

    fg.addEventListener('keydown', e => {
      const VK_ESCAPE = 27;
      if (e.keyCode === VK_ESCAPE) {
        e.preventDefault();
        ok.click();
      }
    });

    ok.focus();
  }); }
};
