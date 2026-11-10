"use client";

import { useCallback, useEffect, useState } from "react";

/** Key of the « gaucher » option, kept per device (step 12 b). */
export const LEFT_HANDED_KEY = "ronde.leftHanded";
const EVENT = "ronde:handedness";

function read(): boolean {
  try {
    return window.localStorage.getItem(LEFT_HANDED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The « gaucher » option of this device: the main controls of the plan screen move to the
 * left (bottom third, thumb side). Set from the account menu, read by the plan screen.
 */
export function useHandedness(): [boolean, (leftHanded: boolean) => void] {
  const [leftHanded, setLeftHanded] = useState(false);
  useEffect(() => {
    setLeftHanded(read());
    const sync = () => setLeftHanded(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(LEFT_HANDED_KEY, value ? "1" : "0");
    } catch {
      // Storage blocked: the option lasts as long as the page.
    }
    setLeftHanded(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [leftHanded, update];
}
