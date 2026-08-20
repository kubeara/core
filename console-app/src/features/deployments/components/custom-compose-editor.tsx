import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";

export type CustomComposeEditorTab = "compose" | "env";

type CustomComposeEditorProps = {
  composeYaml: string;
  envFileContent?: string;
  showEnvTab?: boolean;
  /** When true, show only the dotenv editor (no compose tab). */
  envOnly?: boolean;
  activeTab?: CustomComposeEditorTab;
  onComposeChange: (value: string) => void;
  onEnvChange?: (value: string) => void;
  onTabChange?: (tab: CustomComposeEditorTab) => void;
  disabled?: boolean;
  readOnly?: boolean;
  /** Monaco editor height. Defaults to 360px. Use 100% inside a sized flex parent. */
  height?: string | number;
  /** Optional filename shown above the editor with a subtle remove action. */
  fileLabel?: string;
  onRemoveFile?: () => void;
  removeFileLabel?: string;
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
  envFileContent = "",
  showEnvTab = true,
  envOnly = false,
  activeTab: activeTabProp,
  onComposeChange,
  onEnvChange,
  onTabChange,
  disabled = false,
  readOnly = false,
  height = "360px",
  fileLabel,
  onRemoveFile,
  removeFileLabel = "Delete",
}: CustomComposeEditorProps) {
  const [internalTab, setInternalTab] = useState<CustomComposeEditorTab>("compose");
  const activeTab = envOnly
    ? "env"
    : showEnvTab
      ? (activeTabProp ?? internalTab)
      : "compose";
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState(resolveMonacoTheme);
  const monacoConfiguredRef = useRef(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

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

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;

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

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.updateOptions({
      readOnly: disabled || readOnly,
      domReadOnly: disabled || readOnly,
      readOnlyMessage: { value: "" },
    });
  }, [disabled, readOnly]);

  const currentValue = activeTab === "compose" ? composeYaml : envFileContent;
  const currentLanguage = activeTab === "compose" ? "yaml" : "dotenv";
  const isLocked = disabled || readOnly;
  const showTabs = showEnvTab && !envOnly;

  function handleTabChange(tab: CustomComposeEditorTab) {
    if (onTabChange) {
      onTabChange(tab);
      return;
    }

    setInternalTab(tab);
  }

  return (
    <div
      className={`custom-compose-editor${isLocked ? " is-readonly" : ""}`}
    >
      {fileLabel || onRemoveFile ? (
        <div className="custom-compose-editor-filebar">
          {fileLabel ? (
            <p className="custom-compose-editor-filename">
              <strong>{fileLabel}</strong>
            </p>
          ) : (
            <span />
          )}
          {onRemoveFile ? (
            <button
              type="button"
              className="btn-danger-outline custom-compose-editor-delete"
              disabled={disabled}
              onClick={onRemoveFile}
            >
              {removeFileLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {showTabs ? (
        <div className="custom-compose-editor-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "compose"}
            className={`custom-compose-editor-tab${activeTab === "compose" ? " is-active" : ""}`}
            disabled={disabled}
            onClick={() => handleTabChange("compose")}
          >
            docker-compose.yml
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "env"}
            className={`custom-compose-editor-tab${activeTab === "env" ? " is-active" : ""}`}
            disabled={disabled}
            onClick={() => handleTabChange("env")}
          >
            .env
          </button>
        </div>
      ) : null}

      {editorError ? (
        <p className="deploy-form-error custom-compose-editor-error" role="alert">
          {editorError}
        </p>
      ) : null}

      <div className="custom-compose-editor-surface">
        <Editor
          height={height}
          language={currentLanguage}
          theme={editorTheme}
          value={currentValue}
          onChange={(value) => {
            if (isLocked) {
              return;
            }
            if (activeTab === "compose") {
              onComposeChange(value ?? "");
              return;
            }
            onEnvChange?.(value ?? "");
          }}
          onMount={handleEditorMount}
          options={{
            readOnly: isLocked,
            domReadOnly: isLocked,
            readOnlyMessage: { value: "" },
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
