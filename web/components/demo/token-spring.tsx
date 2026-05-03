"use client";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { SealStamp } from "@/components/ui/seal-stamp";

type Props = {
  tokens: string[];
  approved: boolean;
  citationSlots?: Record<number, ReactNode>;
  label?: string;
  className?: string;
  stagger?: number;
  direction?: "inline" | "block";
};

const DEFAULT_STAGGER_MS = 32;
const SETTLE_MS = 320;

export function TokenSpring({
  tokens,
  approved,
  citationSlots,
  label,
  className,
  stagger = DEFAULT_STAGGER_MS,
  direction = "inline",
}: Props) {
  const reduced = useReducedMotion();
  const [settled, setSettled] = useState(reduced ?? false);

  useEffect(() => {
    if (reduced) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const total = tokens.length * stagger + SETTLE_MS;
    const t = window.setTimeout(() => setSettled(true), total);
    return () => window.clearTimeout(t);
  }, [tokens, reduced, stagger]);

  const showStamp = approved && settled;
  const wrapperDisplay = direction === "block" ? "block" : "inline-block";

  return (
    <div
      className={"token-spring" + (className ? ` ${className}` : "")}
      style={{ position: "relative" }}
    >
      {tokens.map((tok, i) => {
        const slot = citationSlots?.[i];
        const initial = reduced
          ? { y: 0, opacity: 1 }
          : { y: 12, opacity: 0 };
        const animate = { y: 0, opacity: 1 };
        const transition: Transition = reduced
          ? { duration: 0 }
          : {
              delay: (i * stagger) / 1000,
              type: "spring",
              stiffness: 140,
              damping: 22,
            };

        if (slot !== undefined) {
          return (
            <motion.span
              key={i}
              data-token-index={i}
              data-token-slot="cite"
              className="token-spring-slot"
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ display: wrapperDisplay }}
            >
              {slot}
            </motion.span>
          );
        }

        if (tok === "") return null;
        if (tok === "\n") {
          return <br key={i} aria-hidden="true" />;
        }

        return (
          <motion.span
            key={i}
            data-token-index={i}
            className="token-spring-tok"
            initial={initial}
            animate={animate}
            transition={transition}
            style={{
              display: direction === "block" ? "block" : "inline-block",
              whiteSpace: "pre-wrap",
            }}
          >
            {tok}
          </motion.span>
        );
      })}

      {showStamp ? (
        <span
          className="token-spring-stamp"
          style={{
            position: "absolute",
            right: 12,
            bottom: -4,
            pointerEvents: "auto",
          }}
        >
          <SealStamp state="verified" label={label ?? "memo grounded"} />
        </span>
      ) : null}
    </div>
  );
}
