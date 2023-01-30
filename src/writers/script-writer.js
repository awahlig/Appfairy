import fetch from "node-fetch";
import uglify from "uglify-js";
import patches from "../patches";
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
  absoluteHref,
} from "../utils";

const _ = Symbol("_ScriptWriter");

@Internal(_)
class ScriptWriter extends Writer {
  get scripts() {
    return this[_].scripts.slice();
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

  constructor(options = {}) {
    super();

    const scripts = (this[_].scripts = []);

    if (options.patchWebflow) {
      scripts.push({
        type: "code",
        body: patches.webflow,
        isAsync: false,
      });
    }

    this.baseUrl = options.baseUrl;
    this.prefetch = options.prefetch;
  }

  async write(dir, options) {
    await mkdirp(dir);

    options = {
      ...options,
      prefetch: this.prefetch,
    };

    const indexFilePath = `${dir}/index.js`;
    const outputFiles = [];

    // always write helpers
    const writingHelpers = (async () => {
      const helpersFilePath = `${dir}/helpers.js`;
      await fs.writeFile(helpersFilePath, raw.scriptHelpers);
      outputFiles.push(helpersFilePath);
    })();

    if (!options.prefetch) {
      const writingCommon = (async () => {
        const commonFilePath = `${dir}/common.js`;
        await fs.writeFile(commonFilePath, this[_].composeCommonLoader());
        outputFiles.push(commonFilePath);
      })();

      const writingIndex = (async () => {
        const indexText = freeLint(`
          export { default } from './common'
        `);
        await fs.writeFile(indexFilePath, indexText);
        outputFiles.push(indexFilePath);
      })();

      await Promise.all([writingCommon, writingHelpers, writingIndex]);

      return outputFiles;
    }

    const scriptFileNames = this.scripts.map((script, index, { length }) => {
      const fileName = padLeft(index, length / 10 + 1, 0) + ".js";
      const filePath = `${dir}/${fileName}`;
      outputFiles.push(filePath);

      return fileName;
    });

    const fetchingScripts = this.scripts.map(async (script, index) => {
      const scriptFileName = scriptFileNames[index];

      let code =
        script.body ||
        (/^http/.test(script.src)
          ? await fetch(script.src)
              .then((res) => res.text())
              .then((text) => uglify.minify(text).code)
          : await requireText.fromZip(this.baseUrl, script.src));

      code = code.replace(/\n\/\/# ?sourceMappingURL=.*\s*$/, "");

      code = freeLint(`
        /* ${script.body || script.src} */

        (function() {

        ==>${freeText(code)}<==

        }).call(window)
      `);

      return fs.writeFile(`${dir}/${scriptFileName}`, code);
    });

    const writingIndex = (async () => {
      const scriptsIndexContent = scriptFileNames
        .map((scriptFileName) => {
          return `import './${scriptFileName}'`;
        })
        .join("\n");

      await fs.writeFile(indexFilePath, freeLint(scriptsIndexContent));
      outputFiles.push(indexFilePath);
    })();

    await Promise.all([...fetchingScripts, writingHelpers, writingIndex]);

    return outputFiles;
  }

  setScript(src, body, { isAsync } = {}) {
    if (body) {
      src = undefined;
      body = uglify.minify(body).code;
    } else {
      src = absoluteHref(src);
      body = undefined;
    }

    const exists = this[_].scripts.some((script) => {
      return script.src === src && script.body === body;
    });

    if (!exists) {
      this[_].scripts.push({
        ...(src && { src }),
        ...(body && { body }),
        isAsync,
      });
    }
  }

  _composeCommonLoader() {
    const scripts = this[_].scripts
      .map((script) => {
        const fields = {
          ...(script.src && { src: `'${script.src}'` }),
          ...(script.body && { body: `'${escape(script.body, "'")}'` }),
          ...(script.isAsync && { isAsync: true }),
        };
        const text = Object.entries(fields)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
        return `{ ${text} },`;
      })
      .join("\n");

    return freeLint(`
      import { loadScripts } from './helpers'

      const loadingScripts = loadScripts([
        ==>${scripts}<==
      ])

      export default loadingScripts
    `);
  }
}

export default ScriptWriter;
