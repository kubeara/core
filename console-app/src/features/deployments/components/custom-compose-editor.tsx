import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type CustomComposeEditorTab = "compose" | "env";

type CustomComposeEditorProps = {
  composeYaml: string;
  envFileContent: string;
  activeTab: CustomComposeEditorTab;
  onComposeChange: (value: string) => void;
  onEnvChange: (value: string) => void;
  onTabChange: (tab: CustomComposeEditorTab) => void;
  disabled?: boolean;
};

function resolveMonacoTheme(): "vs" | "vs-dark" {
  if (typeof document === "undefined") {
    return "vs";
  }

  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "vs-dark"
    : "vs";
}

/**
 * Lightweight Monaco editor with compose and .env tabs.
 */
export function CustomComposeEditor({
  composeYaml,
  envFileContent,
  activeTab,
  onComposeChange,
  onEnvChange,
  onTabChange,
  disabled = false,
}: CustomComposeEditorProps) {
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState(resolveMonacoTheme);
  const monacoConfiguredRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setEditorTheme(resolveMonacoTheme());
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const handleEditorMount = useCallback<OnMount>((_, monaco) => {
    if (monacoConfiguredRef.current) {
      return;
    }

    try {
      monaco.languages.register({ id: "dotenv" });
      monaco.languages.setMonarchTokensProvider("dotenv", {
        tokenizer: {
          root: [
            [/^\s*#.*$/, "comment"],
            [/^[A-Za-z_][A-Za-z0-9_]*/, "key"],
            [/=.*/, "string"],
          ],
        },
      });
      monacoConfiguredRef.current = true;
    } catch (error) {
      setEditorError(
        error instanceof Error
          ? error.message
          : "Failed to initialize code editor",
      );
    }
  }, []);

  const currentValue = activeTab === "compose" ? composeYaml : envFileContent;
  const currentLanguage = activeTab === "compose" ? "yaml" : "dotenv";

  return (
    <div className="custom-compose-editor">
      <div className="custom-compose-editor-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "compose"}
          className={`custom-compose-editor-tab${activeTab === "compose" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onTabChange("compose")}
        >
          docker-compose.yml
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "env"}
          className={`custom-compose-editor-tab${activeTab === "env" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onTabChange("env")}
        >
          .env
        </button>
      </div>

      {editorError ? (
        <p className="deploy-form-error custom-compose-editor-error" role="alert">
          {editorError}
        </p>
      ) : null}

      <div className="custom-compose-editor-surface">
        <Editor
          height="360px"
          language={currentLanguage}
          theme={editorTheme}
          value={currentValue}
          onChange={(value) => {
            if (activeTab === "compose") {
              onComposeChange(value ?? "");
              return;
            }
            onEnvChange(value ?? "");
          }}
          onMount={handleEditorMount}
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            renderValidationDecorations: "on",
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </div>
  );
}
