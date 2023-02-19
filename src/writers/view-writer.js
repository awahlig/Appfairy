import cheerio from "cheerio";
import base32 from "base32";
import path from "path";
import statuses from "statuses";
import uglify from "uglify-js";
import { promises as fs } from "fs";
import { mkdirp } from "fs-extra";
import raw from "../raw";
import Writer from "./writer";
import CleanCSS from "clean-css";

import {
  encapsulateCSS,
  escape,
  freeLint,
  freeText,
  Internal,
  splitWords,
  upperFirst,
  absoluteHref,
  HTMLtoJSX,
} from "../utils";

const _ = Symbol("_ViewWriter");
const htmltojsx = new HTMLtoJSX({ createClass: false });

@Internal(_)
class ViewWriter extends Writer {
  static async writeAll(viewWriters, dir) {
    await mkdirp(dir);

    const outputFiles = [];

    const writingViews = viewWriters.map(async (viewWriter) => {
      const filePath = await viewWriter.write(dir);
      outputFiles.push(filePath);
    });

    const folders = {};
    viewWriters.forEach((viewWriter) => {
      const folder = viewWriter.folder;
      if (!folders[folder]) {
        folders[folder] = [viewWriter];
      } else {
        folders[folder].push(viewWriter);
      }
    });

    const writingIndices = Object.entries(folders).map(
      async ([folder, viewWriters]) => {
        const index = viewWriters
          .sort((writerA, writerB) => {
            const a = writerA.viewName;
            const b = writerB.viewName;
            return a < b ? -1 : a > b ? 1 : 0;
          })
          .map(
            (viewWriter) =>
              `export { ${viewWriter.viewName} } from "./${viewWriter.viewName}";`
          )
          .join("\n");

        const indexFilePath = `${dir}/${folder}/index.js`;
        await mkdirp(path.dirname(indexFilePath));
        await fs.writeFile(indexFilePath, freeLint(index));
        outputFiles.push(indexFilePath);
      }
    );

    const writingHelpers = (async () => {
      const helpersFilePath = `${dir}/helpers.js`;
      await fs.writeFile(helpersFilePath, raw.viewHelpers);
      outputFiles.push(helpersFilePath);
    })();

    await Promise.all([...writingViews, ...writingIndices, writingHelpers]);

    return outputFiles;
  }

  get encapsulateCSS() {
    return this[_].encapsulateCSS;
  }

  set encapsulateCSS(encapsulateCSS) {
    this[_].encapsulateCSS = !!encapsulateCSS;
  }

  get folder() {
    return this[_].folder;
  }

  set folder(folder) {
    this[_].folder = String(folder);
  }

  get baseUrl() {
    return this[_].baseUrl;
  }

  set baseUrl(baseUrl) {
    this[_].baseUrl = String(baseUrl);
  }

  set name(name) {
    if (!isNaN(Number(name))) {
      name = statuses[name];
    }

    const words = splitWords(name);

    const camelCase = (words) => [
      ...words.slice(0, 1).map((w) => w.toLowerCase()),
      ...words.slice(1).map(upperFirst),
    ];

    Object.assign(this[_], {
      viewName: words.concat("view").map(upperFirst).join(""),
      sockName: camelCase(words.concat("sock")).join(""),
      sockNamespace: camelCase(words).join(""),
      name: words.map((word) => word.toLowerCase()).join("-"),
    });
  }

  get name() {
    return this[_].name;
  }

  get viewName() {
    return this[_].viewName;
  }

  get sockName() {
    return this[_].sockName;
  }

  get sockNamespace() {
    return this[_].sockNamespace;
  }

