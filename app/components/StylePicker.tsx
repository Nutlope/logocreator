"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Shuffle } from "lucide-react";
import * as RadioGroup from "@radix-ui/react-radio-group";

type Style = { name: string; frames: string[] };

export const SURPRISE_STYLE = "Surprise";

export default function StylePicker({
  styles,
  value,
  onChange,
}: {
  styles: Style[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onChange}
      // Phones get a swipeable single row (a tall 3x3 grid pushed the generate
      // button and the gallery far below the fold); md+ keeps the full grid.
      // scroll-pl-5 keeps the first tile's snap point at the padded content
      // edge; without it the initial snap drags the row flush to the screen.
      // The scroll-fade-x mask is a cue for the phone carousel; on the md+ grid
      // it would fade the whole third column, so it's cancelled there.
      className="scroll-fade-x -mx-5 -mt-1 flex snap-x scroll-pl-5 gap-2.5 overflow-x-auto overscroll-x-contain px-5 pb-1.5 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mx-0 md:mt-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 md:pt-0 md:[mask-image:none] md:[-webkit-mask-image:none] [&::-webkit-scrollbar]:hidden"
    >
      {styles.map((style) => (
        <StyleTile key={style.name} style={style} />
      ))}
      {/* "Surprise me": let the AI pick the style. */}
      <SurpriseTile />
    </RadioGroup.Root>
  );
}

function StyleTile({ style }: { style: Style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <RadioGroup.Item
      value={style.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group w-24 shrink-0 snap-start rounded-xl outline-none md:w-auto"
    >
      <span className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-background px-2 py-3.5 transition-all duration-150 group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card group-data-[state=checked]:border-primary group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-primary/20">
        <CyclingThumb frames={style.frames} active={hovered} />
        <span className="text-xs font-medium text-muted-foreground transition-colors group-data-[state=checked]:text-foreground">
          {style.name}
        </span>
      </span>
    </RadioGroup.Item>
  );
}

function SurpriseTile() {
  return (
    <RadioGroup.Item
      value={SURPRISE_STYLE}
      className="group w-24 shrink-0 snap-start rounded-xl outline-none md:w-auto"
    >
      <span className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-border bg-background px-2 py-3.5 transition-all duration-150 group-hover:border-foreground/30 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card group-data-[state=checked]:border-solid group-data-[state=checked]:border-primary group-data-[state=checked]:ring-2 group-data-[state=checked]:ring-primary/20">
        <span className="flex size-[3.25rem] items-center justify-center">
          <Shuffle
            strokeWidth={1.75}
            className="size-7 text-muted-foreground transition-colors group-data-[state=checked]:text-primary"
          />
        </span>
        <span className="text-xs font-medium text-muted-foreground transition-colors group-data-[state=checked]:text-foreground">
          Surprise me
        </span>
      </span>
    </RadioGroup.Item>
  );
}

/**
 * Crossfades through a style's frames while hovered: a smooth opacity + scale +
 * blur dissolve. Frame 0 is the resting image.
 */
function CyclingThumb({
  frames,
  active,
}: {
  frames: string[];
  active: boolean;
}) {
  const [i, setI] = useState(0);
  // The 4 hover frames only mount after the first hover: at rest the panel
  // loads 8 thumbnails instead of 40 (the styles dir is heavy).
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (active) setArmed(true);
  }, [active]);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!active || frames.length < 2 || reduce) {
      setI(0);
      return;
    }
    // Kick the first change almost immediately so the effect reads on hover,
    // then settle into a calmer cadence.
    const first = setTimeout(() => setI(1), 220);
    const id = setInterval(() => setI((p) => (p + 1) % frames.length), 820);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, frames.length]);

  const idx = active ? i : 0;
  const transition = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };
  const shown = armed ? frames : frames.slice(0, 1);

  return (
    <span className="relative block size-[3.25rem]">
      {shown.map((src, k) => (
        <motion.span
          key={src}
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: k === idx ? 1 : 0,
            scale: k === idx ? 1 : 1.1,
            filter: k === idx ? "blur(0px)" : "blur(4px)",
          }}
          transition={transition}
        >
          <Image
            src={src}
            alt=""
            aria-hidden
            width={88}
            height={88}
            className="size-full rounded-xl object-contain"
            draggable={false}
          />
        </motion.span>
      ))}
    </span>
  );
}
