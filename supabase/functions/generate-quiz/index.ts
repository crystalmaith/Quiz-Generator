import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuizQuestion {
  question: string;
  options?: string[];
  correctAnswer?: string;
  type: 'mcq' | 'answer' | 'fillblank';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText, quizType, importantTopics } = await req.json();

    if (!pdfText) {
      return new Response(
        JSON.stringify({ error: 'PDF text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create system prompt based on quiz type
    let systemPrompt = '';
    let questionFormat = '';

    if (quizType === 'mcq') {
      systemPrompt = 'You are an expert quiz generator. Create multiple choice questions based on the provided PDF content.';
      questionFormat = `Generate 5 multiple choice questions in this exact JSON format:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "type": "mcq"
    }
  ],
  "summary": "Brief summary of the PDF content"
}`;
    } else if (quizType === 'answer') {
      systemPrompt = 'You are an expert quiz generator. Create descriptive answer questions (5 marks each) based on the provided PDF content.';
      questionFormat = `Generate 3-4 descriptive questions in this exact JSON format:
{
  "questions": [
    {
      "question": "Explain the key concepts discussed in the text and their practical applications. (5 marks)",
      "type": "answer"
    }
  ],
  "summary": "Brief summary of the PDF content"
}`;
    } else {
      systemPrompt = 'You are an expert quiz generator. Create fill-in-the-blank questions based on the provided PDF content.';
      questionFormat = `Generate 5 fill-in-the-blank questions in this exact JSON format:
{
  "questions": [
    {
      "question": "The ________ algorithm is used for optimization problems.",
      "type": "fillblank"
    }
  ],
  "summary": "Brief summary of the PDF content"
}`;
    }

    const userPrompt = `
PDF Content:
${pdfText}

${importantTopics ? `Important topics to focus on: ${importantTopics}` : ''}

${questionFormat}

Make sure the questions are directly based on the content provided in the PDF. Return only valid JSON.`;

    console.log('Calling OpenAI API...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to generate quiz' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedContent = data.choices[0].message.content;

    console.log('Raw OpenAI response:', generatedContent);

    try {
      const quizData = JSON.parse(generatedContent);
      
      // Validate the response structure
      if (!quizData.questions || !Array.isArray(quizData.questions)) {
        throw new Error('Invalid response format from OpenAI');
      }

      console.log('Generated quiz:', quizData);

      return new Response(JSON.stringify(quizData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in generate-quiz function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});