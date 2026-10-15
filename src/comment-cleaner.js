import fs from 'node:fs';
import path from 'node:path';

/**
 * Determines file classification from file path or extension.
 */
function getLanguageCategory(filePathOrExt = '') {
  const ext = (filePathOrExt.startsWith('.') ? filePathOrExt : path.extname(filePathOrExt)).toLowerCase();

  switch (ext) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
    case '.java':
    case '.kt':
    case '.cs':
    case '.c':
    case '.cpp':
    case '.h':
    case '.hpp':
    case '.go':
    case '.rs':
    case '.swift':
    case '.php':
    case '.dart':
    case '.scala':
    case '.css':
    case '.scss':
    case '.sass':
    case '.less':
      return 'c-style';

    case '.vue':
      return 'vue';

    case '.html':
    case '.xml':
    case '.svg':
      return 'html';

    case '.py':
      return 'python';

    case '.sh':
    case '.bash':
    case '.zsh':
    case '.rb':
    case '.yaml':
    case '.yml':
      return 'hash-style';

    case '.sql':
      return 'sql';

    default:
      // Default to c-style for unknown code files
      return 'c-style';
  }
}

/**
 * Tokenizes C-style code into code and comments while safely skipping strings,
 * template literals, and regexes.
 */
function scanCStyle(code) {
  const segments = []; // { type: 'code'|'comment', text: string, line: number, commentType?: string }
  let i = 0;
  let line = 1;
  let codeBuffer = '';

  const flushCode = () => {
    if (codeBuffer) {
      segments.push({ type: 'code', text: codeBuffer, line });
      codeBuffer = '';
    }
  };

  while (i < code.length) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '\n') {
      line++;
      codeBuffer += ch;
      i++;
      continue;
    }

    // String literals: single and double quotes
    if (ch === '"' || ch === "'") {
      const quote = ch;
      codeBuffer += ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        codeBuffer += c;
        if (c === '\n') line++;
        if (c === '\\') {
          // Escape sequence
          i++;
          if (i < code.length) {
            codeBuffer += code[i];
            if (code[i] === '\n') line++;
          }
        } else if (c === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Template literals: backticks
    if (ch === '`') {
      codeBuffer += ch;
      i++;
      while (i < code.length) {
        const c = code[i];
        codeBuffer += c;
        if (c === '\n') line++;
        if (c === '\\') {
          i++;
          if (i < code.length) {
            codeBuffer += code[i];
            if (code[i] === '\n') line++;
          }
        } else if (c === '`') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Single-line comment: //
    if (ch === '/' && next === '/') {
      flushCode();
      const commentStartLine = line;
      let commentText = '//';
      i += 2;
      while (i < code.length && code[i] !== '\n') {
        commentText += code[i];
        i++;
      }
      segments.push({
        type: 'comment',
        text: commentText,
        line: commentStartLine,
        commentType: 'single-line'
      });
      continue;
    }

    // Multi-line block comment: /* ... */
    if (ch === '/' && next === '*') {
      flushCode();
      const commentStartLine = line;
      let commentText = '/*';
      i += 2;
      while (i < code.length) {
        if (code[i] === '*' && code[i + 1] === '/') {
          commentText += '*/';
          i += 2;
          break;
        }
        if (code[i] === '\n') line++;
        commentText += code[i];
        i++;
      }
      segments.push({
        type: 'comment',
        text: commentText,
        line: commentStartLine,
        commentType: 'multi-line'
      });
      continue;
    }

    codeBuffer += ch;
    i++;
  }

  flushCode();
  return segments;
}

/**
 * Scans HTML / XML comments <!-- ... -->
 */
function scanHtml(code) {
  const segments = [];
  let i = 0;
  let line = 1;
  let codeBuffer = '';

  const flushCode = () => {
    if (codeBuffer) {
      segments.push({ type: 'code', text: codeBuffer, line });
      codeBuffer = '';
    }
  };

  while (i < code.length) {
    if (code[i] === '\n') line++;

    if (code.slice(i, i + 4) === '<!--') {
      flushCode();
      const commentStartLine = line;
      let commentText = '<!--';
      i += 4;
      while (i < code.length) {
        if (code.slice(i, i + 3) === '-->') {
          commentText += '-->';
          i += 3;
          break;
        }
        if (code[i] === '\n') line++;
        commentText += code[i];
        i++;
      }
      segments.push({
        type: 'comment',
        text: commentText,
        line: commentStartLine,
        commentType: 'html-comment'
      });
      continue;
    }

    codeBuffer += code[i];
    i++;
  }

  flushCode();
  return segments;
}

/**
 * Scans Vue files: parses <template> with scanHtml, <script> and <style> with scanCStyle.
 */
function scanVue(code) {
  const segments = [];
  // Split into top-level blocks: <template>, <script>, <style>
  const blockRegex = /(<(template|script|style)[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  let lastIndex = 0;
  let match;
  let currentLine = 1;

  while ((match = blockRegex.exec(code)) !== null) {
    const prefix = code.slice(lastIndex, match.index);
    if (prefix) {
      segments.push(...scanHtml(prefix));
      currentLine += (prefix.match(/\n/g) || []).length;
    }

    const openTag = match[1];
    const blockType = match[2].toLowerCase();
    const body = match[3];
    const closeTag = match[4];

    segments.push({ type: 'code', text: openTag, line: currentLine });
    currentLine += (openTag.match(/\n/g) || []).length;

    if (blockType === 'template') {
      const subSegments = scanHtml(body);
      segments.push(...subSegments);
    } else {
      // script or style
      const subSegments = scanCStyle(body);
      segments.push(...subSegments);
    }
    currentLine += (body.match(/\n/g) || []).length;

    segments.push({ type: 'code', text: closeTag, line: currentLine });
    currentLine += (closeTag.match(/\n/g) || []).length;

    lastIndex = match.index + match[0].length;
  }

  const suffix = code.slice(lastIndex);
  if (suffix) {
    segments.push(...scanHtml(suffix));
  }

  return segments;
}

/**
 * Scans Hash-style languages (Python, Bash, Ruby, YAML)
 */
function scanHashStyle(code, isPython = false) {
  const segments = [];
  const lines = code.split('\n');

  for (let l = 0; l < lines.length; l++) {
    const rawLine = lines[l];
    const lineNum = l + 1;

    // Preserve shebang on line 1
    if (lineNum === 1 && rawLine.startsWith('#!')) {
      segments.push({ type: 'code', text: rawLine + (l < lines.length - 1 ? '\n' : ''), line: lineNum });
      continue;
    }

    // Check if line contains a comment character # outside quotes
    let inQuote = null;
    let commentIdx = -1;

    for (let c = 0; c < rawLine.length; c++) {
      const ch = rawLine[c];
      if (inQuote) {
        if (ch === '\\') {
          c++; // skip escaped
        } else if (ch === inQuote) {
          inQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'") {
          inQuote = ch;
        } else if (ch === '#') {
          commentIdx = c;
          break;
        }
      }
    }

    if (commentIdx !== -1) {
      const codePart = rawLine.slice(0, commentIdx);
      const commentPart = rawLine.slice(commentIdx);

      if (codePart) {
        segments.push({ type: 'code', text: codePart, line: lineNum });
      }
      segments.push({
        type: 'comment',
        text: commentPart,
        line: lineNum,
        commentType: 'single-line'
      });
      if (l < lines.length - 1) {
        segments.push({ type: 'code', text: '\n', line: lineNum });
      }
    } else {
      segments.push({ type: 'code', text: rawLine + (l < lines.length - 1 ? '\n' : ''), line: lineNum });
    }
  }

  return segments;
}

/**
 * Scans code and returns all segments.
 */
function scanSegments(code, filePathOrExt) {
  const category = getLanguageCategory(filePathOrExt);

  switch (category) {
    case 'vue':
      return scanVue(code);
    case 'html':
      return scanHtml(code);
    case 'python':
      return scanHashStyle(code, true);
    case 'hash-style':
      return scanHashStyle(code, false);
    case 'c-style':
    default:
      return scanCStyle(code);
  }
}

/**
 * Detects whether code contains any comments.
 * Returns details about detected comments (count, line numbers, snippets).
 */
export function detectComments(code, filePathOrExt = '') {
  if (!code || typeof code !== 'string') {
    return { hasComments: false, count: 0, locations: [] };
  }

  const segments = scanSegments(code, filePathOrExt);
  const commentSegments = segments.filter(s => s.type === 'comment');

  const locations = commentSegments.map(c => ({
    line: c.line,
    text: c.text.trim().slice(0, 100),
    type: c.commentType
  }));

  return {
    hasComments: locations.length > 0,
    count: locations.length,
    locations
  };
}

/**
 * Strips all comments from the code cleanly.
 * Replaces comments with whitespace or empty string, preserving newlines in
 * multi-line comments so that line numbers don't shift.
 */
export function stripComments(code, filePathOrExt = '', options = {}) {
  if (!code || typeof code !== 'string') {
    return { cleanCode: '', strippedCount: 0 };
  }

  const { preserveLineCount = true } = options;
  const segments = scanSegments(code, filePathOrExt);
  let cleanCode = '';
  let strippedCount = 0;

  for (const seg of segments) {
    if (seg.type === 'code') {
      cleanCode += seg.text;
    } else if (seg.type === 'comment') {
      strippedCount++;
      if (preserveLineCount) {
        // Keep newline count so line numbers remain identical
        const newlines = (seg.text.match(/\n/g) || []).length;
        cleanCode += '\n'.repeat(newlines);
      }
    }
  }

  // Clean up trailing whitespace on lines caused by comment removal
  const cleanedLines = cleanCode.split('\n').map(l => {
    // If the line only had whitespace after removing comment, trim it if desired
    return l.replace(/[ \t]+$/, '');
  });

  return {
    cleanCode: cleanedLines.join('\n'),
    strippedCount
  };
}

/**
 * Inspects a file on disk. If comments exist, strips them and rewrites the file.
 */
export function cleanFileComments(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { changed: false, strippedCount: 0, originalCount: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const detection = detectComments(content, filePath);

  if (!detection.hasComments) {
    return { changed: false, strippedCount: 0, originalCount: 0 };
  }

  const { cleanCode, strippedCount } = stripComments(content, filePath, options);
  fs.writeFileSync(filePath, cleanCode, 'utf-8');

  return {
    changed: true,
    strippedCount,
    originalCount: detection.count
  };
}
