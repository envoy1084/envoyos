"use client";

import { useEffect, useState } from "react";

import { ActionSwapText } from "./action-swap";

export interface TextCascadeProps {
  items: string[];
  intervalMs?: number;
  className?: string;
}

export function TextCascade({
  items,
  intervalMs = 5000,
  className,
}: TextCascadeProps) {
  const validItems = items.filter((item) => item.trim().length > 0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex((currentIndex) =>
      validItems.length === 0
        ? 0
        : Math.min(currentIndex, validItems.length - 1),
    );
  }, [validItems.length]);

  useEffect(() => {
    if (validItems.length <= 1 || intervalMs <= 0) return;

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % validItems.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, validItems.length]);

  const active = validItems[activeIndex] ?? validItems[0];

  if (!active) return null;

  return (
    <ActionSwapText value={active} animation="cascade" className={className}>
      {active}
    </ActionSwapText>
  );
}
