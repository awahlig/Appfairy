const loadingScripts = {};

export const loadScripts = (scripts) => {
  return scripts.reduce((previous, script) => {
    const key = script.body ? script.body : script.src;
    if (loadingScripts[key]) {
      return Promise.all([previous, loadingScripts[key]]);
    }

    const loading = previous.then(() => {
      // eslint-disable-next-line no-undef
      const scriptEl = document.createElement("script");
      scriptEl.type = "text/javascript";

      let loading;
      if (script.body) {
        scriptEl.innerHTML = script.body;
      } else {
        scriptEl.src = script.src;
        loading = new Promise((resolve, reject) => {
          scriptEl.onload = resolve;
          scriptEl.onerror = reject;
        });
      }

      // eslint-disable-next-line no-undef
      document.head.appendChild(scriptEl);

      if (!script.isAsync) return loading;
    });

    loadingScripts[key] = loading;
    return loading;
  }, Promise.resolve());
};