  set html(html) {
    if (!html) {
      this[_].html = "";
      return;
    }

    const $ = cheerio.load(html);

    // Encapsulate styles
    if (this.encapsulateCSS) {
      $("style").each((i, el) => {
        const $el = $(el);
        const html = $el.html();
        const css = encapsulateCSS(html, this.srouce);

        $el.html(css);
      });
    }

    $("*").each((i, el) => {
      const $el = $(el);
      let className = $el.attr("class");

      if (this.encapsulateCSS && className && !/af-class-/.test(className)) {
        className = className.replace(/([\w_-]+)/g, "af-class-$1");

        switch (this.source) {
          case "webflow":
            className = className.replace(/af-class-w-/g, "w-");
            break;
          case "sketch":
            className = className
              .replace(/af-class-anima-/g, "anima-")
              .replace(
                /af-class-([\w_-]+)an-animation([\w_-]+)/g,
                "$1an-animation$2"
              );
            break;
          default:
            className = className
              .replace(/af-class-w-/g, "w-")
              .replace(/af-class-anima-/g, "anima-")
              .replace(
                /af-class-([\w_-]+)an-animation([\w_-]+)/g,
                "$1an-animation$2"
              );
        }

        $el.attr("class", className);
      }

      let href = $el.attr("href");
      if (href) {
        $el.attr("href", absoluteHref(href));
      }

      let src = $el.attr("src");
      if (src) {
        $el.attr("src", absoluteHref(src));
      }
    });

    // Apply ignore rules
    $("[af-ignore]").remove();
    // Empty inner HTML
    $("[af-empty]").html("").attr("af-empty", null);

    this[_].scripts = [];

    // Set inline scripts. Will be loaded once component has been mounted
    $("script").each((i, script) => {
      const $script = $(script);
      const src = $script.attr("src");
      const type = $script.attr("type");
      const isAsync = !!$script.attr("async");

      // We're only interested in JavaScript script tags
      if (type && !/javascript/i.test(type)) return;

      if (src) {
        this[_].scripts.push({
          src: absoluteHref(src),
          isAsync,
        });
      } else {
        this[_].scripts.push({
          body: $script.html(),
          isAsync,
        });
      }

      $script.remove();
    });

    const $body = $("body");

    // Wrapping with .af-view will apply encapsulated CSS
    if (this.encapsulateCSS) {
      const $afContainer = $('<span class="af-view"></span>');

      $afContainer.append($body.contents());
      $afContainer.prepend("\n  ");
      $afContainer.append("\n  ");
      $body.append($afContainer);
    }

    html = $body.html();

    this[_].html = html;

    // af-view -> af-sock
    $("[af-view]").each((_, el) => {
      const $el = $(el);
      const name = $el.attr("af-view");
      if (!$el.attr("af-sock")) {
        $el.attr("af-sock", name);
      }
      $el.attr("af-view", null);
    });

    const sockets = (this[_].sockets = {});

    const getSockParents = ($el) =>
      $el.parents("[af-sock]").toArray().reverse();

    // Validate the "af-sock" attribute
    $("[af-sock]").each((_, el) => {
      const $el = $(el);
      const sock = $el.attr("af-sock").trim();

      if (!sock) {
        // Empty - ignore
        $el.attr("af-sock", null);
        return;
      }

      if (!/^[a-z_-][0-9a-z_-]*$/i.test(sock)) {
        const socks = getSockParents($el).map((el) => $(el).attr("af-sock"));
        const ns = [this.sockNamespace, ...socks].join(".");
        throw `error: invalid af-sock="${sock}" under "${ns}"`;
      }

      const words = splitWords(sock);
      const normSock = [
        ...words.slice(0, 1).map((w) => w.toLowerCase()),
        ...words.slice(1).map(upperFirst),
      ].join("");

      $el.attr("af-sock", normSock);
    });

    // Build the socket tree and encode socket data into the tag name
    $("[af-sock]").each((i, el) => {
      const $el = $(el);
      const sock = $el.attr("af-sock");
      let type = $el[0].name;

      const group = getSockParents($el).reduce(
        (acc, el) => acc[$(el).attr("af-sock")].sockets,
        sockets
      );
      group[sock] = { type, sockets: {} };

      const data = { sock };
      const encoded = base32.encode(JSON.stringify(data));
      el.tagName += `-af-sock-${i}-${encoded}`;
    });

    const removeAttr = (name) =>
      $(`[${name}]`).each((_, el) => $(el).attr(name, null));

    // Remove af- attributes
    removeAttr("af-sock");
    // Legacy
    removeAttr("af-repeat");
    removeAttr("af-el");

    // Refetch modified html
    html = $body.html();

    // Transforming HTML into JSX
    let jsx = htmltojsx.convert(html).trim();
    // Bind sockets
    this[_].jsx = this[_].bindJSX(jsx);
  }

  set wfData(dataAttrs) {
    for (let [key, value] of Object.entries(dataAttrs)) {
      if (/^wf/.test(key)) {
        this[_].wfData.set(key, value);
      }
    }
  }

  get scripts() {
    return this[_].scripts ? this[_].scripts.slice() : [];
  }

  get styles() {
    return this[_].styles.slice();
  }

  get html() {
    return this[_].html;
  }

  get wfData() {
    return this[_].wfData;
  }

  get jsx() {
    return this[_].jsx;
  }

  get sockets() {
    return this[_].sockets && [...this[_].sockets];
  }

  get source() {
    return this[_].source;
  }

  set source(source) {
    this[_].source = String(source);
  }

  constructor(options) {
    super();

    this[_].styles = options.styles || [];
    this[_].wfData = new Map();

    this.name = options.name;
    this.source = options.source;
    this.folder = options.folder || "";
    this.baseUrl = options.baseUrl;
    this.encapsulateCSS = options.encapsulateCSS;

    this.html = options.html;
  }

