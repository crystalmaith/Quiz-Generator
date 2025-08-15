import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Robust PDF text extraction with decompression support
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Starting robust PDF text extraction...');
    
    const uint8Array = new Uint8Array(pdfBuffer);
    console.log(`PDF buffer size: ${uint8Array.length} bytes`);
    
    // Convert to string for pattern matching
    const pdfString = Array.from(uint8Array)
      .map(byte => String.fromCharCode(byte))
      .join('');
    
    let extractedText = '';
    let debugInfo = {
      textObjects: 0,
      streams: 0,
      decompressed: 0,
      plainText: 0
    };
    
    console.log('Extracting text from PDF objects...');
    
    // Method 1: Extract from PDF objects with proper stream handling
    const objRegex = /(\d+)\s+(\d+)\s+obj\s*([\s\S]*?)\s*endobj/g;
    let objMatch;
    
    while ((objMatch = objRegex.exec(pdfString)) !== null) {
      const objContent = objMatch[3];
      
      // Look for streams in objects
      const streamMatch = objContent.match(/stream\s*\n([\s\S]*?)\nendstream/);
      if (streamMatch) {
        debugInfo.streams++;
        const streamData = streamMatch[1];
        
        // Try to decompress if it has filters
        let decompressedText = '';
        if (objContent.includes('/FlateDecode')) {
          decompressedText = await tryDecompressFlate(streamData);
          if (decompressedText) {
            debugInfo.decompressed++;
            extractedText += extractTextFromDecompressed(decompressedText) + ' ';
          }
        } else {
          // Try direct text extraction from uncompressed stream
          decompressedText = extractTextFromRawStream(streamData);
          if (decompressedText) {
            extractedText += decompressedText + ' ';
          }
        }
      }
      
      // Also check object content directly for text
      const directText = extractDirectText(objContent);
      if (directText) {
        extractedText += directText + ' ';
      }
    }
    
    // Method 2: Look for text objects (BT...ET) in the entire document
    console.log('Extracting from text objects...');
    const textObjRegex = /BT\s+([\s\S]*?)\s+ET/g;
    let textMatch;
    
    while ((textMatch = textObjRegex.exec(pdfString)) !== null) {
      debugInfo.textObjects++;
      const textContent = textMatch[1];
      const extractedFromObj = extractTextFromTextObject(textContent);
      if (extractedFromObj) {
        extractedText += extractedFromObj + ' ';
      }
    }
    
    // Method 3: Direct search for readable text patterns
    console.log('Looking for direct text patterns...');
    const readableText = extractReadableTextPatterns(pdfString);
    if (readableText) {
      debugInfo.plainText++;
      extractedText += readableText + ' ';
    }
    
    // Method 4: Try alternative encodings for the entire content
    if (extractedText.length < 50) {
      console.log('Trying alternative text extraction methods...');
      const altText = extractWithAlternativeEncodings(uint8Array);
      if (altText.length > extractedText.length) {
        extractedText = altText;
      }
    }
    
    // Clean and process the final text
    extractedText = cleanExtractedText(extractedText);
    
    console.log('Extraction debug info:', debugInfo);
    console.log(`Final text length: ${extractedText.length}`);
    console.log(`First 300 chars: ${extractedText.substring(0, 300)}`);
    
    if (extractedText.trim().length < 10) {
      return 'Unable to extract readable text from this PDF. It may be image-based, heavily compressed, or use unsupported encoding. Please try copying and pasting the text manually, or convert the PDF to a text-friendly format.';
    }
    
    return extractedText.trim();
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return 'Error extracting text from PDF: ' + error.message;
  }
}

// Try to decompress FlateDecode streams (basic implementation)
async function tryDecompressFlate(streamData: string): Promise<string> {
  try {
    // Convert string back to bytes
    const bytes = new Uint8Array(streamData.length);
    for (let i = 0; i < streamData.length; i++) {
      bytes[i] = streamData.charCodeAt(i);
    }
    
    // Try to decompress using DecompressionStream if available
    try {
      const stream = new DecompressionStream('deflate');
      const writer = stream.writable.getWriter();
      const reader = stream.readable.getReader();
      
      writer.write(bytes);
      writer.close();
      
      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(result.value);
      }
      
      const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
      }
      
      return new TextDecoder('latin1').decode(decompressed);
    } catch (e) {
      console.log('Decompression failed, trying raw extraction:', e.message);
      return '';
    }
  } catch (error) {
    console.log('FlateDecode decompression failed:', error.message);
    return '';
  }
}

// Extract text from decompressed stream content
function extractTextFromDecompressed(content: string): string {
  let text = '';
  
  // Look for text operators in decompressed content
  const patterns = [
    /BT\s+([\s\S]*?)\s+ET/g,  // Text objects
    /\(((?:[^\\()]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*Tj/g,  // Simple text
    /\[((?:\([^)]*\)\s*(?:-?\d+(?:\.\d+)?\s*)?)*)\]\s*TJ/g,  // Array text
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes('BT')) {
        text += extractTextFromTextObject(match[1]) + ' ';
      } else if (pattern.source.includes('\\[')) {
        // Handle TJ arrays
        const arrayContent = match[1];
        const textMatches = arrayContent.match(/\(([^)]*)\)/g);
        if (textMatches) {
          textMatches.forEach(tm => {
            const decoded = decodePDFString(tm.slice(1, -1));
            if (decoded && isValidText(decoded)) {
              text += decoded + ' ';
            }
          });
        }
      } else {
        const decoded = decodePDFString(match[1]);
        if (decoded && isValidText(decoded)) {
          text += decoded + ' ';
        }
      }
    }
  });
  
  return text;
}

