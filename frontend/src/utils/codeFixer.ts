// Code Fixer & Sanitizer for Case-Sensitive Languages
// Fixes Mobile Auto-Capitalization, Unicode spaces, Tab/Space mix, and Indentation

export function isCaseSensitiveLanguage(langOrExt: string): boolean {
  if (!langOrExt) return true;
  const l = langOrExt.toLowerCase();
  const caseSensitiveExts = [
    '.py', '.pyw', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.java', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh',
    '.go', '.rs', '.cs', '.php', '.kt', '.kts', '.swift', '.rb', '.scala', '.dart', '.r'
  ];
  const caseSensitiveLangs = [
    'python', 'javascript', 'typescript', 'java', 'c', 'cpp', 'c++', 'csharp', 'c#',
    'go', 'golang', 'rust', 'php', 'kotlin', 'swift', 'ruby', 'scala', 'dart', 'r'
  ];

  return caseSensitiveExts.some(ext => l.endsWith(ext)) || caseSensitiveLangs.some(lang => l.includes(lang));
}

// Mobile auto-capitalization keyword fixes for case-sensitive languages
const KEYWORD_MAPS: Record<string, string> = {
  // Python
  'Def ': 'def ',
  'Class ': 'class ',
  'Import ': 'import ',
  'From ': 'from ',
  'Return ': 'return ',
  'If ': 'if ',
  'Elif ': 'elif ',
  'Else:': 'else:',
  'Else ': 'else ',
  'While ': 'while ',
  'For ': 'for ',
  'Try:': 'try:',
  'Except ': 'except ',
  'Finally:': 'finally:',
  'With ': 'with ',
  'As ': 'as ',
  'Pass': 'pass',
  'Break': 'break',
  'Continue': 'continue',
  'Lambda ': 'lambda ',

  // Java / C / C++ / C# / JS / TS / Go / Rust
  'Public ': 'public ',
  'Private ': 'private ',
  'Protected ': 'protected ',
  'Static ': 'static ',
  'Void ': 'void ',
  'Int ': 'int ',
  'Float ': 'float ',
  'Double ': 'double ',
  'Char ': 'char ',
  'Boolean ': 'boolean ',
  'Bool ': 'bool ',
  'Const ': 'const ',
  'Let ': 'let ',
  'Var ': 'var ',
  'Function ': 'function ',
  'Fn ': 'fn ',
  'Func ': 'func ',
  'Package ': 'package ',
  'Using ': 'using ',
  'Namespace ': 'namespace ',
  'Include ': 'include ',
  '#include ': '#include ',
  'Struct ': 'struct ',
  'Enum ': 'enum ',
  'Interface ': 'interface ',
  'Extends ': 'extends ',
  'Implements ': 'implements ',
  'Async ': 'async ',
  'Await ': 'await ',
  'Switch ': 'switch ',
  'Case ': 'case ',
  'Default:': 'default:',
  'Catch ': 'catch ',
  'Throw ': 'throw ',
  'New ': 'new '
};

