"use client";

import {
  type ChangeEvent,
  forwardRef,
  type TextareaHTMLAttributes,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import { cn } from "@/lib/cn";

import { controlClassName } from "./input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grow with the content (default). Set to `false` for a fixed height. */
  autoResize?: boolean;
}

function fitToContent(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

/**
 * Multi-line text field for notes. Grows automatically with its content so the
 * whole note stays visible on a tablet, without an inner scrollbar.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoResize = true, rows = 3, onChange, value, defaultValue, ...props },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  useLayoutEffect(() => {
    if (autoResize && innerRef.current) {
      fitToContent(innerRef.current);
    }
  }, [autoResize, value]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        fitToContent(event.currentTarget);
      }
      onChange?.(event);
    },
    [autoResize, onChange],
  );

  return (
    <textarea
      ref={innerRef}
      rows={rows}
      value={value}
      defaultValue={defaultValue}
      onChange={handleChange}
      className={cn(
        controlClassName,
        "min-h-11 resize-none py-2.5 leading-6",
        !autoResize && "resize-y",
        className,
      )}
      {...props}
    />
  );
});