  async write(dir) {
    const filePath = path.normalize(
      `${dir}/${this.folder}/${this.viewName}.js`
    );
    await mkdirp(path.dirname(filePath));
    await fs.writeFile(filePath, this[_].compose());
    return filePath;
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
      this[_].styles.push({ ...(href && { href }), ...(body && { body }) });
    }
  }

  _compose() {
    return freeLint(`
      import { useEffect } from "react";
      import { View, Hatch, defineSock } from "${this[_].importPath(
        "./helpers"
      )}";

      ==>${this[_].composeView("export const ")}<==
    `);
  }

  _composeView(prefix = "") {
    const viewName = this.viewName;

    const args = [
      `namespace={${this.sockName}}`,
      "content={props.children}",
      "fallback={props.fallback}",
      "scripts={scripts}",
      "styles={styles}",
    ];

    const render = freeText(`
      return (
        <View ${args.join(" ")}>
          ==>${this.jsx}<==
        </View>
      );
    `);

    const socks = this[_].composeSocks();
    const scripts = this[_].composeScripts();
    const styles = this[_].composeStyles();

    const body = [this[_].composeEffects(), render].filter(Boolean);

    const decl = [
      socks,
      scripts,
      styles,
    ].filter(Boolean);

    return freeText(`
      ==>${decl.join("\n\n")}<==

      ${prefix}${viewName} = (props) => {
        ==>${body.join("\n\n")}<==
      };
    `);
  }

  _composeSocks() {
    const collect = (sockets) =>
      Object.entries(sockets)
        .map(([socketName, props]) => {
          const comment = `<${props.type}>`;
          if (Object.keys(props.sockets).length === 0) {
            return `${socketName}: null, // ${comment}`;
          }
          return freeText(`
            ${socketName}: { // ${comment}
              ==>${collect(props.sockets)}<==
            },
          `);
        })
        .join("\n");

    return freeText(`
      export const ${this.sockName} = defineSock("${this.sockNamespace}", {
        ==>${collect(this[_].sockets)}<==
      })
    `);
  }

  _composeEffects() {
    const content = [this[_].composeWfDataAttrs()].filter(Boolean);

    if (content.length === 0) return "";

    return freeText(`
      useEffect(() => {
        ==>${content.join("\n\n")}<==
      }, []);
    `);
  }

  _composeScripts() {
    const content = this[_].scripts.map((script) => {
      const getBody = () => {
        const minified = uglify.minify(script.body).code;
        // Unknown script format ??? fallback to maxified version
        const code = minified || script.body;
        return `${escape(code, '"')}`;
      };
      const fields = {
        ...(script.src && { src: `"${script.src}"` }),
        ...(script.body && { body: `"${getBody()}"` }),
        ...(script.isAsync && { isAsync: true }),
      };
      const text = Object.entries(fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      return `{ ${text} },`;
    });

    return freeText(`
      export const scripts = Object.freeze([
        ==>${content.join("\n")}<==
      ]);
    `);
  }

  _composeStyles() {
    const cleanCSS = new CleanCSS();

    const content = this[_].styles.map(({ href, body }) => {
      if (body) {
        body = cleanCSS.minify(body).styles;
      }
      const fields = {
        ...(href && { href: `"${href}"` }),
        ...(body && { body: `"${escape(body, '"')}"` }),
      };
      const text = Object.entries(fields)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      return `{ ${text} },`;
    });

    return freeText(`
      export const styles = Object.freeze([
        ==>${content.join("\n")}<==
      ]);
    `);
  }

  _composeWfDataAttrs() {
    if (!this[_].wfData.size) {
      return "";
    }

    const lines = ['const htmlEl = document.querySelector("html");'];

    for (let [attr, value] of this[_].wfData) {
      lines.push(`htmlEl.dataset["${attr}"] = "${value}";`);
    }

    return lines.join("\n");
  }

  _importPath(name) {
    const result = path.relative(this.folder, name).replace(/\\/g, "/");
    return result.startsWith(".") ? result : `./${result}`;
  }

  _bindJSX(jsx) {
    const decode = (encoded) => JSON.parse(base32.decode(encoded));

    // ORDER MATTERS
    return (
      jsx
        // Open close
        .replace(
          /<([\w._-]+)-af-sock-(\d+)-(\w+)(.*?)>([^]*)<\/\1-af-sock-\2-\3>/g,
          (_match, el, _index, encoded, attrs, content) => {
            const { sock } = decode(encoded);
            const elAndAttrs = `${el} ${attrs.trimStart()}`.trimEnd();
            return `<Hatch sock="${sock}"><${elAndAttrs}>${this[
              _
            ].bindJSX(content)}</${el}></Hatch>`;
          }
        )
        // Self closing
        .replace(
          /<([\w._-]+)-af-sock-\d+-(\w+)(.*?)\/>/g,
          (_match, el, encoded, attrs) => {
            const { sock } = decode(encoded);
            const elAndAttrs = `${el} ${attrs.trimStart()}`.trimEnd();
            return `<Hatch sock="${sock}"><${elAndAttrs} /></Hatch>`;
          }
        )
    );
  }
}

export default ViewWriter;
