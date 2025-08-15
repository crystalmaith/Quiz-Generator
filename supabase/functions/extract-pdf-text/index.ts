import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive PDF text extraction function
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Starting comprehensive PDF text extraction...');
    
    const uint8Array = new Uint8Array(pdfBuffer);
    console.log(`PDF buffer size: ${uint8Array.length} bytes`);
    
    // Convert to string using latin1 for better binary handling
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    
    let extractedText = '';
    let debugInfo = {
      textObjects: 0,
      tjOperators: 0,
      streamObjects: 0,
      plainTextMatches: 0
    };
    
    // Method 1: Extract from BT...ET text objects with all text operators
    console.log('Method 1: Extracting from text objects...');
    const textObjectRegex = /BT\s+([\s\S]*?)\s+ET/g;
    let match;
    
    while ((match = textObjectRegex.exec(pdfString)) !== null) {
      debugInfo.textObjects++;
      const textBlock = match[1];
      const blockText = extractFromTextBlock(textBlock);
      if (blockText) {
        extractedText += blockText + ' ';
      }
    }
    
    // Method 2: Direct Tj operator extraction
    console.log('Method 2: Extracting Tj operators...');
    const tjRegex = /\(((?:[^\\()]|\\[\\()nrtbf]|\\[0-7]{1,3})*)\)\s*Tj/g;
    while ((match = tjRegex.exec(pdfString)) !== null) {
      debugInfo.tjOperators++;
      const text = decodePDFText(match[1]);
      if (text && isReadableText(text)) {
        extractedText += text + ' ';
      }
    }
    
    // Method 3: TJ array extraction
    console.log('Method 3: Extracting TJ arrays...');
    const tjArrayRegex = /\[\s*((?:\([^)]*\)\s*(?:-?\d+(?:\.\d+)?\s*)?)*)\]\s*TJ/g;
    while ((match = tjArrayRegex.exec(pdfString)) !== null) {
      const arrayContent = match[1];
      const textMatches = arrayContent.match(/\(([^)]*)\)/g);
      if (textMatches) {
        textMatches.forEach(textMatch => {
          const text = decodePDFText(textMatch.slice(1, -1));
          if (text && isReadableText(text)) {
            extractedText += text + ' ';
          }
        });
      }
    }
    
    // Method 4: Stream content extraction
    console.log('Method 4: Extracting from streams...');
    const streamRegex = /stream\s*\n([\s\S]*?)\nendstream/g;
    while ((match = streamRegex.exec(pdfString)) !== null) {
      debugInfo.streamObjects++;
      const streamContent = match[1];
      
      // Look for text patterns in uncompressed streams
      const streamText = extractFromStream(streamContent);
      if (streamText) {
        extractedText += streamText + ' ';
      }
    }
    
    // Method 5: Look for plain readable text patterns
    console.log('Method 5: Looking for plain text patterns...');
    const plainTextRegex = /[A-Za-z]{3,}[\w\s.,;:!?'"()&-]{20,}/g;
    const plainMatches = pdfString.match(plainTextRegex);
    if (plainMatches) {
      debugInfo.plainTextMatches = plainMatches.length;
      plainMatches.slice(0, 50).forEach(match => {
        if (isReadableText(match) && !match.includes('endobj') && !match.includes('stream')) {
          extractedText += match + ' ';
        }
      });
    }
    
    // Method 6: Alternative byte-by-byte extraction for edge cases
    if (extractedText.length < 50) {
      console.log('Method 6: Trying byte-by-byte extraction...');
      const alternativeText = extractAlternativeMethod(uint8Array);
      if (alternativeText.length > extractedText.length) {
        extractedText = alternativeText;
      }
    }
    
    // Clean and deduplicate
    extractedText = cleanAndDeduplicateText(extractedText);
    
    console.log('Debug info:', debugInfo);
    console.log(`Final extracted text length: ${extractedText.length}`);
    console.log(`First 300 characters: ${extractedText.substring(0, 300)}`);
    
    if (extractedText.trim().length < 10) {
      console.log('No readable text found. PDF may be image-based or encrypted.');
      return 'This PDF appears to be image-based, encrypted, or uses a format not supported by this extractor. Please try copying and pasting the text manually, or use an OCR tool for image-based PDFs.';
    }
    
    return extractedText.trim();
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return 'Error extracting text from PDF. Please try pasting the text manually.';
  }
}

