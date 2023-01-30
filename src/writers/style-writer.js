import CleanCSS from "clean-css";
import fetch from "node-fetch";
import path from "path";
import raw from "../raw";
import { promises as fs } from "fs";
import { mkdirp } from "fs-extra";
import Writer from "./writer";

import {
  Internal,
  escape,
  freeText,
  freeLint,
  padLeft,
  requireText,
  encapsulateCSS,
  absoluteHref,
} from "../utils";

const _ = Symbol("_StyleWriter");
const cleanCSS = new CleanCSS({
  rebaseTo: "..",
});

@Internal(_)
class StyleWriter extends Writer {
  get styles() {
    return this[_].styles.slice();
  }

  get encapsulateCSS() {
    return this[_].encapsulateCSS;
  }

  set encapsulateCSS(encapsulateCSS) {
    return (this[_].encapsulateCSS = !!encapsulateCSS);
  }

  get prefetch() {
    return this[_].prefetch;
  }

  set prefetch(prefetch) {
    return (this[_].prefetch = !!prefetch);
  }

  get baseUrl() {
    return this[_].baseUrl;
  }

  set baseUrl(baseUrl) {
    this[_].baseUrl = String(baseUrl);
  }

  get source() {
    return this[_].source;
  }

  set source(source) {
    this[_].source = String(source);
  }

  constructor(options = {}) {
    super();

    this[_].styles = [];

    this.baseUrl = options.baseUrl;
    this.prefetch = options.prefetch;
    this.source = options.srouce;
    this.encapsulateCSS = options.encapsulateCSS;
  }

  async write(dir, options) {
    await mkdirp(dir);

    options = {
      ...options,
      prefetch: this.prefetch,
    };

    const indexFilePath = `${dir}/index.js`;
    const outputFiles = [];

    if (!options.prefetch) {
      const writingCommon = (async () => {
        const commonFilePath = `${dir}/common.js`;
        await fs.writeFile(commonFilePath, this[_].composeCommonLoader());
        outputFiles.push(commonFilePath);
      })();

      const writingHelpers = (async () => {
        const helpersFilePath = `${dir}/helpers.js`;
        await fs.writeFile(helpersFilePath, raw.styleHelpers);
        outputFiles.push(helpersFilePath);
      })();

      const writingIndex = (async () => {
        const indexText = freeLint(`
          export { default } from "./common";
        `);
        await fs.writeFile(indexFilePath, indexText);
        outputFiles.push(indexFilePath);
      })();

      await Promise.all([writingCommon, writingHelpers, writingIndex]);

      return outputFiles;
    }

    const styleFileNames = this.styles.map((style, index, { length }) => {
      const fileName = padLeft(index, length / 10 + 1, 0) + ".css";
      const filePath = `${dir}/${fileName}`;
      outputFiles.push(filePath);

      return fileName;
    });

    const fetchingStyles = this.styles.map(async (style, index) => {
      const styleFileName = styleFileNames[index];

      const sheet = style.body
        ? style.body
        : /^http/.test(style.href)
        ? await fetch(style.href).then((res) => res.text())
        : await requireText.fromZip(this.baseUrl, style.href);

      return fs.writeFile(
        `${dir}/${styleFileName}`,
        this[_].transformSheet(sheet)
      );
    });

    const writingIndex = (async () => {
      const stylesIndexContent = styleFileNames
        .map((styleFileName) => {
          return `import "./${styleFileName}";`;
        })
        .join("\n");

      await fs.writeFile(indexFilePath, freeLint(stylesIndexContent));
      outputFiles.push(indexFilePath);
    })();

    await Promise.all([...fetchingStyles, writingIndex]);

    return outputFiles;
  }

  setStyle(href, body) {
    if (href) {
      href = absoluteHref(href);
      body = undefined;
    } else {
      href = undefined;
    }

    const exists = this[_].styles.some((style) => {
      return style.href === href && style.body === body;
    });

    if (!exists) {
      this[_].styles.push({
        ...(href && { href }),
        ...(body && { body }),
      });
    }
  }

  _composeCommonLoader() {
    this[_].styles.forEach((style) => {
      if (style.body) {
        style.body = this[_].transformSheet(style.body);
      }
    });

    const styles = this[_].styles
      .map((style) => {
        const fields = {
          ...(style.href && { href: `"${style.href}"` }),
          ...(style.body && { body: `"${escape(style.body, '"')}"` }),
        };
        const text = Object.entries(fields)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
        return `{ ${text} },`;
      })
      .join("\n");

    const fix = this.encapsulateCSS
      ? freeText(`
        export default Promise.all(loadingStyles).then(() => {
          const styleSheets = Array.from(document.styleSheets).filter((styleSheet) => {
            return styleSheet.href && styles.some((style) => {
              return style.type == 'href' && styleSheet.href.match(style.body);
            });
          });
          styleSheets.forEach((styleSheet) => {
            Array.from(styleSheet.rules).forEach((rule) => {
              if (rule.selectorText) {
                rule.selectorText = rule.selectorText
                  .replace(/\\.([\\w_-]+)/g, '.af-class-$1')
                  .replace(/\\[class(.?)="( ?)([^"]+)( ?)"\\]/g, '[class$1="$2af-class-$3$4"]')
                  .replace(/([^\\s][^,]*)(\\s*,?)/g, '.af-view $1$2')
                  .replace(/\\.af-view html/g, '.af-view')
                  .replace(/\\.af-view body/g, '.af-view')
                  ==>${this[_].composeSourceReplacements()}<==
              }
            });
          });
        });
      `)
      : "";

    return freeLint(`
      import { loadStyles } from "./helpers";

      const loadingStyles = loadStyles([
        ==>${styles}<==
      ]);
      ==>${fix}<==
      export default loadingStyles;
    `);
  }

  _composeSourceReplacements() {
    switch (this.source) {
      case "webflow":
        return freeText(`
          .replace(/af-class-w-/g, 'w-')
        `);
      case "sketch":
        return freeText(`
          .replace(/af-class-anima-/g, 'anima-')
          .replace(/af-class-([\\w_-]+)an-animation([\\w_-]+)/g, '$1an-animation$2')
        `);
      default:
        return freeText(`
          .replace(/af-class-w-/g, 'w-')
          .replace(/af-class-anima-/g, 'anima-')
          .replace(/af-class-([\\w_-]+)an-animation([\\w_-]+)/g, '$1an-animation$2')
        `);
    }
  }

  // Will minify and encapsulate classes
  _transformSheet(sheet) {
    if (this.encapsulateCSS) {
      sheet = encapsulateCSS(sheet, this.source);
    }
    sheet = cleanCSS.minify(sheet).styles;

    // Make URLs absolute so webpack won't throw any errors
    return sheet.replace(/url\(([^)]+)\)/g, (match, url) => {
      url = url.replace(/^"(.*)"$/, "$1");
      if (/^(.+):\/\//.test(url)) return match;

      if (!url.startsWith("data:")) {
        url = path.resolve("/", url);
      }
      return `url(${url})`;
    });
  }
}

export default StyleWriter;
