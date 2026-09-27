"use client";

import { useState } from "react";
import Image from "next/image";

const PLACEHOLDER_CLASSNAME = "aspect-square w-full rounded bg-gray-100";
const IMAGE_CLASSNAME = "aspect-square w-full rounded object-cover";

// Fixed square photo for a catalog card or product page. Falls back to a
// neutral placeholder box when there's no src to show at all, or when the
// image itself fails to load (a bad/stale URL, network hiccup, etc.) — the
// page must never break just because a photo is missing.
export function ProductImage({ src, alt }: { src: string | null; alt: string }) {
  // Remembers WHICH src last failed to load, rather than a plain boolean —
  // so a new src (e.g. swapping colour) gets a fresh chance to load instead
  // of staying stuck on a previous src's error state. This is a plain
  // derived comparison, so no effect is needed to "reset" anything when src
  // changes.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);
  const errored = src !== null && src === erroredSrc;

  if (!src || errored) {
    return <div data-testid="image-placeholder" className={PLACEHOLDER_CLASSNAME} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={400}
      height={400}
      className={IMAGE_CLASSNAME}
      onError={() => setErroredSrc(src)}
    />
  );
}