export function autoFixPythonIndentation(code: string): string {
  if (!code || typeof code !== 'string') return code;

  // Clean unicode non-breaking spaces & zero-width chars
  let clean = code
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');

  clean = clean.replace(/\t/g, '    ');
  const lines = clean.split('\n');

  // Calculate common leading indent
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const indent = line.length - line.trimStart().length;
      if (indent < minIndent) minIndent = indent;
    }
  }

  let dedented = lines;
  if (minIndent !== Infinity && minIndent > 0) {
    dedented = lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.length >= minIndent ? line.substring(minIndent) : line.trimStart();
    });
  }

  const resultLines: string[] = [];
  const indentStack: number[] = [0];
  let prevIsBlockOpener = false;

  for (let i = 0; i < dedented.length; i++) {
    const rawLine = dedented[i];
    let trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      resultLines.push(trimmed.startsWith('#') ? rawLine : '');
      continue;
    }

    // Fix mobile auto-capitalization on Python line starts
    for (const [bad, fixed] of Object.entries(KEYWORD_MAPS)) {
      if (trimmed.startsWith(bad)) {
        trimmed = fixed + trimmed.substring(bad.length);
        break;
      }
    }

    // Fix lowercase boolean/none if used as standalone keywords
    if (trimmed === 'true') trimmed = 'True';
    if (trimmed === 'false') trimmed = 'False';
    if (trimmed === 'none' || trimmed === 'null') trimmed = 'None';

    const currentIndent = rawLine.length - rawLine.trimStart().length;
    let targetIndent = currentIndent;

    const topOfStack = indentStack[indentStack.length - 1];

    if (currentIndent > topOfStack) {
      if (prevIsBlockOpener) {
        // Valid indented block inside a function, if, for, while, try, etc.
        indentStack.push(currentIndent);
        targetIndent = currentIndent;
      } else {
        // UNEXPECTED INDENT! Line is indented deeper but previous line was NOT a block header.
        // Cap indent to current block's level to eliminate IndentationError.
        targetIndent = topOfStack;
      }
    } else if (currentIndent < topOfStack) {
      // Indentation level decreased (denting back)
      while (indentStack.length > 1 && currentIndent < indentStack[indentStack.length - 1]) {
        indentStack.pop();
      }
      const top = indentStack[indentStack.length - 1];
      if (currentIndent > top) {
        if (prevIsBlockOpener) {
          indentStack.push(currentIndent);
          targetIndent = currentIndent;
        } else {
          targetIndent = top;
        }
      } else {
        targetIndent = top;
      }
    } else {
      targetIndent = topOfStack;
    }

    resultLines.push(' '.repeat(targetIndent) + trimmed);

    // Check if THIS line opens a new block for subsequent lines
    prevIsBlockOpener = trimmed.endsWith(':') || 
      /^(def|class|if|elif|else|for|while|try|except|finally|with|async\s+def|async\s+for|async\s+with)\b/.test(trimmed);
  }

  return resultLines.join('\n');
}

export function autoFixBraceLanguageIndentation(code: string, tabSize: number = 2): string {
  if (!code || typeof code !== 'string') return code;

  let clean = code
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');

  clean = clean.replace(/\t/g, ' '.repeat(tabSize));
  const lines = clean.split('\n');

  // Calculate common leading indent
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length > 0) {
      const indent = line.length - line.trimStart().length;
      if (indent < minIndent) minIndent = indent;
    }
  }

  let dedented = lines;
  if (minIndent !== Infinity && minIndent > 0) {
    dedented = lines.map(line => {
      if (line.trim().length === 0) return '';
      return line.length >= minIndent ? line.substring(minIndent) : line.trimStart();
    });
  }

  const resultLines: string[] = [];
  let indentLevel = 0;

  for (let i = 0; i < dedented.length; i++) {
    const rawLine = dedented[i];
    let trimmed = rawLine.trim();

    if (!trimmed) {
      resultLines.push('');
      continue;
    }

    // Fix mobile auto-capitalization on line starts
    for (const [bad, fixed] of Object.entries(KEYWORD_MAPS)) {
      if (trimmed.startsWith(bad)) {
        trimmed = fixed + trimmed.substring(bad.length);
        break;
      }
    }

    // Adjust indent for closing brace
    const closingBraces = (trimmed.match(/\}/g) || []).length;
    const openingBraces = (trimmed.match(/\{/g) || []).length;

    if (trimmed.startsWith('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
      resultLines.push(' '.repeat(indentLevel * tabSize) + trimmed);
      indentLevel += Math.max(0, openingBraces - (closingBraces - 1));
    } else {
      resultLines.push(' '.repeat(indentLevel * tabSize) + trimmed);
      indentLevel = Math.max(0, indentLevel + openingBraces - closingBraces);
    }
  }

  return resultLines.join('\n');
}

export function sanitizeAndFixCode(code: string, fileNameOrLang: string): string {
  if (!code || typeof code !== 'string') return code;

  const name = (fileNameOrLang || '').toLowerCase();
  const isPython = name.endsWith('.py') || name === 'python';

  if (isPython) {
    return autoFixPythonIndentation(code);
  }

  if (isCaseSensitiveLanguage(name)) {
    const tabSize = (name.endsWith('.java') || name.endsWith('.cpp') || name.endsWith('.c') || name.endsWith('.cs')) ? 4 : 2;
    return autoFixBraceLanguageIndentation(code, tabSize);
  }

  // Generic fallback for plain text or HTML/CSS: clean invisible unicode characters
  return code
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '');
}
