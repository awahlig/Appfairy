import cheerio from "cheerio";
import HTMLtoJSX from "../utils/htmltojsx";
import base32 from "base32";
import path from "path";
import statuses from "statuses";
import uglify from "uglify-js";
import { promises as fs } from "fs";
import { mkdirp } from "fs-extra";
import raw from "../raw";
import Writer from "./writer";

import {
  encapsulateCSS,
  escape,
  freeLint,
  freeText,
  Internal,
  splitWords,
  upperFirst,
  absoluteHref,
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

  get parent() {
    return this[_].parent;
  }

  set parent(parent) {
    this[_].parent = parent;
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

  get children() {
    return this[_].children.slice();
  }

  set name(name) {
    if (!isNaN(Number(name))) {
      name = statuses[name];
    }

    const words = splitWords(name);

    Object.assign(this[_], {
      viewName: words.concat("view").map(upperFirst).join(""),
      name: words.map((word) => word.toLowerCase()).join("-"),
    });
  }

  get name() {
    return this[_].name;
  }

  get viewName() {
    return this[_].viewName;
  }

  get viewPath() {
    const viewNames = [];
    for (let writer = this; writer; writer = writer.parent) {
      viewNames.push(writer.viewName);
    }
    return viewNames.reverse().join(".");
  }

  set html(html) {
    if (!html) {
      this[_].html = "";
      this[_].children = [];
      return;
    }

    const children = (this[_].children = []);
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

    let el = $("[af-view]")[0];

    while (el) {
      const $el = $(el);
      const name = $el.attr("af-view");
      let $view = $("<div/>");

      for (const name of ["af-sock", "af-repeat"]) {
        $view.attr(name, $el.attr(name));
        $el.attr(name, null);
      }
      $el.attr("af-view", null);

      // Provide a default socket if none has been defined
      if (!$view.attr("af-sock")) {
        $view.attr("af-sock", name);
      }

      // Pluck the view html and replace with a placeholder
      $view = $view.insertAfter($el);
      $el.remove();

      const child = new ViewWriter({
        name,
        html: $.html($el),
        source: this.source,
        baseUrl: this.baseUrl,
        encapsulateCSS: this.encapsulateCSS,
        parent: this,
      });

      if (
        children.find((viewWriter) => viewWriter.viewName === child.viewName)
      ) {
        throw `error: view ${child.viewPath} already exists`;
      }

      const data = { name: child.viewName };
      const encoded = base32.encode(JSON.stringify(data));
      $view[0].name = `af-view-${encoded}`; // replace "div"

      children.push(child);
      el = $("[af-view]")[0];
    }

    // Apply ignore rules AFTER child elements were plucked
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

    const sockets = (this[_].sockets = {});

    const getSockNamespace = ($el) => {
      return $el
        .parents("[af-sock]")
        .toArray()
        .reverse()
        .map((el) => $(el).attr("af-sock"));
    };

    // Validate the "af-sock" and "af-repeat" attributes
    $("[af-sock]").each((_, el) => {
      const $el = $(el);
      const sock = $el.attr("af-sock").trim();
      const repeat = ($el.attr("af-repeat") || "").trim();

      if (!sock) {
        // Empty - ignore
        $el.attr("af-sock", null);
        $el.attr("af-repeat", null);
        return;
      }

      if (!/^[a-z_-][0-9a-z_-]*$/.test(sock)) {
        const ns = getSockNamespace($el).join(".");
        throw `error: invalid af-sock="${sock}" under "${ns}" in view ${this.viewPath}`;
      }

      const normSock = sock.replace(/_/g, "-");

      if (!/^[?*+!]?$/.test(repeat)) {
        const sockPath = getSockNamespace($el).concat(normSock).join(".");
        throw `error: invalid af-repeat="${repeat}" for socket "${sockPath}" in view ${this.viewPath}`;
      }

      $el.attr("af-sock", normSock);
      $el.attr("af-repeat", repeat);
    });

    // Build the socket tree
    $("[af-sock]").each((_, el) => {
      const $el = $(el);
      const sock = $el.attr("af-sock");
      const repeat = $el.attr("af-repeat");

      let type = $el[0].name;
      if (type.startsWith("af-view-")) {
        const viewData = JSON.parse(base32.decode(type.slice(8)));
        type = viewData.name;
      }

      const group = $el
        .parents("[af-sock]")
        .toArray()
        .reverse()
        .reduce((acc, el) => acc[$(el).attr("af-sock")].sockets, sockets);
      group[sock] = { type, repeat, sockets: {} };
    });

    // Encode socket data into the tag name
    $("[af-sock]").each((i, el) => {
      const $el = $(el);

      const sock = $el.attr("af-sock");
      const repeat = $el.attr("af-repeat");

      $el.attr("af-sock", null);
      $el.attr("af-repeat", null);

      const data = { sock, repeat };
      const encoded = base32.encode(JSON.stringify(data));
      el.tagName += `-af-sock-${i}-${encoded}`;
    });

    // Refetch modified html
    html = $body.html();

    // Transforming HTML into JSX
    let jsx = htmltojsx.convert(html).trim();
    // Bind sockets and child views
    this[_].jsx = bindJSX(jsx, this.viewPath);
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

    this[_].children = [];
    this[_].styles = options.styles || [];
    this[_].wfData = new Map();

    this.name = options.name;
    this.source = options.source;
    this.folder = options.folder || "";
    this.baseUrl = options.baseUrl;
    this.encapsulateCSS = options.encapsulateCSS;
    this.parent = options.parent;

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

  setStyle(href, content) {
    let type;
    let body;

    if (href) {
      type = "href";
      body = absoluteHref(href);
    } else {
      type = "sheet";
      body = content;
    }

    const exists = this[_].styles.some((style) => {
      return style.body == body;
    });

    if (!exists) {
      this[_].styles.push({ type, body });
    }
  }

  _compose() {
    return freeLint(`
      import { useEffect } from "react";
      import { useScripts, createScope } from "${this[_].importPath(
        "./helpers"
      )}";

      /*
        ==>${this[_].composeViewArray().join("\n")}<==
      */

      ==>${this[_].composeViews("export const ")}<==

      export const sock = ${this.viewName}.sock;
      export default ${this.viewName};
    `);
  }

  _composeViewArray() {
    return [
      this.viewPath,
      ...this[_].children.map((child) => child[_].composeViewArray()).flat(),
    ];
  }

  _composeViews(prefix = "") {
    const viewPath = this.viewPath;

    const jsx = [this[_].composeStyleImports(), this.jsx].filter(Boolean);

    const render = freeText(`
      return createScope(props.children, proxy => <>
        ==>${jsx.join("\n")}<==
      </>);
    `);

    const docstring = this[_].composeDocstring();
    const socks = this[_].composeSocks();
    const [scriptsHook, scripts] = this[_].composeScriptsDeclerations();

    const body = [scriptsHook, this[_].composeEffects(), render].filter(
      Boolean
    );

    const decl = [
      `${viewPath}.sock = ${socks};`,
      scripts,
      ...this[_].children.map((child) => {
        return child[_].composeViews();
      }),
    ].filter(Boolean);

    return freeText(`
      /**
        ${viewPath}
        ${"-".repeat(viewPath.length)}
        ==>${docstring}<==
      */
      ${prefix}${viewPath} = (props) => {
        ==>${body.join("\n\n")}<==
      };

      ==>${decl.join("\n\n")}<==
    `);
  }

  _composeStyleImports() {
    const hrefs = this[_].styles
      .map(({ type, body }) => {
        return type == "href" && body;
      })
      .filter(Boolean);

    const sheets = this[_].styles
      .map(({ type, body }) => {
        return type == "sheet" && body;
      })
      .filter(Boolean);

    let css = "";

    css += hrefs
      .map((href) => {
        return `@import url(${href});`;
      })
      .join("\n");

    css += "\n\n";

    css += sheets
      .map((sheet) => {
        return sheet;
      })
      .join("\n\n");

    const imports = escape(css.trim());
    if (!imports) {
      return "";
    }

    return freeText(`
      <style dangerouslySetInnerHTML={{ __html: \`
        ==>${imports}<==
      \` }} />
    `);
  }

  _composeDocstring() {
    if (Object.keys(this[_].sockets).length === 0) {
      return "";
    }

    const collect = (sockets, sockPath = "sock") =>
      Object.entries(sockets)
        .map(([socketName, props]) => {
          const ident = `${sockPath}.${socketName.replace(/-/g, "_")}`;
          const comment = props.repeat
            ? `// af-repeat="${props.repeat}"\n`
            : "";
          if (Object.keys(props.sockets).length === 0) {
            return `${comment}<${props.type} af-sock={${ident}} />`;
          }
          const text =
            comment +
            freeText(`
          <${props.type} af-sock={${ident}}>
            ==>${collect(props.sockets, ident)}<==
          </${props.type}>
        `);
          return `\n${text}\n`;
        })
        .join("\n");

    const hints = collect(this[_].sockets)
      .trim()
      .replace(/\n\n\n/g, "\n\n");
    return `\`\`\`\n${hints}\n\`\`\``;
  }

  _composeSocks() {
    if (Object.keys(this[_].sockets).length === 0) {
      return "Object.freeze({})";
    }

    const collect = (sockets) =>
      Object.entries(sockets)
        .map(([socketName, props]) => {
          const ident = socketName.replace(/-/g, "_");
          if (Object.keys(props.sockets).length === 0) {
            return `${ident}: "${socketName}",`;
          }
          return freeText(`
          ${ident}: Object.freeze({
            "": "${socketName}",
            ==>${collect(props.sockets)}<==
          }),
        `);
        })
        .join("\n");

    return freeText(`
        Object.freeze({
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

  _composeScriptsDeclerations() {
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

    if (content.length === 0) return ["", ""];

    const viewPath = this.viewPath;
    const hook = `useScripts(${viewPath}.scripts);`;
    const decl = freeText(`
      ${viewPath}.scripts = Object.freeze([
        ==>${content.join("\n")}<==
      ]);
    `);

    return [hook, decl];
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
}

function bindJSX(jsx, viewPath) {
  const decode = (encoded) => JSON.parse(base32.decode(encoded));

  // ORDER MATTERS
  return (
    jsx
      // Open close
      .replace(
        /<([\w._-]+)-af-sock-(\d+)-(\w+)(.*?)>([^]*)<\/\1-af-sock-\2-\3>/g,
        (_match, el, _index, encoded, attrs, content) => {
          const { sock, repeat } = decode(encoded);
          const repeatArg = repeat ? `, "${repeat}"` : "";
          // If there are nested sockets
          return /<[\w._-]+-af-sock-\d+-\w+/.test(content)
            ? `{proxy("${sock}", (props, T="${el}") => <T ${mergeProps(
                attrs
              )}>{createScope(props.children, proxy => <>${bindJSX(
                content,
                viewPath
              )}</>)}</T>${repeatArg})}`
            : `{proxy("${sock}", (props, T="${el}") => <T ${mergeProps(
                attrs
              )}>{props.children ? props.children : <>${content}</>}</T>${repeatArg})}`;
        }
      )
      // Self closing
      .replace(
        /<([\w._-]+)-af-sock-\d+-(\w+)(.*?)\/>/g,
        (_match, el, encoded, attrs) => {
          const { sock, repeat } = decode(encoded);
          const repeatArg = repeat ? `, "${repeat}"` : "";
          // Handle sockets for child views
          if (el.startsWith("af-view-")) {
            el = decode(el.slice(8)).name;
            return `{proxy("${sock}", (props, T=${viewPath}.${el}) => <T ${mergeProps(
              attrs
            )}>{props.children}</T>${repeatArg})}`;
          }
          return `{proxy("${sock}", (props, T="${el}") => <T ${mergeProps(
            attrs
          )}>{props.children}</T>${repeatArg})}`;
        }
      )
      // Decode non-socket child views
      .replace(/<af-view-(\w+)(.*?)\/>/g, (_match, encoded) => {
        return `<${viewPath}.${decode(encoded).name}/>`;
      })
  );
}

// Merge props along with class name
function mergeProps(attrs) {
  attrs = attrs.trim();

  if (!attrs) {
    return "{...props}";
  }

  let className = attrs.match(/className="([^"]+)"/);

  if (!className) {
    return `${attrs} {...props}`;
  }

  className = className[1];
  attrs = attrs.replace(/ ?className="[^"]+"/, "");

  return `${attrs} {...{...props, className: \`${className} $\{props.className || ""}\`}}`.trim();
}

export default ViewWriter;
