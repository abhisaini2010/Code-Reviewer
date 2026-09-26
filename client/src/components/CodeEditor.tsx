import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

interface CodeEditorProps {
  code: string;
  language: string;
  onChange: (value: string) => void;
  highlightLine?: number | null;
}

function CodeEditor({
  code,
  language,
  onChange,
  highlightLine,
}: CodeEditorProps) {
  const editorRef =
    useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const monacoRef =
    useRef<typeof Monaco | null>(null);

  const decorationsRef = useRef<string[]>([]);

  const applyLineHighlight = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (!editor || !monaco) {
      return;
    }

    // Remove previous decoration
    decorationsRef.current =
      editor.deltaDecorations(
        decorationsRef.current,
        []
      );

    if (
      highlightLine === null ||
      highlightLine === undefined
    ) {
      return;
    }

    const model = editor.getModel();

    if (!model) {
      return;
    }

    const lineCount = model.getLineCount();

    if (
      highlightLine < 1 ||
      highlightLine > lineCount
    ) {
      return;
    }

    // Add visual highlight
    decorationsRef.current =
      editor.deltaDecorations(
        decorationsRef.current,
        [
          {
            range: new monaco.Range(
              highlightLine,
              1,
              highlightLine,
              model.getLineMaxColumn(highlightLine)
            ),
            options: {
              isWholeLine: true,
              className:
                "ai-code-reviewer-highlight-line",
              linesDecorationsClassName:
                "ai-code-reviewer-line-marker",
            },
          },
        ]
      );

   // Move the cursor to the selected line
editor.setPosition({
  lineNumber: highlightLine,
  column: 1,
});

// Scroll the selected line into the center of the editor
editor.revealPositionInCenter({
  lineNumber: highlightLine,
  column: 1,
});

// Focus the editor
editor.focus();
  };

  const handleEditorMount: OnMount = (
    editor,
    monaco
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Apply highlight after Monaco mounts
    setTimeout(() => {
      applyLineHighlight();
    }, 0);
  };

  useEffect(() => {
    applyLineHighlight();
  }, [highlightLine, code]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-300">
      <Editor
        height="500px"
        language={language}
        value={code}
        onChange={(value) =>
          onChange(value ?? "")
        }
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: {
            enabled: true,
          },
          fontSize: 14,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: {
            top: 16,
          },
        }}
      />
    </div>
  );
}

export default CodeEditor;