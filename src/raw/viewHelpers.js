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

const defaultViewContext = Object.freeze({
  hatch: "",
  namespace: "",
  template: null,
  proxies: null,
  used: null,
  parent: null,
});

const ViewContext = React.createContext(defaultViewContext);

export const View = ({
  namespace,
  content,
  scripts,
  styles,
  fallback,
  children,
}) => {
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

  const context = {
    ...defaultViewContext,
    namespace: resolveSock(namespace),
    template: children,
  };

  return loaded ? (
    <ViewContext.Provider value={context}>{content}</ViewContext.Provider>
  ) : (
    <>{fallback}</>
  );
};

export const Render = (props) => {
  const context = React.useContext(ViewContext);
  const namespace = resolveSock(props.namespace) || context.namespace;

  const spec = React.useMemo(() => {
    const spec = {};
    React.Children.forEach(props.children, (child) => {
      if (child) {
        const item = transformProxy(child, namespace);

        if (!spec[item.sock]) spec[item.sock] = [item];
        else spec[item.sock].push(item);
      }
    });
    return spec;
  }, [props.children, namespace]);

  const used = React.useRef({});
  const keys = React.useMemo(() => Object.keys(spec), [spec]);

  React.useEffect(() => {
    for (const sock of keys) {
      if (!used.current[sock]) {
        console.warn(`${namespace}: unused proxy "${sock}"`);
      }
    }
  }, [keys, namespace]);

  const innerContext = {
    ...defaultViewContext,
    namespace,
    template: props.element ? context.template : null,
    proxies: spec,
    used: used.current,
    parent: context,
  };

  return (
    <ViewContext.Provider value={innerContext}>
      {props.element || context.template}
    </ViewContext.Provider>
  );
};

export const Hatch = (props) => {
  const context = React.useContext(ViewContext);
  const key = `${context.namespace}.${props.sock}`;
  const template = props.children; // single

  const proxies = findProxies(context, props.sock);

  const rendered = proxies
    ?.map((item) => renderProxy(item, template))
    .filter(Boolean);

  const nextContext = {
    ...defaultViewContext,
    hatch: props.sock,
    namespace: key,
    template: template.props.children,
    parent: context,
  };

  return (
    <ViewContext.Provider value={nextContext}>
      {rendered?.length === 1 ? rendered[0] : rendered || template}
    </ViewContext.Provider>
  );
};

export const Proxy = () => {
  throw new ProxyError("<Proxy> can only be used in <Render>");
};

function transformProxy(proxy, ns) {
  if (!React.isValidElement(proxy) || proxy.type !== Proxy) {
    throw new ProxyError(`${ns}: <Render> can only contain <Proxy>`);
  }

  const item = {
    ...proxy.props,
    sock: resolveSock(proxy.props.sock),
    key: proxy.key,
  };
  if (!item.sock) {
    throw new ProxyError(`${ns}: missing sock= on <Proxy>`);
  }

  const p = `<Proxy sock="${item.sock}">`;
  item.sock = relativeSock(item.sock, ns) || relativeSock(item.sock, "");
  if (!item.sock) {
    throw new ProxyError(`${p} is not valid in "${ns}" namespace`);
  }

  if (item.element && !React.isValidElement(item.element)) {
    throw new ProxyError(`element= on ${p} must be an element`);
  }

  if (item.text && typeof item.text !== "string") {
    throw new ProxyError(`text= on ${p} must be a string`);
  }

  item.content = item.children || item.element || item.text || null;

  if (item.merge && item.content && !React.isValidElement(item.content)) {
    throw new Error(`${p} merge mode requires a single child element`);
  }

  return item;
}

function findProxies(context, sock) {
  while (context) {
    if (context.proxies) {
      const proxies = context.proxies[sock];
      if (proxies) {
        if (context.used) {
          context.used[sock] = true;
        }
        return proxies;
      }
    }
    if (context.hatch) {
      sock = `${context.hatch}.${sock}`;
    }
    context = context.parent;
  }
  return null;
}

function renderProxy(item, template) {
  const proxy = item.content;

  if (item.replace) {
    // replace everything with the proxy
    return proxy;
  } else if (!item.merge) {
    // place proxy inside template element
    return (
      <template.type
        {...mergeProps(template.props, item.key ? { key: item.key } : null, {
          children: proxy,
        })}
      />
    );
  } else if (React.isValidElement(proxy)) {
    // merge proxy element with template element
    return (
      <proxy.type
        {...mergeProps(
          template.props,
          item.key ? { key: item.key } : null,
          proxy.props,
          proxy.key ? { key: proxy.key } : null,
          proxy.ref ? { ref: proxy.ref } : null
        )}
      />
    );
  } else {
    // merge null - return just the template
    return (
      <template.type
        {...mergeProps(template.props, item.key ? { key: item.key } : null)}
      />
    );
  }
}

const mergeProps = (...props) => {
  const out = props.reduce((prev, curr) => ({ ...prev, ...curr }), {});
  if (out.className) {
    out.className = props
      .map((curr) => curr?.className)
      .filter(Boolean)
      .join(" ");
  }
  return out;
};

export function defineSock(name, spec) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(spec)
        .map(([k, v]) => {
          const fn = `${name}.${k}`;
          return [k, v ? defineSock(fn, v) : fn];
        })
        .concat([["", name]])
    )
  );
}

export function resolveSock(sock) {
  return sock ? (typeof sock === "string" ? sock : sock[""]) : "";
}

function relativeSock(sock, ns) {
  return sock.startsWith(`${ns}.`) ? sock.slice(ns.length + 1) : "";
}
