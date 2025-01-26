import { Character } from '@/types/generator';

// Transform long lines into readable chunks
const wrapText = (text: string, maxWidth: number = 80): string[] => {
    const lines: string[] = [];
    let currentLine = '';
    let indentLevel = 0;
  
    text.split('\n').forEach(line => {
      const match = line.match(/^(\s*)/);
      if (match) {
        indentLevel = match[1].length;
      }
  
      const words = line.split(' ');
      let currentLineLength = indentLevel;
  
      words.forEach(word => {
        if (currentLineLength + word.length + 1 > maxWidth) {
          lines.push(currentLine);
          currentLine = ' '.repeat(indentLevel) + word;
          currentLineLength = indentLevel + word.length;
        } else {
          currentLine += (currentLine.length > 0 ? ' ' : '') + word;
          currentLineLength += word.length + 1;
        }
      });
  
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
    });
  
    return lines;
 };
 
 // Calculate indentation level for a line
 const calculateIndentation = (line: string): number => {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length * 8 : 0;
 };
 
 const splitLongText = (text: string, maxWidth: number = 80): string[] => {
    const chunks: string[] = [];
    let prefix = '';
    const hasComma = text.endsWith(',');
  
    // Get the key part if exists (e.g., "bio": )
    if (text.includes('": "')) {
      const colonIndex = text.indexOf(':');
      prefix = text.substring(0, colonIndex + 2);
      text = text.substring(colonIndex + 2);
      // Remove start and end quotes
      text = text.replace(/^"|"$/g, '');
    }
  
    // Add the prefix (key part) to first chunk
    if (prefix) chunks.push(prefix);
  
    // Remove comma if exists
    if (hasComma) text = text.slice(0, -1);
  
    // Handle text splitting
    let currentChunk = '';
    const words = text.split(' ');
  
    for (const word of words) {
      if ((currentChunk + ' ' + word).length > maxWidth) {
        if (chunks.length === 1) {
          chunks.push(`"${currentChunk}`);
        } else {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }
  
    // Handle the last chunk
    if (currentChunk) {
      if (chunks.length === 1) {
        chunks.push(`"${currentChunk}"${hasComma ? ',' : ''}`);
      } else {
        chunks.push(`${currentChunk}"${hasComma ? ',' : ''}`);
      }
    }
  
    return chunks;
  };
 
 // Process JSON line and handle long string values
 const processJsonLine = (line: string): { text: string; indent: number }[] => {
  const indent = calculateIndentation(line);
  const text = line.trim();
  const maxWidth = 80;
  
  if ((text.includes('": "') || (text.startsWith('"') && text.length > 2)) && text.length > maxWidth) {
    const chunks = splitLongText(text, maxWidth);
    return chunks.map((chunk, index) => ({
      text: chunk,
      indent: indent + (index > 0 ? 16 : 0)
    }));
  }
  
  return [{ text, indent }];
 };
 
 // Encode special characters for XML
 const encodeXmlEntities = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
 };
 
 // Create SVG from JSON data
 export const createJsonSvg = (jsonData: Character | null): string => {
    if (!jsonData) return '';
    
    const jsonString = JSON.stringify(jsonData, null, 2);
    const rawLines = jsonString.split('\n');
    const processedLines: { text: string; indent: number }[] = [];
    
    rawLines.forEach(line => {
      const processed = processJsonLine(line);
      processedLines.push(...processed);
    });
    
    const lineHeight = 20;
    const basePadding = 40;
    const totalHeight = (processedLines.length * lineHeight) + (basePadding * 2);
    
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${totalHeight}" viewBox="0 0 1000 ${totalHeight}">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Space+Mono&amp;display=swap');
            .content {
              font-family: 'Space Mono', monospace;
              font-size: 14px;
            }
            .background { fill: #ffffff; }
            .text { fill: #0052ff; }
          </style>
        </defs>
        <rect class="background" width="100%" height="100%" />
        <text class="content">
          ${processedLines.map((line, i) => 
            `<tspan x="${basePadding + line.indent}" y="${basePadding + (i * lineHeight)}" class="text">${
              encodeXmlEntities(line.text)
            }</tspan>`
          ).join('\n')}
        </text>
      </svg>`;
 };