// Extract text from raw stream data
function extractTextFromRawStream(streamData: string): string {
  let text = '';
  
  // Look for parentheses-enclosed text that might be readable
  const textPattern = /\(([^)]{1,})\)/g;
  let match;
  
  while ((match = textPattern.exec(streamData)) !== null) {
    const decoded = decodePDFString(match[1]);
    if (decoded && isValidText(decoded)) {
      text += decoded + ' ';
    }
  }
  
  return text;
}

// Extract text from PDF text objects
function extractTextFromTextObject(textContent: string): string {
  let text = '';
  
  // All text showing operators
  const operators = [
    /\(((?:[^\\()]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*Tj/g,
    /\(((?:[^\\()]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*'/g,
    /\(((?:[^\\()]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*"/g,
    /\[((?:\([^)]*\)\s*(?:-?\d+(?:\.\d+)?\s*)?)*)\]\s*TJ/g,
  ];
  
  operators.forEach(regex => {
    let match;
    while ((match = regex.exec(textContent)) !== null) {
      if (regex.source.includes('\\[')) {
        // Handle TJ array
        const arrayContent = match[1];
        const textMatches = arrayContent.match(/\(([^)]*)\)/g);
        if (textMatches) {
          textMatches.forEach(tm => {
            const decoded = decodePDFString(tm.slice(1, -1));
            if (decoded && isValidText(decoded)) {
              text += decoded + ' ';
            }
          });
        }
      } else {
        const decoded = decodePDFString(match[1]);
        if (decoded && isValidText(decoded)) {
          text += decoded + ' ';
        }
      }
    }
  });
  
  return text;
}

// Extract direct text from object content
function extractDirectText(objContent: string): string {
  let text = '';
  
  // Look for various text patterns
  const patterns = [
    /\/Title\s*\(([^)]+)\)/g,
    /\/Subject\s*\(([^)]+)\)/g,
    /\/Author\s*\(([^)]+)\)/g,
    /\/Contents\s*\(([^)]+)\)/g,
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(objContent)) !== null) {
      const decoded = decodePDFString(match[1]);
      if (decoded && isValidText(decoded)) {
        text += decoded + ' ';
      }
    }
  });
  
  return text;
}

// Look for readable text patterns in the entire PDF
function extractReadableTextPatterns(pdfString: string): string {
  let text = '';
  
  // Look for sequences of readable characters
  const readablePattern = /[A-Za-z][A-Za-z0-9\s.,;:!?'"()&-]{15,}/g;
  const matches = pdfString.match(readablePattern);
  
  if (matches) {
    const validMatches = matches
      .filter(match => {
        // Filter out PDF commands and binary data
        return !match.includes('endobj') && 
               !match.includes('stream') && 
               !match.includes('xref') &&
               !match.match(/^[0-9\s]+$/) &&
               isValidText(match);
      })
      .slice(0, 100); // Limit to prevent overwhelming output
    
    text = validMatches.join(' ');
  }
  
  return text;
}

// Try alternative encodings
function extractWithAlternativeEncodings(uint8Array: Uint8Array): string {
  const encodings = ['utf-8', 'latin1', 'ascii'];
  let bestText = '';
  
  for (const encoding of encodings) {
    try {
      const decoded = new TextDecoder(encoding).decode(uint8Array);
      const extracted = extractReadableTextPatterns(decoded);
      
      if (extracted.length > bestText.length) {
        bestText = extracted;
      }
    } catch (e) {
      // Encoding failed, continue with next
    }
  }
  
  return bestText;
}

// Decode PDF string with escape sequences
function decodePDFString(text: string): string {
  if (!text) return '';
  
  try {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\([0-7]{1,3})/g, (_, octal) => {
        const code = parseInt(octal, 8);
        return code > 31 && code < 127 ? String.fromCharCode(code) : '';
      })
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
  } catch (e) {
    return text;
  }
}

// Check if text is valid readable content
function isValidText(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  // Must contain letters
  if (!/[a-zA-Z]/.test(text)) return false;
  
  // Should not be mostly control characters or symbols
  const printableCount = (text.match(/[a-zA-Z0-9\s.,;:!?'"()&-]/g) || []).length;
  if (printableCount / text.length < 0.5) return false;
  
  // Exclude common PDF artifacts
  const artifacts = ['endobj', 'endstream', 'stream', 'xref', 'obj', 'Type', 'Font'];
  return !artifacts.some(artifact => text.includes(artifact));
}

// Clean and format extracted text
function cleanExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/\n+/g, '\n')          // Normalize line breaks
    .replace(/[^\x20-\x7E\n\r\t]/g, '') // Remove non-printable characters
    .trim();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (file.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ error: 'File must be a PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing PDF file: ${file.name}, size: ${file.size} bytes`);
    
    // Get file buffer and extract text
    const fileBuffer = await file.arrayBuffer();
    const extractedText = await extractTextFromPDF(fileBuffer);
    
    console.log(`Final extracted text length: ${extractedText.length} characters`);

    return new Response(
      JSON.stringify({ 
        text: extractedText,
        filename: file.name,
        size: file.size 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-pdf-text function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});