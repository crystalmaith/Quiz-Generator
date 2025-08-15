import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced PDF text extraction function
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');
    
    const uint8Array = new Uint8Array(pdfBuffer);
    console.log(`PDF buffer size: ${uint8Array.length} bytes`);
    
    // Convert to string for pattern matching
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    
    let extractedText = '';
    
    // Method 1: Extract text from text objects (BT...ET blocks)
    const textObjectRegex = /BT\s+([\s\S]*?)\s+ET/g;
    let match;
    
    while ((match = textObjectRegex.exec(pdfString)) !== null) {
      const textBlock = match[1];
      extractedText += extractTextFromBlock(textBlock) + ' ';
    }
    
    // Method 2: Extract from Tj and TJ operators
    const tjRegex = /\(((?:[^()\\]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*Tj/g;
    while ((match = tjRegex.exec(pdfString)) !== null) {
      const text = decodeText(match[1]);
      if (text && text.length > 1) {
        extractedText += text + ' ';
      }
    }
    
    // Method 3: Extract from TJ arrays
    const tjArrayRegex = /\[\s*((?:\([^)]*\)\s*(?:-?\d+(?:\.\d+)?\s*)?)*)\]\s*TJ/g;
    while ((match = tjArrayRegex.exec(pdfString)) !== null) {
      const arrayContent = match[1];
      const textMatches = arrayContent.match(/\(([^)]*)\)/g);
      if (textMatches) {
        textMatches.forEach(textMatch => {
          const text = decodeText(textMatch.slice(1, -1));
          if (text && text.length > 1) {
            extractedText += text + ' ';
          }
        });
      }
    }
    
    // Method 4: Look for readable text in streams
    const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
    while ((match = streamRegex.exec(pdfString)) !== null) {
      const streamContent = match[1];
      
      // Look for text patterns in the stream
      const readableText = extractReadableFromStream(streamContent);
      if (readableText) {
        extractedText += readableText + ' ';
      }
    }
    
    // Clean up the extracted text
    extractedText = cleanExtractedText(extractedText);
    
    console.log(`Extracted text length: ${extractedText.length}`);
    console.log(`First 200 characters: ${extractedText.substring(0, 200)}`);
    
    if (extractedText.trim().length < 20) {
      return 'Unable to extract readable text from this PDF. It may be image-based, encrypted, or use an unsupported encoding. Please try copying and pasting the text manually.';
    }
    
    return extractedText.trim();
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return 'Error extracting text from PDF. Please try pasting the text manually.';
  }
}

function extractTextFromBlock(textBlock: string): string {
  let text = '';
  
  // Look for text showing operators
  const patterns = [
    /\(([^)]+)\)\s*Tj/g,           // Simple text show
    /\[([^\]]+)\]\s*TJ/g,         // Array text show
    /\(([^)]+)\)\s*'/g,           // Text with next line
    /\(([^)]+)\)\s*"/g            // Text with spacing
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(textBlock)) !== null) {
      let content = match[1];
      
      if (pattern.source.includes('\\]')) {
        // Handle array format
        const strings = content.match(/\(([^)]+)\)/g);
        if (strings) {
          strings.forEach(str => {
            const clean = decodeText(str.slice(1, -1));
            if (clean) text += clean + ' ';
          });
        }
      } else {
        const clean = decodeText(content);
        if (clean) text += clean + ' ';
      }
    }
  });
  
  return text;
}

function decodeText(text: string): string {
  if (!text) return '';
  
  // Decode PDF escape sequences
  let decoded = text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  
  // Check if it's readable text
  if (!/^[\x20-\x7E\s]*$/.test(decoded)) {
    return '';
  }
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(decoded)) {
    return '';
  }
  
  return decoded;
}

function extractReadableFromStream(streamContent: string): string {
  let text = '';
  
  // Look for parentheses-enclosed text
  const textMatches = streamContent.match(/\(([^)]{2,})\)/g);
  if (textMatches) {
    textMatches.forEach(match => {
      const content = decodeText(match.slice(1, -1));
      if (content && content.length > 1) {
        text += content + ' ';
      }
    });
  }
  
  return text;
}

async function extractFromStreams(pdfString: string): Promise<string> {
  let text = '';
  const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
  let match;
  let count = 0;
  
  while ((match = streamRegex.exec(pdfString)) !== null && count < 100) {
    count++;
    const streamContent = match[1];
    
    // Try to decompress if it looks like compressed data
    if (streamContent.includes('BT') && streamContent.includes('ET')) {
      text += extractTextFromTextObject(streamContent) + ' ';
    }
    
    // Look for readable text patterns
    const readableText = streamContent.match(/\(([^)]{2,})\)/g);
    if (readableText) {
      readableText.forEach(t => {
        const clean = t.replace(/[()]/g, '');
        if (isReadableText(clean)) {
          text += clean + ' ';
        }
      });
    }
  }
  
  console.log(`Extracted ${text.length} characters from ${count} streams`);
  return text;
}