function extractFromTextBlock(textBlock: string): string {
  let text = '';
  
  // All PDF text showing operators
  const operators = [
    /\(([^)]*)\)\s*Tj/g,                    // Show text
    /\(([^)]*)\)\s*'/g,                     // Move to next line and show text
    /\(([^)]*)\)\s*"/g,                     // Set word and character spacing, move to next line, and show text
    /\[((?:\([^)]*\)\s*(?:-?\d+(?:\.\d+)?\s*)?)*)\]\s*TJ/g,  // Show text with individual glyph positioning
  ];
  
  operators.forEach(regex => {
    let match;
    while ((match = regex.exec(textBlock)) !== null) {
      if (regex.source.includes('\\[')) {
        // Handle TJ array
        const arrayContent = match[1];
        const textMatches = arrayContent.match(/\(([^)]*)\)/g);
        if (textMatches) {
          textMatches.forEach(tm => {
            const decoded = decodePDFText(tm.slice(1, -1));
            if (decoded && isReadableText(decoded)) {
              text += decoded;
            }
          });
        }
      } else {
        // Handle simple text
        const decoded = decodePDFText(match[1]);
        if (decoded && isReadableText(decoded)) {
          text += decoded;
        }
      }
    }
  });
  
  return text;
}

function extractFromStream(streamContent: string): string {
  let text = '';
  
  // Look for text patterns that might be in uncompressed streams
  const patterns = [
    /\(([^)]{2,})\)/g,                      // Parentheses enclosed text
    /BT\s+([\s\S]*?)\s+ET/g,               // Text objects within streams
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(streamContent)) !== null) {
      if (pattern.source.includes('BT')) {
        // Extract from text object
        const blockText = extractFromTextBlock(match[1]);
        if (blockText) text += blockText + ' ';
      } else {
        // Direct text extraction
        const decoded = decodePDFText(match[1]);
        if (decoded && isReadableText(decoded)) {
          text += decoded + ' ';
        }
      }
    }
  });
  
  return text;
}

function decodePDFText(text: string): string {
  if (!text) return '';
  
  try {
    // Handle PDF escape sequences
    let decoded = text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\([0-7]{1,3})/g, (_, octal) => {
        const charCode = parseInt(octal, 8);
        return charCode > 31 && charCode < 127 ? String.fromCharCode(charCode) : '';
      });
    
    // Handle Unicode escapes
    decoded = decoded.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
    
    return decoded;
  } catch (e) {
    return text;
  }
}

function extractAlternativeMethod(uint8Array: Uint8Array): string {
  let text = '';
  let currentWord = '';
  
  // Extract readable ASCII sequences
  for (let i = 0; i < Math.min(uint8Array.length, 500000); i++) {
    const byte = uint8Array[i];
    
    if (byte >= 32 && byte <= 126) {
      // Printable ASCII
      currentWord += String.fromCharCode(byte);
    } else if (byte === 10 || byte === 13 || byte === 9) {
      // Line breaks and tabs
      if (currentWord.length > 2 && isReadableText(currentWord)) {
        text += currentWord + ' ';
      }
      currentWord = '';
    } else {
      // Non-printable byte
      if (currentWord.length > 2 && isReadableText(currentWord)) {
        text += currentWord + ' ';
      }
      currentWord = '';
    }
    
    if (text.length > 10000) break; // Prevent excessive processing
  }
  
  // Add final word
  if (currentWord.length > 2 && isReadableText(currentWord)) {
    text += currentWord;
  }
  
  return text;
}

function isReadableText(text: string): boolean {
  if (!text || text.length < 2) return false;
  
  // Must contain letters
  if (!/[a-zA-Z]/.test(text)) return false;
  
  // Should not be mostly numbers or symbols
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalLength = text.length;
  
  if (alphaCount / totalLength < 0.3) return false;
  
  // Exclude common PDF artifacts
  const artifacts = [
    'endobj', 'endstream', 'stream', 'xref', 'trailer', 'startxref',
    'obj', 'Type', 'Font', 'Width', 'Height', 'BitsPerComponent'
  ];
  
  return !artifacts.some(artifact => text.includes(artifact));
}

function cleanAndDeduplicateText(text: string): string {
  if (!text) return '';
  
  // Split into words and remove duplicates while preserving order
  const words = text.split(/\s+/);
  const uniqueWords: string[] = [];
  const seen = new Set<string>();
  
  for (const word of words) {
    const cleanWord = word.trim();
    if (cleanWord && !seen.has(cleanWord.toLowerCase()) && isReadableText(cleanWord)) {
      uniqueWords.push(cleanWord);
      seen.add(cleanWord.toLowerCase());
    }
  }
  
  return uniqueWords.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
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