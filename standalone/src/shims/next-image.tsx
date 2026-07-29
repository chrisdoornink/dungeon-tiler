import React from "react";

// Minimal next/image replacement: render a plain <img>, drop Next-only props.
// Faithful enough for the HUD components (HealthDisplay, EnemyHealthDisplay,
// HeartPopAnimation, ItemPickupAnimation) which use src/alt/width/height/className/style.
export default function Image(props: Record<string, unknown>) {
  const {
    src,
    alt = "",
    width,
    height,
    fill,
    className,
    style,
    // Next-only props we intentionally drop:
    priority,
    quality,
    sizes,
    unoptimized,
    placeholder,
    blurDataURL,
    loader,
    loading,
    fetchPriority,
    onLoadingComplete,
    ...rest
  } = props as {
    src: string | { src: string };
    alt?: string;
    width?: number | string;
    height?: number | string;
    fill?: boolean;
    className?: string;
    style?: React.CSSProperties;
    [key: string]: unknown;
  };

  const resolvedSrc = typeof src === "string" ? src : src?.src;
  const fillStyle: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...(style || {}) }
    : style || {};

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : (width as number | string | undefined)}
      height={fill ? undefined : (height as number | string | undefined)}
      className={className}
      style={fillStyle}
      {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
    />
  );
}