async function extractFromContentStreams(pdfString: string): Promise<string> {
  let text = '';
  
  // Look for text objects (BT...ET)
  const textObjectRegex = /BT\s+([\s\S]*?)\s+ET/g;
  let match;
  let count = 0;
  
  while ((match = textObjectRegex.exec(pdfString)) !== null && count < 100) {
    count++;
    text += extractTextFromTextObject(match[1]) + ' ';
  }
  
  console.log(`Extracted ${text.length} characters from ${count} text objects`);
  return text;
}

function extractTextFromTextObject(textBlock: string): string {
  let text = '';
  
  // Different text showing operators
  const patterns = [
    /\(([^)]+)\)\s*Tj/g,           // Simple text show
    /\[([^\]]+)\]\s*TJ/g,         // Array text show
    /\(([^)]+)\)\s*'/g,           // Text with next line
    /\(([^)]+)\)\s*"/g,           // Text with spacing
    /'([^']+)'/g,                 // Single quoted text
    /"([^"]+)"/g                  // Double quoted text
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(textBlock)) !== null) {
      let content = match[1];
      
      if (pattern.source.includes('\\]')) {
        // Handle array format - extract all strings
        const strings = content.match(/\(([^)]+)\)/g);
        if (strings) {
          strings.forEach(str => {
            const clean = str.replace(/[()]/g, '');
            if (isReadableText(clean)) {
              text += clean + ' ';
            }
          });
        }
      } else {
        if (isReadableText(content)) {
          text += content + ' ';
        }
      }
    }
  });
  
  return text;
}

async function extractFromObjects(pdfString: string): Promise<string> {
  let text = '';
  
  // Look for PDF objects that might contain text
  const objRegex = /\d+\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/g;
  let match;
  let count = 0;
  
  while ((match = objRegex.exec(pdfString)) !== null && count < 50) {
    count++;
    const objContent = match[1];
    
    // Look for text content in the object
    if (objContent.includes('/Type') && (objContent.includes('/Page') || objContent.includes('/Font'))) {
      const textMatches = objContent.match(/\(([^)]{3,})\)/g);
      if (textMatches) {
        textMatches.forEach(t => {
          const clean = t.replace(/[()]/g, '');
          if (isReadableText(clean)) {
            text += clean + ' ';
          }
        });
      }
    }
  }
  
  console.log(`Extracted ${text.length} characters from ${count} objects`);
  return text;
}

async function extractPlainTextPatterns(pdfString: string): Promise<string> {
  let text = '';
  
  // Look for words and sentences that might be embedded as plain text
  const wordPattern = /\b[A-Za-z][A-Za-z0-9\s.,;:!?'"'-]{10,}\b/g;
  const matches = pdfString.match(wordPattern);
  
  if (matches) {
    const filtered = matches
      .filter(m => {
        // Filter out binary data and commands
        return !m.match(/[^\x20-\x7E\n\r\t]/) && 
               m.trim().split(/\s+/).length > 2 &&
               /[a-zA-Z]{3,}/.test(m);
      })
      .slice(0, 200); // Limit matches
    
    text = filtered.join(' ');
    console.log(`Extracted ${text.length} characters from plain text patterns`);
  }
  
  return text;
}

async function extractAlternative(uint8Array: Uint8Array): Promise<string> {
  // Last resort: try to find any readable ASCII text
  let text = '';
  let currentWord = '';
  
  for (let i = 0; i < Math.min(uint8Array.length, 1000000); i++) { // Limit to 1MB
    const byte = uint8Array[i];
    
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13) {
      // Printable ASCII or line breaks
      currentWord += String.fromCharCode(byte);
    } else {
      if (currentWord.length > 3 && /[a-zA-Z]{3,}/.test(currentWord)) {
        text += currentWord + ' ';
      }
      currentWord = '';
    }
    
    // Prevent infinite processing
    if (text.length > 50000) break;
  }
  
  // Add the last word if valid
  if (currentWord.length > 3 && /[a-zA-Z]{3,}/.test(currentWord)) {
    text += currentWord;
  }
  
  console.log(`Alternative extraction found ${text.length} characters`);
  return text;
}

function isReadableText(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  // Must contain letters
  if (!/[a-zA-Z]/.test(text)) return false;
  
  // Must not be just numbers and punctuation
  if (/^[\d\s\.\-,;:!?()]+$/.test(text)) return false;
  
  // Must not contain too many non-printable characters
  const nonPrintable = text.match(/[^\x20-\x7E\n\r\t]/g);
  if (nonPrintable && nonPrintable.length > text.length * 0.3) return false;
  
  return true;
}

function cleanExtractedText(text: string): string {
  return text
    // Decode common PDF escape sequences
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r') 
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    // Clean up spacing
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    // Remove excessive newlines
    .replace(/\n{3,}/g, '\n\n')
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
    
    console.log(`Extracted text length: ${extractedText.length} characters`);
    console.log(`First 200 characters: ${extractedText.substring(0, 200)}...`);

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