import { useCallback, useEffect, useState } from "react";

const TERMINAL_WORD_WRAP_STORAGE_KEY = "kubeara-terminal-word-wrap";

function readStoredWordWrap(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const stored = localStorage.getItem(TERMINAL_WORD_WRAP_STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // localStorage may be unavailable.
  }

  return true;
}

export function useTerminalWordWrap() {
  const [wordWrap, setWordWrapState] = useState(readStoredWordWrap);

  useEffect(() => {
    try {
      localStorage.setItem(TERMINAL_WORD_WRAP_STORAGE_KEY, String(wordWrap));
    } catch {
      // localStorage may be unavailable or full.
    }
  }, [wordWrap]);

  const toggleWordWrap = useCallback(() => {
    setWordWrapState((current) => !current);
  }, []);

  return { wordWrap, toggleWordWrap, setWordWrap: setWordWrapState };
}
