export const loadStyles = (styles) => {
  return Promise.all(
    styles.map((style) => {
      let styleEl;
      let loading;

      if (style.body) {
        // eslint-disable-next-line no-undef
        styleEl = document.createElement("style");

        styleEl.type = "text/css";
        styleEl.innerHTML = style.body;

        loading = Promise.resolve();
      } else {
        // eslint-disable-next-line no-undef
        styleEl = document.createElement("link");

        loading = new Promise((resolve, reject) => {
          styleEl.onload = resolve;
          styleEl.onerror = reject;
        });

        styleEl.rel = "stylesheet";
        styleEl.type = "text/css";
        styleEl.href = style.href;
      }

      // eslint-disable-next-line no-undef
      document.head.appendChild(styleEl);

      return loading;
    })
  );
};
