/**
 * Smart Client-side Sandbox Interpreter Fallback
 * Translates and runs user programs (Go, Python, Java, C/C++, JS, TS) 
 * directly in the browser if the backend connection is offline or times out.
 */

import { autoFixPythonIndentation, sanitizeAndFixCode } from './codeFixer';

export interface SimulationResult {
  output: string;
  errors: string;
  aborted?: boolean;
}

export function hasInteractiveStdin(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return /(fmt\s*\.\s*(Scan|Scanln|Scanf|Fscan|Fscanln|Fscanf|Sscan|Sscanln|Sscanf)|bufio\.NewScanner|os\.Stdin|\bScan\s*\(|\bScanln\s*\(|\bScanf\s*\(|\binput\s*\(|\braw_input\s*\(|sys\.stdin\.read|\bscanf\s*\(|(?:std::)?cin\s*>>|\bgets\s*\(|\bfgets\s*\(|\bgetline\s*\(|\bgetchar\s*\(|\bScanner\s*\(|BufferedReader|InputStreamReader|System\.in|Console\.ReadLine|Console\.Read|readline\s*\(|prompt\s*\(|process\.stdin|io::stdin|\breadLine\s*\(|\breadln\s*\(|\breadlnOrNull\s*\(|\breadLineSync|\breadLines\s*\(|io\.read|read\s+-p|stdin\.readLineSync)/i.test(code);
}

export async function simulateCodeExecutionClient(
  rawContent: string, 
  extension: string,
  readStdinLine?: () => Promise<string>,
  onOutputLine?: (line: string, type: 'default' | 'error' | 'info') => void
): Promise<SimulationResult> {
  const content = sanitizeAndFixCode(rawContent, extension);
  let jsCode = '';
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const customConsole = {
    log: (...args: any[]) => {
      const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      stdoutLines.push(text);
      if (onOutputLine) onOutputLine(text, 'default');
    },
    error: (...args: any[]) => {
      const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      stderrLines.push(text);
      if (onOutputLine) onOutputLine(text, 'error');
    },
    warn: (...args: any[]) => {
      const text = '[WARN] ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      stdoutLines.push(text);
      if (onOutputLine) onOutputLine(text, 'info');
    }
  };

  const safeReadStdin = readStdinLine || (() => new Promise<string>(resolve => setTimeout(() => resolve('0'), 100)));

  try {
    const ext = extension.toLowerCase();
    
    if (ext === '.js' || ext === '.ts') {
      let codeToRun = content;
      if (ext === '.ts') {
        // Strip basic typescript types
        codeToRun = codeToRun
          .replace(/: \s*(string|number|boolean|any|void|unknown|object|never)/g, '')
          .replace(/as \s*(string|number|boolean|any|void|unknown|object|never)/g, '')
          .replace(/interface \s+\w+\s*\{[^}]*\}/g, '')
          .replace(/type \s+\w+\s*=\s*[^;]+;/g, '');
      }
      codeToRun = codeToRun.replace(/(?<!await\s+)\b(prompt|readline)\s*\(/g, 'await $1(');
      jsCode = `(async () => {\n${codeToRun}\n})();`;
    } else if (ext === '.java') {
      let javaCode = content;
      
      // Clean up package and imports
      javaCode = javaCode.replace(/package\s+[\w.]+;/g, '');
      javaCode = javaCode.replace(/import\s+[\w.]+;/g, '');

      // Replace System.out.println / System.out.print with console.log
      javaCode = javaCode.replace(/System\.out\.println\s*\(/g, 'console.log(');
      javaCode = javaCode.replace(/System\.out\.print\s*\(/g, 'console.log(');

      // Strip method signature types safely using a selective regex
      javaCode = javaCode.replace(/(public\s+|private\s+|protected\s+)?(static\s+)?(void|int|double|float|boolean|String|char|long|short|void|[\w\d_<>\s]+)\s+(\w+)\s*\(([^)]*)\)/g, (match, access, isStatic, returnType, methodName, paramsText) => {
        const skipMethods = ['for', 'if', 'while', 'switch', 'catch', 'synchronized', 'super', 'this', 'log', 'println', 'print'];
        if (skipMethods.includes(methodName)) {
          return match;
        }
        const params = paramsText.trim() ? paramsText.split(',') : [];
        const cleanedParams = params.map((param: string) => {
          const parts = param.trim().split(/\s+/);
          return parts[parts.length - 1].replace(/[\[\]]/g, '');
        });
        const staticKeyword = (isStatic || (returnType && /\bstatic\b/.test(returnType))) ? 'static ' : '';
        return `${staticKeyword}${methodName}(${cleanedParams.join(', ')})`;
      });

      // Convert Class header: public class Main { -> class Main {
      javaCode = javaCode.replace(/public\s+class\s+(\w+)/g, 'class $1');

      // Convert variable declarations
      const typesRegex = /\b(int|double|float|boolean|String|char|long|short|var)\s*(\[ \s* \])?\s+([a-zA-Z_]\w*)\s*(\[ \s* \])?\b/g;
      javaCode = javaCode.replace(typesRegex, 'let $3');

      // Support array initializers
      javaCode = javaCode.replace(/let\s+([a-zA-Z_]\w*)\s*=\s*\{([^}]+)\}/g, 'let $1 = [$2]');

      // Fix for-loops with let statement types
      javaCode = javaCode.replace(/\bfor\s*\(\s*let\s+([a-zA-Z_]\w*)\b/g, 'for (let $1');

      // Support Scanner & BufferedReader methods
      javaCode = javaCode.replace(/(\w+)\.(nextInt|nextDouble|nextFloat|nextLong|nextBoolean|nextByte|nextShort|nextLine|next)\s*\(\s*\)/g, 'await $1.$2()');
      javaCode = javaCode.replace(/(\w+)\.readLine\s*\(\s*\)/g, 'await $1.readLine()');

      // Replace .length() with .length
      javaCode = javaCode.replace(/\.length\s*\(\s*\)/g, '.length');

      const classNameMatch = javaCode.match(/class\s+(\w+)/);
      
      const javaPolyfills = `
class Scanner {
  constructor(src) {}
  async nextInt() { const v = await safeReadStdin(); return parseInt(v.trim(), 10) || 0; }
  async nextLong() { const v = await safeReadStdin(); return parseInt(v.trim(), 10) || 0; }
  async nextDouble() { const v = await safeReadStdin(); return parseFloat(v.trim()) || 0; }
  async nextFloat() { const v = await safeReadStdin(); return parseFloat(v.trim()) || 0; }
  async nextBoolean() { const v = await safeReadStdin(); return (v.trim().toLowerCase() === 'true'); }
  async nextByte() { const v = await safeReadStdin(); return parseInt(v.trim(), 10) || 0; }
  async nextShort() { const v = await safeReadStdin(); return parseInt(v.trim(), 10) || 0; }
  async nextLine() { return await safeReadStdin(); }
  async next() { const v = await safeReadStdin(); return v.trim().split(/\\s+/)[0] || ''; }
}
class BufferedReader {
  constructor(reader) {}
  async readLine() { return await safeReadStdin(); }
}
class InputStreamReader {
  constructor(stream) {}
}
class ArrayList extends Array {
  add(item) { this.push(item); return true; }
  get(index) { return this[index]; }
  size() { return this.length; }
  clear() { this.length = 0; }
  remove(index) { return this.splice(index, 1)[0]; }
  isEmpty() { return this.length === 0; }
}
class HashMap extends Map {
  put(key, value) { this.set(key, value); return value; }
  get(key) { return super.get(key); }
  size() { return this.size; }
  containsKey(key) { return this.has(key); }
  remove(key) { const val = this.get(key); this.delete(key); return val; }
}
const System = {
  in: new BufferedReader(null),
  out: {
    println: (...args) => console.log(...args),
    print: (...args) => console.log(...args),
    printf: (format, ...args) => {
      let result = format;
      args.forEach(arg => {
        result = result.replace(/%[sdefg]/, arg);
      });
      console.log(result);
    }
  },
  getProperty: (key) => {
    if (key === 'java.vendor') return 'Smart Sandbox Compiler';
    if (key === 'java.version') return '17.0.2';
    return 'Mock Value';
  },
  currentTimeMillis: () => Date.now(),
  nanoTime: () => Date.now() * 1000000
};
if (!String.prototype.equals) {
  Object.defineProperty(String.prototype, 'equals', {
    value: function(other) { return this === other; },
    writable: true,
    configurable: true
  });
}
`;

      jsCode = javaPolyfills + '\n' + javaCode;
      
      if (classNameMatch && classNameMatch[1]) {
        jsCode += `\n\nif (typeof ${classNameMatch[1]} !== 'undefined' && typeof ${classNameMatch[1]}.main === 'function') { await ${classNameMatch[1]}.main([]); }`;
      }
    } else if (ext === '.py') {
      let pyCode = autoFixPythonIndentation(content);
      
      const rawLines = pyCode.split('\n');
      
      // Calculate common leading indentation among non-empty lines (dedent)
      let minIndent = Infinity;
      rawLines.forEach(l => {
        if (l.trim().length > 0) {
          const indent = l.length - l.trimStart().length;
          if (indent < minIndent) minIndent = indent;
        }
      });
      if (minIndent === Infinity) minIndent = 0;
      
      const lines = rawLines.map(l => l.trim().length > 0 ? l.substring(minIndent) : '');
      let jsLines: string[] = [];
      let indentStack: number[] = [];

      lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          jsLines.push(trimmed.startsWith('#') ? '// ' + trimmed.substring(1) : '');
          return;
        }

        let indent = line.length - line.trimStart().length;

        while (indentStack.length > 0 && indent < indentStack[indentStack.length - 1]) {
          indentStack.pop();
          jsLines.push(' '.repeat(indent) + '}');
        }

        // Convert f-strings: f"..." or f'...'
        trimmed = trimmed.replace(/\bf(["'])([\s\S]*?)\1/g, (m, quote, str) => {
          const formatted = str.replace(/\{([^}]+)\}/g, '${$1}');
          return '`' + formatted + '`';
        });

        // Convert python booleans and null
        trimmed = trimmed
          .replace(/\bTrue\b/g, 'true')
          .replace(/\bFalse\b/g, 'false')
          .replace(/\bNone\b/g, 'null');

        // Convert python print
        if (trimmed.startsWith('print(')) {
          trimmed = trimmed.replace('print(', 'console.log(');
        } else if (trimmed.startsWith('print ')) {
          trimmed = 'console.log(' + trimmed.substring(6) + ')';
        }

        // Convert python input(...) / raw_input(...)
        trimmed = trimmed.replace(/\b(input|raw_input)\s*\(([^)]*)\)/g, '(await __py_input($2))');

        // Convert Python ternary: var = val1 if cond else val2
        const ternaryMatch = trimmed.match(/^([a-zA-Z_]\w*\s*=\s*)(.+?)\s+if\s+(.+?)\s+else\s+(.+)$/);
        if (ternaryMatch) {
          trimmed = `${ternaryMatch[1]}(${ternaryMatch[3]}) ? (${ternaryMatch[2]}) : (${ternaryMatch[4]})`;
        }

        // Python functions: def func_name(args): -> function func_name(args) {
        if (/^(async\s+)?def\s+/.test(trimmed) && trimmed.endsWith(':')) {
          const isAsync = trimmed.startsWith('async');
          const defContent = trimmed.replace(/^(async\s+)?def\s+/, '').slice(0, -1).trim();
          trimmed = `${isAsync ? 'async ' : ''}function ${defContent} {`;
          indentStack.push(indent + 4);
        }
        // Python class: class ClassName: or class ClassName(Parent):
        else if (trimmed.startsWith('class ') && trimmed.endsWith(':')) {
          const classContent = trimmed.substring(6, trimmed.length - 1).replace(/\((.*?)\)/, '');
          trimmed = `class ${classContent.trim()} {`;
          indentStack.push(indent + 4);
        }
        // Loops & Control Flow
        else if (trimmed.startsWith('for ') && trimmed.endsWith(':')) {
          const range1 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*\)\s*:/);
          const range2 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*\)\s*:/);
          const range3 = trimmed.match(/for\s+(\w+)\s+in\s+range\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*\)\s*:/);
          const forInObj = trimmed.match(/for\s+([a-zA-Z0-9_,\s]+)\s+in\s+(.+)\.items\s*\(\s*\)\s*:/);
          const forInList = trimmed.match(/for\s+(\w+)\s+in\s+(.+)\s*:/);

          if (range3) {
            trimmed = `for (let ${range3[1]} = ${range3[2]}; ${range3[1]} < ${range3[3]}; ${range3[1]} += ${range3[4]}) {`;
          } else if (range2) {
            trimmed = `for (let ${range2[1]} = ${range2[2]}; ${range2[1]} < ${range2[3]}; ${range2[1]}++) {`;
          } else if (range1) {
            trimmed = `for (let ${range1[1]} = 0; ${range1[1]} < ${range1[2]}; ${range1[1]}++) {`;
          } else if (forInObj) {
            const vars = forInObj[1].split(',').map(v => v.trim());
            const keyVar = vars[0] || 'key';
            const valVar = vars[1] || 'val';
            trimmed = `for (let [${keyVar}, ${valVar}] of Object.entries(${forInObj[2]})) {`;
          } else if (forInList) {
            trimmed = `for (let ${forInList[1]} of ${forInList[2]}) {`;
          } else {
            trimmed = `/* ${trimmed} */ {`;
          }
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('while ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(6, trimmed.length - 1).trim();
          trimmed = `while (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('if ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(3, trimmed.length - 1).trim();
          trimmed = `if (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('elif ') && trimmed.endsWith(':')) {
          const cond = trimmed.substring(5, trimmed.length - 1).trim();
          trimmed = `} else if (${cond}) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('else:') || trimmed.startsWith('else :')) {
          trimmed = `} else {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('try:') || trimmed.startsWith('try :')) {
          trimmed = `try {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('except') && trimmed.endsWith(':')) {
          trimmed = `} catch (err) {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.startsWith('finally:') || trimmed.startsWith('finally :')) {
          trimmed = `} finally {`;
          indentStack.push(indent + 4);
        }
        else if (trimmed.endsWith(':')) {
          trimmed = trimmed.substring(0, trimmed.length - 1) + ' {';
          indentStack.push(indent + 4);
        }
        else {
          if (/^[a-zA-Z_]\w*\s*=/.test(trimmed) && !/^(let|const|var)\s+/.test(trimmed)) {
            const varName = trimmed.split('=')[0].trim();
            if (!['window', 'global', 'console'].includes(varName)) {
              trimmed = 'let ' + trimmed;
            }
          }
        }

        jsLines.push(' '.repeat(indent) + trimmed);
      });

      while (indentStack.length > 0) {
        indentStack.pop();
        jsLines.push('}');
      }

      const pyPolyfills = `
if (!Array.prototype.append) {
  Object.defineProperty(Array.prototype, 'append', {
    value: function(x) { this.push(x); return this; },
    writable: true, configurable: true
  });
}
if (!Array.prototype.extend) {
  Object.defineProperty(Array.prototype, 'extend', {
    value: function(arr) { if (Array.isArray(arr)) this.push(...arr); return this; },
    writable: true, configurable: true
  });
}
if (!Object.prototype.items) {
  Object.defineProperty(Object.prototype, 'items', {
    value: function() { return Object.entries(this); },
    writable: true, configurable: true
  });
}
if (!Object.prototype.get) {
  Object.defineProperty(Object.prototype, 'get', {
    value: function(key, defaultVal) { return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : (defaultVal !== undefined ? defaultVal : null); },
    writable: true, configurable: true
  });
}
`;
      jsCode = pyPolyfills + '\n' + jsLines.join('\n');
    } else if (ext === '.cpp' || ext === '.c' || ext === '.cc') {
      let cppCode = content;
      cppCode = cppCode.replace(/\/\*[\s\S]*?\*\//g, '');
      cppCode = cppCode.replace(/\/\/.*/g, '');
      cppCode = cppCode.replace(/#\s*(?:include|define|pragma|ifdef|ifndef|endif|else)[\s\S]*?$/gm, '');
      cppCode = cppCode.replace(/using\s+namespace\s+\w+\s*;/g, '');
      cppCode = cppCode.replace(/std::cout\s*<<\s*/g, 'console.log(');
      cppCode = cppCode.replace(/cout\s*<<\s*/g, 'console.log(');
      cppCode = cppCode.replace(/\s*<<\s*std::endl\s*;/g, ');');
      cppCode = cppCode.replace(/\s*<<\s*endl\s*;/g, ');');

      // Handle C/C++ cin, scanf, gets, fgets, getline, getchar
      cppCode = cppCode.replace(/(?:std::)?cin\s*>>\s*([a-zA-Z_]\w*(?:\s*>>\s*[a-zA-Z_]\w*)+);/g, (match, vars) => {
        const list = vars.split('>>').map((v: string) => v.trim());
        return `[${list.join(', ')}] = await __go_scan(${list.length});`;
      });
      cppCode = cppCode.replace(/(?:std::)?cin\s*>>\s*([a-zA-Z_]\w*);/g, '$1 = await __go_scan(1);');
      cppCode = cppCode.replace(/scanf\s*\([^,]+,\s*&([a-zA-Z_]\w*)\s*\);/g, '$1 = await __go_scan(1);');
      cppCode = cppCode.replace(/\b(?:gets|fgets|getline)\s*\([^)]*\)/g, '(await safeReadStdin())');
      cppCode = cppCode.replace(/\bgetchar\s*\(\s*\)/g, '(await safeReadStdin())');

      const typePattern = '\\b(?:int|double|float|bool|char|long|short|void|auto|string|std::string|size_t|uint32_t|int32_t|unsigned)\\b';
      
      // Clean and convert main function safely
      cppCode = cppCode.replace(new RegExp(`(?:${typePattern}\\s+)?main\\s*\\(([^)]*)\\)\\s*\\{`, 'g'), (match, params) => {
        const cleanParams = params.replace(new RegExp(`${typePattern}\\s+`, 'g'), '');
        return `async function main(${cleanParams}) {`;
      });

      // Convert other C/C++ functions
      const funcRegex = new RegExp(`(${typePattern})\\s+([a-zA-Z_]\\w*)\\s*\\(([^)]*)\\)\\s*\\{`, 'g');
      cppCode = cppCode.replace(funcRegex, (match, retType, funcName, params) => {
        if (funcName === 'function' || funcName === 'main') return match;
        const cleanParams = params.replace(new RegExp(`${typePattern}\\s+`, 'g'), '');
        return `async function ${funcName}(${cleanParams}) {`;
      });

      const varRegex = new RegExp(`\\b(?:int|double|float|bool|char|long|short|string|std::string|auto|size_t|uint32_t|int32_t|unsigned)\\s+([a-zA-Z_]\\w*(?:\\s*,\\s*[a-zA-Z_]\\w*)*)\\s*(;|=)`, 'g');
      cppCode = cppCode.replace(varRegex, 'let $1$2');

      cppCode = cppCode.replace(/\bfor\s*\(\s*(?:let\s+)?([a-zA-Z_]\w*)\b/g, 'for (let $1');

      jsCode = cppCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.rs') {
      let rustCode = content;
      rustCode = rustCode.replace(/println!\s*\(\s*"([^"]*)"\s*,\s*([^)]+)\)/g, 'console.log("$1".replace("{}", $2))');
      rustCode = rustCode.replace(/println!\s*\(\s*"([^"]*)"\s*\)/g, 'console.log("$1")');
      rustCode = rustCode.replace(/(?:std::)?io::stdin\(\)\.read_line\s*\(&mut\s*([a-zA-Z_]\w*)\)/g, '$1 = await safeReadStdin()');
      rustCode = rustCode.replace(/\bread_line\s*\([^)]*\)/g, '(await safeReadStdin())');
      rustCode = rustCode.replace(/fn\s+main\s*\(\s*\)\s*\{/g, 'async function main() {');
      rustCode = rustCode.replace(/\blet\s+mut\s+/g, 'let ');
      jsCode = rustCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.go') {
      let goCode = content;
      goCode = goCode.replace(/package\s+\w+/g, '');
      goCode = goCode.replace(/import\s+\([^)]+\)/g, '');
      goCode = goCode.replace(/import\s+"[^"]+"/g, '');
      
      // Handle Go STDIN inputs (fmt.Scan, fmt.Scanln, fmt.Scanf)
      goCode = goCode.replace(/fmt\.(Scan|Scanln|Scanf)\s*\(([^)]+)\)/g, (match, fn, argsStr) => {
        const ptrs = argsStr.split(',').map(s => s.trim()).filter(s => s.startsWith('&'));
        if (ptrs.length === 1) {
          const varName = ptrs[0].replace('&', '').trim();
          return `${varName} = await __go_scan(1);`;
        } else if (ptrs.length > 1) {
          const varNames = ptrs.map(p => p.replace('&', '').trim()).join(', ');
          return `[${varNames}] = await __go_scan(${ptrs.length});`;
        }
        return `await __go_scan(1);`;
      });

      goCode = goCode.replace(/bufio\.NewScanner\([^)]*\)/g, 'new __GoScanner()');
      goCode = goCode.replace(/(\w+)\.Scan\(\)/g, 'await $1.Scan()');
      goCode = goCode.replace(/(\w+)\.Text\(\)/g, '$1.Text()');

      goCode = goCode.replace(/fmt\.Println\s*\(/g, 'console.log(');
      goCode = goCode.replace(/fmt\.Print\s*\(/g, 'console.log(');
      
      goCode = goCode.replace(/make\s*\(\s*chan\s+\w+\s*\)/g, 'new GoChannel()');
      goCode = goCode.replace(/\bgo\s+func\s*\(([^)]*)\)\s*\{([\s\S]*?)\}\s*\(([^)]*)\)/g, 'go_routine(async ($1) => {$2}, $3)');
      goCode = goCode.replace(/time\.Sleep\(([^)]+)\)/g, 'await time.Sleep($1)');
      goCode = goCode.replace(/(\w+)\s*<-\s*([^;\n]+)/g, 'await $1.send($2)');
      goCode = goCode.replace(/<-\s*(\w+)/g, 'await $1.receive()');
      
      goCode = goCode.replace(/func\s+(\w+)\s*\(([^)]*)\)\s*([^{]*)\{/g, (match, fnName, paramsText, returnType) => {
        const params = paramsText.trim() ? paramsText.split(',') : [];
        const cleanedParams = params.map((p: string) => {
          const parts = p.trim().split(/\s+/);
          return parts[0];
        });
        return `async function ${fnName}(${cleanedParams.join(', ')}) {`;
      });

      goCode = goCode.replace(/func\s+main\s*\(\s*\)/g, 'async function main()');
      
      // Convert three-part for loops: for i := 0; i < n; i++ { -> for (let i = 0; i < n; i++) {
      goCode = goCode.replace(/\bfor\s+([a-zA-Z0-9_]+)\s*:=\s*([^;]+);\s*([a-zA-Z0-9_]+)\s*([<>=!]+)\s*([^;]+);\s*([a-zA-Z0-9_+-]+)\s*\{/g, 'for (let $1 = $2; $3 $4 $5; $6) {');

      // Convert for range loops
      goCode = goCode.replace(/\bfor\s+([a-zA-Z0-9_,\s]+)\s*:=\s*range\s+([^\s{]+)\s*\{/g, (match, vars, expr) => {
        const parts = vars.split(',').map(v => v.trim());
        if (parts.length === 2) {
          const idx = parts[0] === '_' ? 'dummyIndex' : parts[0];
          const val = parts[1];
          return `for (let [${idx}, ${val}] of ${expr}.map((v, i) => [i, v])) {`;
        } else if (parts.length === 1) {
          return `for (let ${parts[0]} of Object.keys(${expr})) {`;
        }
        return match;
      });

      // Convert single condition for loops (Go's while): for x < 10 { -> while (x < 10) {
      goCode = goCode.replace(/\bfor\s+([^;{]+)\s*\{/g, 'while ($1) {');

      // Convert if statements: if x > 5 { -> if (x > 5) {
      goCode = goCode.replace(/\bif\s+([^;{]+)\s*\{/g, 'if ($1) {');
      goCode = goCode.replace(/\belse\s+if\s+([^;{]+)\s*\{/g, 'else if ($1) {');

      // Convert Go assignment := to let assignment
      goCode = goCode.replace(/(\w+)\s*:=\s*/g, 'let $1 = ');

      // Convert block var declarations: var (...)
      goCode = goCode.replace(/\bvar\s*\(\s*([\s\S]*?)\)/g, (match, block) => {
        const lines = block.split('\n').map((line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          const cleaned = trimmed
            .replace(/^(\w+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'let $1 = ')
            .replace(/^(\w+)\s+(int|string|bool|float64|float32)/g, 'let $1');
          return cleaned + ';';
        });
        return lines.join('\n');
      });

      // Convert normal var declarations
      goCode = goCode.replace(/\bvar\s+([a-zA-Z0-9_,\s]+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'let $1 = ');
      goCode = goCode.replace(/\bvar\s+([a-zA-Z0-9_,\s]+)\s+(int|string|bool|float64|float32)/g, 'let $1');

      // Convert const declarations
      goCode = goCode.replace(/\bconst\s+(\w+)\s+(int|string|bool|float64|float32)\s*=\s*/g, 'const $1 = ');

      goCode = goCode.replace(/\[\s*\d*\s*\]\w+\s*\{/g, '[');
      goCode = goCode.replace(/\b([A-Z]\w*)\s*\{/g, '{');
      goCode = goCode.replace(/type\s+\w+\s+struct\s*\{[^}]*\}/g, '');
      goCode = goCode.replace(/\bnil\b/g, 'null');
      
      jsCode = `${goCode}\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.php') {
      let phpCode = content;
      phpCode = phpCode.replace(/<\?php/g, '');
      phpCode = phpCode.replace(/\?>/g, '');
      phpCode = phpCode.replace(/echo\s+([^;]+);/g, 'console.log($1);');
      phpCode = phpCode.replace(/fgets\s*\(\s*STDIN\s*\)/g, '(await safeReadStdin())');
      phpCode = phpCode.replace(/readline\s*\([^)]*\)/g, '(await safeReadStdin())');
      phpCode = phpCode.replace(/fscanf\s*\(\s*STDIN\s*,\s*[^,]+,\s*\$([a-zA-Z_]\w*)\)/g, '$1 = await safeReadStdin()');
      jsCode = `(async () => {\n${phpCode}\n})();`;
    } else if (ext === '.swift') {
      let swiftCode = content;
      swiftCode = swiftCode.replace(/import\s+[\w.]+/g, '');
      swiftCode = swiftCode.replace(/print\s*\(/g, 'console.log(');
      swiftCode = swiftCode.replace(/\blet\b/g, 'const').replace(/\bvar\b/g, 'let');
      swiftCode = swiftCode.replace(/readLine\s*\(\s*\)/g, '(await safeReadStdin())');
      swiftCode = swiftCode.replace(/for\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*in\s*([\w.]+)\.enumerated\s*\(\s*\)\s*\{/g, 'for (let [$1, $2] of $3.entries()) {');
      swiftCode = swiftCode.replace(/for\s+(\w+)\s+in\s+([^{\n]+)\{/g, 'for (let $1 of $2) {');
      swiftCode = swiftCode.replace(/\\\(([^)]+)\)/g, '${$1}');
      swiftCode = swiftCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      jsCode = `(async () => {\n${swiftCode}\n})();`;
    } else if (ext === '.kt' || ext === '.kts') {
      let ktCode = content;
      ktCode = ktCode.replace(/package\s+[\w.]+/g, '');
      ktCode = ktCode.replace(/import\s+[\w.*]+/g, '');
      ktCode = ktCode.replace(/println\s*\(/g, 'console.log(');
      ktCode = ktCode.replace(/print\s*\(/g, 'console.log(');
      ktCode = ktCode.replace(/\bval\b/g, 'const').replace(/\bvar\b/g, 'let');
      ktCode = ktCode.replace(/\b(readLine|readln|readlnOrNull)\s*\(\s*\)/g, '(await safeReadStdin())');
      ktCode = ktCode.replace(/listOf\s*\(/g, '[').replace(/arrayOf\s*\(/g, '[');
      ktCode = ktCode.replace(/([\w.]+)\.forEachIndexed\s*\{\s*(\w+)\s*,\s*(\w+)\s*->/g, 'for (let [$2, $3] of $1.entries()) {');
      ktCode = ktCode.replace(/([\w.]+)\.forEach\s*\{\s*(\w+)\s*->/g, 'for (let $2 of $1) {');
      ktCode = ktCode.replace(/for\s*\(\s*(\w+)\s+in\s+([^)]+)\)/g, 'for (let $1 of $2)');
      ktCode = ktCode.replace(/\$\{([^}]+)\}/g, '___KT_EXPR_$1___');
      ktCode = ktCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      ktCode = ktCode.replace(/___KT_EXPR_(.*?)___/g, '${$1}');
      ktCode = ktCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      ktCode = ktCode.replace(/fun\s+main\s*\([^)]*\)\s*\{/g, 'async function main() {');
      jsCode = ktCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.rb') {
      let rbCode = content;
      rbCode = rbCode.replace(/puts\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+)/g, 'console.log($1)');
      rbCode = rbCode.replace(/print\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+)/g, 'console.log($1)');
      rbCode = rbCode.replace(/\b(gets\.chomp|gets|STDIN\.gets)\b/g, '(await safeReadStdin())');
      rbCode = rbCode.replace(/([\w.]+)\.each_with_index\s+do\s*\|(\w+)\s*,\s*(\w+)\|/g, 'for (let [$3, $2] of $1.entries()) {');
      rbCode = rbCode.replace(/([\w.]+)\.each\s+do\s*\|(\w+)\|/g, 'for (let $2 of $1) {');
      rbCode = rbCode.replace(/\bend\b/g, '}');
      rbCode = rbCode.replace(/#\{([^}]+)\}/g, '${$1}');
      rbCode = rbCode.replace(/"([^"\n]*?\$\{.*?\}[\s\S]*?)"/g, '`$1`');
      jsCode = `(async () => {\n${rbCode}\n})();`;
    } else if (ext === '.cs') {
      let csCode = content;
      csCode = csCode.replace(/using\s+[\w.]+;/g, '');
      csCode = csCode.replace(/namespace\s+[\w.]+\s*\{?/g, '');
      csCode = csCode.replace(/Console\.WriteLine\s*\(/g, 'console.log(');
      csCode = csCode.replace(/Console\.Write\s*\(/g, 'console.log(');
      csCode = csCode.replace(/Console\.ReadLine\s*\(\s*\)/g, '(await safeReadStdin())');
      csCode = csCode.replace(/Console\.Read\s*\(\s*\)/g, '(await safeReadStdin())');
      csCode = csCode.replace(/(public|private|protected|internal)\s+/g, '');
      csCode = csCode.replace(/static\s+(async\s+Task|void|int)\s+Main\s*\([^)]*\)\s*\{/g, 'async function main() {');
      csCode = csCode.replace(/class\s+\w+\s*\{?/g, '');
      csCode = csCode.replace(/string\[\]\s+(\w+)\s*=\s*\{([^}]+)\}/g, 'const $1 = [$2]');
      csCode = csCode.replace(/(int|double|float|bool|string|var)\s+([a-zA-Z_]\w*)\s*=/g, 'let $2 =');
      csCode = csCode.replace(/\$"([^"\n]*?)"/g, (m, str) => {
        return '`' + str.replace(/\{([^}]+)\}/g, '${$1}') + '`';
      });
      csCode = csCode.replace(/\.Length\b/g, '.length');

      // Balance open and close braces to prevent syntax errors from stripped namespace/class
      let openBraces = 0;
      const balancedLines: string[] = [];
      for (const line of csCode.split('\n')) {
        let lineDelta = 0;
        for (const char of line) {
          if (char === '{') lineDelta++;
          if (char === '}') lineDelta--;
        }
        if (openBraces + lineDelta < 0) {
          // Skip extra closing brace
          balancedLines.push(line.replace(/}/, ''));
        } else {
          openBraces += lineDelta;
          balancedLines.push(line);
        }
      }
      while (openBraces > 0) {
        balancedLines.push('}');
        openBraces--;
      }

      jsCode = balancedLines.join('\n') + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.dart') {
      let dartCode = content;
      dartCode = dartCode.replace(/import\s+['"][^'"]+['"];/g, '');
      dartCode = dartCode.replace(/print\s*\(/g, 'console.log(');
      dartCode = dartCode.replace(/stdin\.readLineSync\s*\(\s*\)/g, '(await safeReadStdin())');
      dartCode = dartCode.replace(/void\s+main\s*\(\s*\)\s*\{/g, 'async function main() {');
      dartCode = dartCode.replace(/\bfinal\b/g, 'const').replace(/\bvar\b/g, 'let');
      dartCode = dartCode.replace(/\$\{([^}]+)\}/g, '___DART_EXPR_$1___');
      dartCode = dartCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      dartCode = dartCode.replace(/___DART_EXPR_(.*?)___/g, '${$1}');
      dartCode = dartCode.replace(/'([^'\n]*?\$\{.*?\}[\s\S]*?)'/g, '`$1`');
      jsCode = dartCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.scala') {
      let scalaCode = content;
      scalaCode = scalaCode.replace(/package\s+[\w.]+/g, '');
      scalaCode = scalaCode.replace(/import\s+[\w.]+/g, '');
      scalaCode = scalaCode.replace(/println\s*\(/g, 'console.log(');
      scalaCode = scalaCode.replace(/\b(scala\.io\.)?StdIn\.(readLine|readInt|readDouble)\s*\(\s*\)/g, '(await safeReadStdin())');
      scalaCode = scalaCode.replace(/\b(readLine|readInt|readDouble)\s*\(\s*\)/g, '(await safeReadStdin())');
      scalaCode = scalaCode.replace(/object\s+\w+\s+extends\s+App\s*\{/g, 'async function main() {');
      scalaCode = scalaCode.replace(/\bval\b/g, 'const').replace(/\bvar\b/g, 'let');
      scalaCode = scalaCode.replace(/List\s*\(/g, '[');
      scalaCode = scalaCode.replace(/([\w.]+)\.zipWithIndex\.foreach\s*\{\s*case\s*\(([^,]+),\s*([^)]+)\)\s*=>/g, 'for (let [$3, $2] of $1.entries()) {');
      scalaCode = scalaCode.replace(/\$\{([^}]+)\}/g, '___SCALA_EXPR_$1___');
      scalaCode = scalaCode.replace(/\$([a-zA-Z_]\w*)/g, '${$1}');
      scalaCode = scalaCode.replace(/___SCALA_EXPR_(.*?)___/g, '${$1}');
      scalaCode = scalaCode.replace(/s"([^"\n]*?)"/g, '`$1`');
      jsCode = scalaCode + `\n\nif (typeof main === 'function') { await main(); }`;
    } else if (ext === '.pl') {
      let plCode = content;
      plCode = plCode.replace(/print\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+);/g, 'console.log($1);');
      plCode = plCode.replace(/<STDIN>/g, '(await safeReadStdin())');
      plCode = plCode.replace(/<>/g, '(await safeReadStdin())');
      jsCode = `(async () => {\n${plCode}\n})();`;
    } else if (ext === '.lua') {
      let luaCode = content;
      luaCode = luaCode.replace(/print\s*\(/g, 'console.log(');
      luaCode = luaCode.replace(/io\.read\s*\([^)]*\)/g, '(await safeReadStdin())');
      jsCode = `(async () => {\n${luaCode}\n})();`;
    } else if (ext === '.sh' || ext === '.bash') {
      let shCode = content;
      shCode = shCode.replace(/echo\s+("[\s\S]*?"|'[\s\S]*?'|[^\n;]+)/g, 'console.log($1)');
      shCode = shCode.replace(/read\s+(?:-p\s+"[^"]*"\s+)?([a-zA-Z_]\w*)/g, '$1 = await safeReadStdin();');
      jsCode = `(async () => {\n${shCode}\n})();`;
    } else if (ext === '.r') {
      let rCode = content;
      rCode = rCode.replace(/cat\s*\(([^)]+)\)/g, 'console.log($1)');
      rCode = rCode.replace(/print\s*\(([^)]+)\)/g, 'console.log($1)');
      rCode = rCode.replace(/c\s*\(([^)]+)\)/g, '[$1]');
      rCode = rCode.replace(/<-\s*/g, '= ');
      rCode = rCode.replace(/sum\s*\(([^)]+)\)/g, '($1).reduce((a,b)=>a+b, 0)');
      rCode = rCode.replace(/mean\s*\(([^)]+)\)/g, '(($1).reduce((a,b)=>a+b, 0) / ($1).length)');
      jsCode = rCode;
    } else {
      jsCode = content;
    }

    class GoChannel {
      buffer: any[] = [];
      resolvers: any[] = [];
      async send(val: any) {
        if (this.resolvers.length > 0) {
          const resolve = this.resolvers.shift();
          resolve(val);
        } else {
          this.buffer.push(val);
        }
      }
      async receive() {
        if (this.buffer.length > 0) {
          return this.buffer.shift();
        }
        return new Promise(resolve => {
          this.resolvers.push(resolve);
        });
      }
    }

    function go_routine(fn: any, ...args: any[]) {
      fn(...args).catch((err: any) => {
        customConsole.error("Goroutine Error:", err);
      });
    }

    const go_time = {
      Second: 1000,
      Millisecond: 1,
      Sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    };

    const __go_scan = async (count: number) => {
      const line = await safeReadStdin();
      const tokens = line.trim().split(/\s+/);
      const parsed = tokens.map(t => (t !== '' && !isNaN(Number(t))) ? Number(t) : t);
      if (count === 1) {
        return parsed[0] !== undefined ? parsed[0] : 0;
      }
      return parsed;
    };

    const __py_input = async (promptMsg?: any) => {
      if (promptMsg !== undefined && promptMsg !== null && promptMsg !== '') {
        customConsole.log(String(promptMsg));
      }
      return await safeReadStdin();
    };

    const prompt = async (msg?: string) => {
      if (msg) customConsole.log(msg);
      return await safeReadStdin();
    };

    const readline = async () => {
      return await safeReadStdin();
    };

    class __GoScanner {
      curText = '';
      async Scan() {
        this.curText = await safeReadStdin();
        return true;
      }
      Text() { return this.curText; }
    }

    const printf = (format: any, ...args: any[]) => {
      if (typeof format !== 'string') {
        customConsole.log(format, ...args);
        return;
      }
      let i = 0;
      const formatted = format.replace(/%([-+0 #]*)?(\d+)?(\.\d+)?([difsScxuXpeEgG%])/g, (match, flags, width, precision, specifier) => {
        if (specifier === '%') return '%';
        if (i >= args.length) return match;
        const val = args[i++];
        if (specifier === 'd' || specifier === 'i' || specifier === 'u') {
          return parseInt(val, 10).toString();
        }
        if (specifier === 'f' || specifier === 'e' || specifier === 'E' || specifier === 'g' || specifier === 'G') {
          const p = precision ? parseInt(precision.substring(1), 10) : undefined;
          return p !== undefined ? Number(val).toFixed(p) : Number(val).toString();
        }
        if (specifier === 's' || specifier === 'S') {
          return String(val);
        }
        if (specifier === 'c') {
          return typeof val === 'number' ? String.fromCharCode(val) : String(val).charAt(0);
        }
        if (specifier === 'x') {
          return Number(val).toString(16);
        }
        if (specifier === 'X') {
          return Number(val).toString(16).toUpperCase();
        }
        return String(val);
      });

      const actualLines = formatted.split('\n');
      for (let l = 0; l < actualLines.length; l++) {
        if (l === actualLines.length - 1 && actualLines[l] === '') continue;
        customConsole.log(actualLines[l]);
      }
    };

    const runner = new Function('console', 'GoChannel', 'go_routine', 'time', 'safeReadStdin', '__go_scan', '__py_input', 'prompt', 'readline', '__GoScanner', 'printf', `
      return (async () => {
        try {
          ${jsCode}
        } catch(e) {
          if (e && (e.message === 'EXECUTION_ABORTED' || e.name === 'AbortError')) {
            throw e;
          }
          console.error(e.message || String(e));
        }
      })();
    `);
    
    await runner(customConsole, GoChannel, go_routine, go_time, safeReadStdin, __go_scan, __py_input, prompt, readline, __GoScanner, printf);

  } catch (err: any) {
    if (err && (err.message === 'EXECUTION_ABORTED' || err.name === 'AbortError')) {
      return {
        output: stdoutLines.join('\n'),
        errors: stderrLines.join('\n'),
        aborted: true
      };
    }
    const printRegex = /(?:console\.log|println|printf|print|puts|Console\.WriteLine|cat|echo|fmt\.Println)\s*\(?\s*(["'`])([\s\S]*?)\1\s*\)?/gi;
    let match;
    let found = false;
    while ((match = printRegex.exec(content)) !== null) {
      if (match[2]) {
        const text = match[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        stdoutLines.push(text);
        if (onOutputLine) onOutputLine(text, 'default');
        found = true;
      }
    }
    if (!found) {
      stderrLines.push(err.message || String(err));
      if (onOutputLine) onOutputLine(err.message || String(err), 'error');
    }
  }

  if (stdoutLines.length === 0 && stderrLines.length === 0) {
    stdoutLines.push(`[CONTAINER SHELL] Executed script successfully.`);
    stdoutLines.push(`Status: 0 (Success)`);
  }

  return {
    output: stdoutLines.join('\n'),
    errors: stderrLines.join('\n')
  };
}
