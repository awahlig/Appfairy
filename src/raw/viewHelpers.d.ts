import React from "react";

export class ProxyError extends Error {}

/**
 * Type for a specification of a sock tree.
 * Leaves are always null.
 * ```
 * { form:
 *   { first: null,
 *     submit: null }
 * }
 * ```
 */
export type SockSpec = { [name: string]: SockSpec | null };

/**
 * Type for a sock tree, based on a sock tree spec.
 */
export type Sock<P extends string = "", T extends SockSpec = {}> = { "": P } & {
  readonly [K in keyof T]: SockValue<`${P}.${K}`, T[K]>;
};

type SockValue<P extends string, T> = T extends SockSpec ? Sock<P, T> : P;
export type AnySock = string | { "": string };

/**
 * Builds a sock tree from a sock tree spec.
 */
export function defineSock<P extends string, T extends SockSpec>(
  name: P,
  spec: T
): Sock<P, T>;

export function resolveSock(sock: AnySock): string;

/**
 * Renders the template in a view or a parent proxy.
 * Gives access to sockets using `<Proxy>`-children.
 *
 * Example:
 * ```
 * <MyView>
 *   <Render> // render the view, look for sockets
 *     <Proxy sock={sock.navbar}> // handle navbar socket
 *       <Render> // render navbar, look for nested sockets
 *         <Proxy sock={sock.navbar.home}>
 *           ...
 * ```
 *
 * The optional namespace prop sets a new namespace for the socks.
 * Use it when working with sock trees created using defineSock().
 *
 * If element prop is provided, the element will be rendered
 * instead of the template. This allows Render to be used to
 * add proxies without consuming the template.
 */
export const Render: React.FC<
  React.PropsWithChildren<{ namespace?: AnySock; element?: React.ReactElement }>
>;

/**
 * Use directly inside `<Render>` to access a socket.
 *
 * `<Proxy sock={}>...</Proxy>`
 * - Overrides the content of the socket element.
 *
 * `<Proxy sock={} replace>...</Proxy>`
 * - Overrides the entire socket element and its content.
 *
 * `<Proxy sock={} merge><div>...</div></Proxy>`
 * - Merges the socket element with the <div>.
 * - Merging means overriding the type, individual attributes
 *   and/or content.
 *
 * `<Proxy sock={} element={<div/>} />`
 * - Same as `<Proxy sock={}><div/></Proxy>`
 *
 * `<Proxy sock={} text="text" />`
 * - Same as `<Proxy sock={}>text</Proxy>`
 *
 * Use multiple times to duplicate the socket as siblings to populate
 * lists.
 *
 * If no proxy is provided f socket, the socket element is
 * rendered unmodified.
 */
export const Proxy: React.FC<
  React.PropsWithChildren<{
    sock: AnySock;
    merge?: boolean;
    replace?: boolean;
    element?: React.ReactElement;
    text?: string;
  }>
>;
