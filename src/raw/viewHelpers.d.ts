import React from "react";

export class RenderError extends Error {}

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
 * Renders the template in a view or a plug.
 * Gives access to sockets using `<Plug|Swap|Proxy>`-children.
 *
 * Example:
 * ```
 * <MyView>
 *   <Render> // render the view, look for sockets
 *     <Plug sock={sock.navbar}> // handle navbar socket
 *       <Render> // render navbar, look for nested sockets
 *         <Proxy sock={sock.navbar.home}>
 *           ...
 * ```
 *
 * The optional namespace prop sets a new namespace for the socks.
 * Use it when working with sock trees created using defineSock().
 *
 * When element prop is set, the provided element will be rendered
 * instead of the template. This allows Render to be used to
 * add plugs without consuming the template.
 *
 * If no plug is provided for a socket, the socket element is
 * rendered unchanged.
 *
 * If multiple plugs are provided for a socket, the socket element
 * is rendered multiple times as siblings.
 */
export const Render: React.FC<
  React.PropsWithChildren<{ namespace?: AnySock; element?: React.ReactElement }>
>;

/**
 * Sets the content of a socket element.
 *
 * Use with no content to empty the socket element.
 *
 * `<Plug sock={} />`
 * `<Plug sock={}>...</Plug>`
 * `<Plug sock={} element={<div />} />`
 * `<Plug sock={} text="abc123" />`
 *
 * Only use inside `<Render>`.
 */
export const Plug: React.FC<
  React.PropsWithChildren<{
    sock: AnySock;
    element?: React.ReactElement;
    text?: string | number;
  }>
>;

/**
 * Replaces the entire socket element with the provied content.
 *
 * Use with no content to remove the socket element entirely.
 *
 * `<Swap sock={} />`
 * `<Swap sock={}>...</Swap>`
 * `<Swap sock={} element={<div />} />`
 * `<Swap sock={} text="abc123" />`
 *
 * Only use inside `<Render>`.
 */
export const Swap: React.FC<
  React.PropsWithChildren<{
    sock: AnySock;
    element?: React.ReactElement;
    text?: string | number;
  }>
>;

/**
 * Merges the socket element with the provided proxy.
 *
 * Merging means overriding the type of the socket element,
 * adding/overriding its attributes and/or content.
 *
 * Empty proxy is allowed but has no function.
 *
 * `<Proxy sock={} />`
 * `<Proxy sock={}><div /></Proxy>`
 * `<Proxy sock={} element={<div />} />`
 *
 * Only use inside `<Render>`.
 */
export const Proxy: React.FC<
  React.PropsWithChildren<{
    sock: AnySock;
    element?: React.ReactElement;
  }>
>;
