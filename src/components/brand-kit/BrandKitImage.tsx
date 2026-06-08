"use client";

import { useState, useEffect } from "react";

/**
 * BrandKitImage Component
 *
 * Renders brand kit images (icons, banners, screenshots) with intelligent
 * loading states and error handling.
 *
 * Features:
 * - Skeleton loader while image loads
 * - "Generating..." placeholder when no src provided
 * - Error state with helpful message
 * - Responsive sizing
 * - Native Image optimization (if using Next.js Image)
 *
 * Usage:
 * <BrandKitImage src={url} alt="App Icon" width={64} height={64} />
 */

interface BrandKitImageProps {
  src?: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  showSkeleton?: boolean;
  priority?: boolean;
  onLoadComplete?: () => void;
  onError?: () => void;
}

export function BrandKitImage({
  src,
  alt,
  width = 300,
  height = 400,
  className = "",
  showSkeleton = true,
  priority = false,
  onLoadComplete,
  onError: onErrorCallback,
}: BrandKitImageProps) {
  const [isLoading, setIsLoading] = useState(!!src);
  const [hasError, setHasError] = useState(false);

  // Reset loading state when src changes
  useEffect(() => {
    if (src) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [src]);

  // ── Render: No image source provided ──────────────────────────────────
  if (!src) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 ${className}`}
        style={{ width: width ? `${width}px` : "100%", height: `${height}px` }}
      >
        <div className="text-center space-y-2">
          <div className="animate-pulse">
            <div className="inline-block px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <span className="text-xs font-medium text-blue-400">
                Generating...
              </span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-600">Asset unavailable</p>
        </div>
      </div>
    );
  }

  // ── Render: Loading skeleton ─────────────────────────────────────────
  if (isLoading && showSkeleton) {
    return (
      <div
        className={`animate-pulse bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 rounded-lg ${className}`}
        style={{ width: width ? `${width}px` : "100%", height: `${height}px` }}
        role="status"
        aria-label="Loading image"
      />
    );
  }

  // ── Render: Error state ──────────────────────────────────────────────
  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-red-500/10 border border-red-500/30 rounded-lg ${className}`}
        style={{ width: width ? `${width}px` : "100%", height: `${height}px` }}
      >
        <span className="text-[10px] text-red-400 text-center px-2">
          Failed to load image
        </span>
      </div>
    );
  }

  // ── Render: Image loaded successfully ────────────────────────────────
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      onLoadingComplete={() => {
        setIsLoading(false);
        onLoadComplete?.();
      }}
      onError={() => {
        setIsLoading(false);
        setHasError(true);
        onErrorCallback?.();
      }}
      className={`rounded-lg object-cover ${className}`}
      style={{ width: width ? `${width}px` : "100%", height: `${height}px` }}
    />
  );
}

/**
 * BrandKitImageGrid Component
 *
 * Display multiple images in a grid layout with consistent styling
 *
 * Usage:
 * <BrandKitImageGrid images={urls} columns={2} alt="Screenshots" />
 */

interface BrandKitImageGridProps {
  images: string[];
  columns?: 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  imageHeight?: number;
  alt?: string;
}

export function BrandKitImageGrid({
  images,
  columns = 2,
  gap = "md",
  imageHeight = 200,
  alt = "Image",
}: BrandKitImageGridProps) {
  const gridClass = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  }[columns];

  const gapClass = {
    sm: "gap-2",
    md: "gap-3",
    lg: "gap-4",
  }[gap];

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50">
        <span className="text-sm text-zinc-500">No images available</span>
      </div>
    );
  }

  return (
    <div className={`grid ${gridClass} ${gapClass}`}>
      {images.map((url, idx) => (
        <BrandKitImage
          key={`${url}-${idx}`}
          src={url}
          alt={`${alt} ${idx + 1}`}
          height={imageHeight}
          className="w-full"
        />
      ))}
    </div>
  );
}

/**
 * BrandKitImageCarousel Component
 *
 * Display images in a carousel/slideshow format
 *
 * Usage:
 * <BrandKitImageCarousel images={urls} />
 */

interface BrandKitImageCarouselProps {
  images: string[];
  height?: number;
  showIndicators?: boolean;
  autoPlay?: boolean;
  autoPlayDelay?: number;
  alt?: string;
}

export function BrandKitImageCarousel({
  images,
  height = 400,
  showIndicators = true,
  autoPlay = false,
  autoPlayDelay = 3000,
  alt = "Image",
}: BrandKitImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-play effect
  useEffect(() => {
    if (!autoPlay || images.length === 0) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, autoPlayDelay);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayDelay, images.length]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800" style={{ height }}>
        <span className="text-sm text-zinc-500">No images available</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative rounded-lg overflow-hidden bg-black">
        <BrandKitImage
          src={images[currentIndex]}
          alt={`${alt} ${currentIndex + 1}`}
          height={height}
          className="w-full"
        />

        {/* Navigation arrows (if multiple images) */}
        {images.length > 1 && (
          <>
            <button
              onClick={() =>
                setCurrentIndex(
                  (prev) => (prev - 1 + images.length) % images.length
                )
              }
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition"
              aria-label="Previous image"
            >
              ←
            </button>
            <button
              onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition"
              aria-label="Next image"
            >
              →
            </button>
          </>
        )}
      </div>

      {/* Indicators */}
      {showIndicators && images.length > 1 && (
        <div className="flex justify-center gap-1">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition ${
                idx === currentIndex
                  ? "bg-blue-500 w-8"
                  : "bg-zinc-600 w-2 hover:bg-zinc-500"
              }`}
              aria-label={`Go to image ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
