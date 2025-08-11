import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple PDF text extraction function
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    console.log('Starting PDF text extraction...');
    
    // Convert ArrayBuffer to Uint8Array for processing
    const uint8Array = new Uint8Array(pdfBuffer);
    console.log(`PDF buffer size: ${uint8Array.length} bytes`);
    
    // Convert to string to search for text objects
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    console.log(`Converted to string, length: ${pdfString.length}`);
    
    let extractedText = '';
    
    // Method 1: Look for text content between stream objects
    const streamRegex = /stream\s+(.*?)\s+endstream/gs;
    let streamMatch;
    let streamCount = 0;
    
    while ((streamMatch = streamRegex.exec(pdfString)) !== null && streamCount < 50) {
      streamCount++;
      const streamContent = streamMatch[1];
      
      // Look for text in parentheses (common PDF text format)
      const textInParens = /\(([^)]*)\)/g;
      let textMatch;
      while ((textMatch = textInParens.exec(streamContent)) !== null) {
        const text = textMatch[1];
        // Only add if it looks like readable text
        if (text.length > 1 && /[a-zA-Z0-9]/.test(text) && !text.match(/^[\d\s\.\-]+$/)) {
          extractedText += text + ' ';
        }
      }
      
      // Also look for text with Tj operators
      const tjRegex = /\((.*?)\)\s*Tj/g;
      while ((textMatch = tjRegex.exec(streamContent)) !== null) {
        const text = textMatch[1];
        if (text.length > 1 && /[a-zA-Z]/.test(text)) {
          extractedText += text + ' ';
        }
      }
    }
    
    console.log(`Found ${streamCount} streams, extracted text length so far: ${extractedText.length}`);
    
    // Method 2: Look for text objects (BT...ET blocks)
    const textObjectRegex = /BT\s+(.*?)\s+ET/gs;
    let textObjectMatch;
    let objectCount = 0;
    
    while ((textObjectMatch = textObjectRegex.exec(pdfString)) !== null && objectCount < 50) {
      objectCount++;
      const textBlock = textObjectMatch[1];
      
      // Extract text from various formats
      const patterns = [
        /\(([^)]+)\)\s*Tj/g,
        /\[([^\]]+)\]\s*TJ/g,
        /\(([^)]+)\)/g
      ];
      
      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(textBlock)) !== null) {
          let text = match[1];
          if (pattern.source.includes('\\]')) {
            // Handle TJ array format - extract strings from array
            const stringMatches = text.match(/\(([^)]+)\)/g);
            if (stringMatches) {
              stringMatches.forEach(str => {
                const cleanText = str.replace(/[()]/g, '');
                if (cleanText.length > 1 && /[a-zA-Z]/.test(cleanText)) {
                  extractedText += cleanText + ' ';
                }
              });
            }
          } else {
            // Regular text
            if (text.length > 1 && /[a-zA-Z]/.test(text)) {
              extractedText += text + ' ';
            }
          }
        }
      });
    }
    
    console.log(`Found ${objectCount} text objects, total extracted text length: ${extractedText.length}`);
    
    // Method 3: Look for any readable text patterns in the entire PDF
    if (extractedText.length < 100) {
      console.log('Low text extraction, trying broader search...');
      
      // Look for sequences of readable characters
      const readableTextRegex = /[A-Za-z][A-Za-z0-9\s\.,;:!?\-]{5,}/g;
      const matches = pdfString.match(readableTextRegex);
      
      if (matches) {
        console.log(`Found ${matches.length} potential text matches`);
        const filteredMatches = matches
          .filter(text => {
            // Filter out binary data and positioning commands
            return !text.match(/^[\d\s\.\-]+$/) && 
                   !text.match(/[^\x20-\x7E]/) && 
                   text.trim().length > 5 &&
                   /[a-zA-Z]{3,}/.test(text);
          })
          .slice(0, 100); // Limit to first 100 matches
        
        extractedText += filteredMatches.join(' ');
        console.log(`Added ${filteredMatches.length} filtered matches`);
      }
    }
    
    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\(/g, '(')
      .replace(/\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log(`Final cleaned text length: ${extractedText.length}`);
    console.log(`First 500 characters: ${extractedText.substring(0, 500)}`);
    
    if (extractedText.length < 50) {
      console.log('Insufficient text extracted, PDF might be image-based or encrypted');
      return 'This PDF appears to contain mostly images or is encrypted. Please try copying and pasting the text manually from the PDF.';
    }
    
    return extractedText;
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    return 'Error extracting text from PDF. Please try pasting the text manually.';
  }
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