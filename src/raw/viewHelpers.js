/* Auto-generated using Appfairy.  DO NOT EDIT! */
/* eslint-disable */

import React from "react";
import { loadScripts } from "../scripts/helpers";
import { loadStyles } from "../styles/helpers";

export class ProxyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProxyError";
  }
}

export const useHead = (scripts = [], styles = []) => {
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    Promise.all([loadScripts(scripts), loadStyles(styles)]).then(() => {
      setLoaded(true);
    });
  }, [scripts, styles]);

  React.useLayoutEffect(() => {
    const Webflow = window.Webflow;
    if (Webflow && loaded) {
      Webflow.ready();
      Webflow.require("ix2")?.init();
    }
  }, [loaded]);

  return loaded;
};

const transformProxies = (children = []) => {
  children = [].concat(children).filter(Boolean);

  const proxies = {};

  React.Children.forEach(children, (child) => {
    const { "af-sock": sock, ...props } = child.props;

    const name = typeof sock === "object" ? sock[""] : sock;
    if (!name) {
      const tag = child.type.name || child.type;
      throw new ProxyError(`: missing af-sock= on <${tag}>`);
    }

    Object.defineProperties(props, {
      _name: { value: name, writable: false },
      _type: { value: child.type, writable: false },
      _used: { value: false, writable: true },
    });

    if (child.key != null) {
      props.key = child.key;
    }

    if (child.ref != null) {
      props.ref = child.ref;
    }

    if (!proxies[name]) {
      proxies[name] = props;
    } else if (!(proxies[name] instanceof Array)) {
      proxies[name] = [proxies[name], props];
    } else {
      proxies[name].push(props);
    }
  });

  return proxies;
};

export const createScope = (children, callback) => {
  const proxies = transformProxies(children);

  const result = callback((name, callback, repeat = "") => {
    const props = proxies[name];

    const call = (props) => {
      try {
        return callback(props, props._type);
      } catch (err) {
        if (err instanceof ProxyError) {
          // reconstruct namespace for proxy errors
          throw new ProxyError(`${name}.${err.message}`);
        }
        throw err;
      }
    };

    // no proxy
    if (!props) {
      if (repeat === "!") {
        throw new ProxyError(`${name}: required proxy not found`);
      }
      if (/^[?*]$/.test(repeat)) return null;
      return call({});
    }

    // mark proxy as recognised
    (props instanceof Array ? props : [props])[0]._used = true;

    // single proxy
    if (!(props instanceof Array)) return call(props);
    // 2 or more proxies
    if (/^[+*]$/.test(repeat)) return props.map(call);

    throw new ProxyError(`${name}: too many proxies (${props.length})`);
  });

  // check for unrecognised proxies
  Object.entries(proxies).forEach(([name, props]) => {
    if (!(props instanceof Array ? props : [props])[0]._used) {
      throw new ProxyError(`${name}: unrecognised proxy`);
    }
  });

  return result;
};
