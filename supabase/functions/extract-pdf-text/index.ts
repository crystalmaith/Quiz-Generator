import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple PDF text extraction function
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    // Convert ArrayBuffer to Uint8Array for processing
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Convert to string to search for text objects
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    
    // Look for text content between stream objects
    const textRegex = /BT\s+(.*?)\s+ET/gs;
    const tjRegex = /\[(.*?)\]\s*TJ/g;
    const tjSingleRegex = /\((.*?)\)\s*Tj/g;
    
    let extractedText = '';
    let match;
    
    // Extract text from BT...ET blocks (text objects)
    while ((match = textRegex.exec(pdfString)) !== null) {
      const textBlock = match[1];
      
      // Extract text from TJ operations (array format)
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
        const textArray = tjMatch[1];
        // Extract strings from the array, removing positioning numbers
        const stringRegex = /\(([^)]+)\)/g;
        let stringMatch;
        while ((stringMatch = stringRegex.exec(textArray)) !== null) {
          extractedText += stringMatch[1] + ' ';
        }
      }
      
      // Extract text from Tj operations (single string format)
      while ((tjMatch = tjSingleRegex.exec(textBlock)) !== null) {
        extractedText += tjMatch[1] + ' ';
      }
    }
    
    // Also look for more text patterns
    const textStreamRegex = /stream\s+(.*?)\s+endstream/gs;
    while ((match = textStreamRegex.exec(pdfString)) !== null) {
      const streamContent = match[1];
      
      // Look for text in parentheses (common PDF text format)
      const textInParens = /\(([^)]+)\)/g;
      let textMatch;
      while ((textMatch = textInParens.exec(streamContent)) !== null) {
        const text = textMatch[1];
        // Only add if it looks like readable text (not positioning data)
        if (text.length > 2 && /[a-zA-Z]/.test(text)) {
          extractedText += text + ' ';
        }
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
    
    // If we didn't extract much text, try alternative approach
    if (extractedText.length < 50) {
      // Look for any readable text in the PDF
      const readableTextRegex = /[A-Za-z0-9\s]{10,}/g;
      const matches = pdfString.match(readableTextRegex);
      if (matches) {
        extractedText = matches
          .filter(text => text.trim().length > 10)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    return extractedText || 'Unable to extract readable text from this PDF. Please try pasting the text manually.';
    
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