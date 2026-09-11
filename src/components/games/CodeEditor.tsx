'use client'

// ═══════════════════════════════════════════════════════════════════════════
// CodeEditor — Syntax-highlighted code editor using CodeMirror 6
// Supports Python, JavaScript, C++, Java with Tokyo Night dark theme
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night'

const LANG_EXTENSIONS: Record<string, () => any> = {
  python: () => python(),
  javascript: () => javascript(),
  cpp: () => cpp(),
  java: () => java(),
}

export default function CodeEditor({
  value,
  onChange,
  language = 'python',
  readOnly = false,
  minHeight = 260,
}: {
  value: string
  onChange?: (val: string) => void
  language?: string
  readOnly?: boolean
  minHeight?: number
}) {
  const handleChange = useCallback(
    (val: string) => {
      onChange?.(val)
    },
    [onChange]
  )

  const extensions = [LANG_EXTENSIONS[language]?.() || python()]

  return (
    <CodeMirror
      value={value}
      onChange={handleChange}
      extensions={extensions}
      theme={tokyoNight}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: false,
        dropCursor: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        rectangularSelection: false,
        crosshairCursor: false,
        highlightSelectionMatches: false,
      }}
      style={{ minHeight, fontSize: 13, borderRadius: '0 0 14px 14px' }}
    />
  )
}
