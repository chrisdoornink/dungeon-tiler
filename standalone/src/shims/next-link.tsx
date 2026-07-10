import React from "react";

// Minimal next/link replacement: render a plain <a>. Drops Next-only routing props.
export default function Link(props: Record<string, unknown>) {
  const {
    href,
    children,
    prefetch,
    replace,
    scroll,
    shallow,
    passHref,
    legacyBehavior,
    ...rest
  } = props as {
    href: string | { pathname?: string };
    children?: React.ReactNode;
    [key: string]: unknown;
  };
  const resolved = typeof href === "string" ? href : href?.pathname || "#";
  return (
    <a href={resolved} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children}
    </a>
  );
}
