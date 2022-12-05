import React from 'react'
import { loadScripts } from '../scripts/helpers'

class ProxyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ProxyError'
  }
}

export class View extends React.Component {
  componentDidMount() {
    const scripts = this.constructor.scripts
    if (scripts) {
      loadScripts(scripts).then(ix2init)
    }
  }

  componentDidUpdate() {
    ix2init()
  }
}

export const ix2init = () => {
  if (ix2init.busy) return
  ix2init.busy = true

  // eslint-disable-next-line no-undef
  window?.Webflow?.require('ix2').init()
  // eslint-disable-next-line no-undef
  document.dispatchEvent(new CustomEvent('IX2_PAGE_UPDATE'))

  Promise.resolve().then(() => {
    ix2init.busy = false
  })
}

const transformProxies = (children = []) => {
  children = [].concat(children).filter(Boolean)

  const proxies = {}

  React.Children.forEach(children, (child) => {
    const { 'af-sock': sock, ...props } = child.props

    const name = (sock || '').trim().replace(/_/g, '-')
    if (!name) {
      const tag = child.type.name || child.type
      throw new ProxyError(`: missing af-sock= on <${tag}>`)
    }

    Object.defineProperties(props, {
      _name: { value: name, writable: false },
      _type: { value: child.type, writable: false },
      _used: { value: false, writable: true },
    })

    if (child.key != null) {
      props.key = child.key
    }

    if (child.ref != null) {
      props.ref = child.ref
    }

    if (!proxies[name]) {
      proxies[name] = props
    }
    else if (!(proxies[name] instanceof Array)) {
      proxies[name] = [proxies[name], props]
    }
    else {
      proxies[name].push(props)
    }
  })

  return proxies
}

export const createScope = (children, callback) => {
  const proxies = transformProxies(children)

  const result = callback((name, repeat, callback) => {
    const props = proxies[name]

    const call = (props) => {
      try {
        return callback(props, props._type)
      } catch (err) {
        if (err instanceof ProxyError) {
          // reconstruct namespace for proxy errors
          throw new ProxyError(`${name}.${err.message}`)
        }
        throw err
      }
    }

    // no proxy
    if (!props) {
      if (repeat === '!') {
        throw new ProxyError(`${name}: required proxy not found`)
      }
      if (/^[?*]$/.test(repeat)) return null
      return call({})
    }

    // mark proxy as recognised
    ((props instanceof Array) ? props : [props])[0]._used = true

    // single proxy
    if (!(props instanceof Array)) return call(props)
    // 2 or more proxies
    if (/^[+*]$/.test(repeat)) return props.map(call)

    throw new ProxyError(`${name}: too many proxies (${props.length})`)
  })

  // check for unrecognised proxies
  Object.entries(proxies).forEach(([name, props]) => {
    if (!((props instanceof Array) ? props : [props])[0]._used) {
      throw new ProxyError(`${name}: unrecognised proxy`)
    }
  })

  return result
}
