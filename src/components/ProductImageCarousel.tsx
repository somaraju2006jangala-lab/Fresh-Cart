import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Product } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductImageCarouselProps {
  products: Product[];
}

export const ProductImageCarousel: React.FC<ProductImageCarouselProps> = ({ products }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);
  const [cardWidth, setCardWidth] = useState<number>(340);
  const [cardGap, setCardGap] = useState<number>(24);
  const [cardHeight, setCardHeight] = useState<number>(260);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(true);

  // Filter only products that have a valid image
  const validProducts = products.filter((p) => Boolean(p.image));
  const baseCount = validProducts.length;

  // Repeat products so that we have enough items for an infinite looping carousel
  const repeatCount = baseCount > 0 ? Math.max(3, Math.ceil(15 / baseCount)) : 0;
  const extendedItems = baseCount > 0
    ? Array.from({ length: repeatCount }, () => validProducts).flat()
    : [];

  // Start at the middle section
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    return baseCount > 0 ? baseCount * Math.floor(repeatCount / 2) : 0;
  });

  // Keep track of touch gestures for mobile swipe
  const touchStartX = useRef<number | null>(null);

  // Update layout dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
      const w = window.innerWidth;
      if (w < 640) {
        setCardWidth(220);
        setCardGap(16);
        setCardHeight(180);
      } else if (w < 1024) {
        setCardWidth(280);
        setCardGap(20);
        setCardHeight(230);
      } else {
        setCardWidth(340);
        setCardGap(24);
        setCardHeight(260);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Update currentIndex if baseCount changes
  useEffect(() => {
    if (baseCount > 0) {
      setCurrentIndex((prev) => {
        const currentMod = prev % baseCount;
        return baseCount * Math.floor(repeatCount / 2) + currentMod;
      });
    }
  }, [baseCount, repeatCount]);

  // Re-enable CSS transitions if disabled during normalization
  useEffect(() => {
    if (!isTransitioning) {
      const frame = requestAnimationFrame(() => {
        setIsTransitioning(true);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isTransitioning]);

  const handleNext = useCallback(() => {
    if (baseCount <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  }, [baseCount]);

  const handlePrev = useCallback(() => {
    if (baseCount <= 1) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  }, [baseCount]);

  // Seamless loop normalization when reaching extended boundaries
  const handleTransitionEnd = () => {
    if (baseCount <= 1) return;
    const minThreshold = baseCount;
    const maxThreshold = baseCount * (repeatCount - 1);

    if (currentIndex >= maxThreshold) {
      setIsTransitioning(false);
      const normalized = minThreshold + (currentIndex % baseCount);
      setCurrentIndex(normalized);
    } else if (currentIndex < minThreshold) {
      setIsTransitioning(false);
      const normalized = maxThreshold - baseCount + (currentIndex % baseCount);
      setCurrentIndex(normalized);
    }
  };

  // Auto-scroll through images like an album
  useEffect(() => {
    if (isPaused || baseCount <= 1) return;

    // Check prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) return;

    const timer = setInterval(() => {
      handleNext();
    }, 3600);

    return () => clearInterval(timer);
  }, [isPaused, baseCount, handleNext]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsPaused(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPaused(false);
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 45) {
      handlePrev();
    } else if (diff < -45) {
      handleNext();
    }
    touchStartX.current = null;
  };

  if (baseCount === 0) {
    return null;
  }

  // Calculate track translation so that extendedItems[currentIndex] is exactly in the center
  const step = cardWidth + cardGap;
  const targetX = containerWidth / 2 - (currentIndex * step + cardWidth / 2);

  return (
    <section
      aria-label="FreshCart Featured Product Gallery"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-3"
    >
      <div
        ref={containerRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full rounded-3xl bg-transparent border border-emerald-500/20 shadow-[0_16px_45px_rgba(0,0,0,0.25)] py-6 sm:py-8 overflow-hidden select-none"
      >
        {/* Ambient emerald backlight in the container */}
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-40 bg-emerald-500/15 blur-3xl pointer-events-none rounded-full"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-96 h-40 bg-emerald-600/15 blur-3xl pointer-events-none rounded-full"
          aria-hidden="true"
        />

        {/* Left Navigation Arrow */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous product image"
          title="Previous product image"
          className="absolute left-2.5 sm:left-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-black/55 hover:bg-black/85 text-white hover:text-[#00e676] border border-white/20 hover:border-emerald-400/60 backdrop-blur-md shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer group focus:outline-hidden focus:ring-2 focus:ring-[#00e676]"
        >
          <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:-translate-x-0.5" />
        </button>

        {/* Right Navigation Arrow */}
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next product image"
          title="Next product image"
          className="absolute right-2.5 sm:right-5 top-1/2 -translate-y-1/2 z-30 p-2 sm:p-3 rounded-full bg-black/55 hover:bg-black/85 text-white hover:text-[#00e676] border border-white/20 hover:border-emerald-400/60 backdrop-blur-md shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer group focus:outline-hidden focus:ring-2 focus:ring-[#00e676]"
        >
          <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:translate-x-0.5" />
        </button>

        {/* Carousel Moving Track */}
        <div
          className="flex items-center"
          style={{
            transform: `translate3d(${targetX}px, 0, 0)`,
            transition: isTransitioning
              ? 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {extendedItems.map((item, idx) => {
            const isActive = idx === currentIndex;
            return (
              <div
                key={`${item.id}-${idx}`}
                onClick={() => {
                  if (idx !== currentIndex) {
                    setIsTransitioning(true);
                    setCurrentIndex(idx);
                  }
                }}
                style={{
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`,
                  marginRight: `${cardGap}px`,
                  flexShrink: 0,
                }}
                className={`relative rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 ease-out group ${
                  isActive
                    ? 'scale-105 sm:scale-110 z-20 opacity-100 shadow-[0_0_35px_rgba(16,185,129,0.5),0_15px_35px_rgba(0,0,0,0.65)] ring-2 ring-[#00e676] border-2 border-emerald-400/70'
                    : 'scale-95 z-10 opacity-60 hover:opacity-90 shadow-lg border border-white/15 hover:border-emerald-400/40'
                }`}
              >
                {/* Pure Product Image Only — No text, no price, no labels, no badges, no buttons */}
                <div className="relative w-full h-full bg-transparent">
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover object-center select-none pointer-events-none transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  {/* Subtle photo-gallery vignette filter */}
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10 pointer-events-none"
                    aria-hidden="true"
                  />
                  {/* Active card emerald subtle glow sheen */}
                  {isActive && (
                    <div
                      className="absolute inset-0 bg-emerald-500/10 pointer-events-none ring-1 ring-inset ring-[#00e676]/40"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
