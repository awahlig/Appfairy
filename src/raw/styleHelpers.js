/* Auto-generated using Appfairy.  DO NOT EDIT! */
/* eslint-disable */

const loadingStyles = {};

export const loadStyles = (styles) => {
  return Promise.all(
    styles.map((style) => {
      const key = style.body ? style.body : style.href;
      let loading = loadingStyles[key];
      if (loading) {
        return loading;
      }

      let styleEl;
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

      loadingStyles[key] = loading;
      return loading;
    })
  );
};
