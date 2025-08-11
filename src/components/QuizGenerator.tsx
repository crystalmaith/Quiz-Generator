import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Sparkles, Brain, CheckCircle, Upload } from 'lucide-react';

interface QuizQuestion {
  question: string;
  options?: string[];
  correctAnswer?: string;
  type: 'mcq' | 'answer' | 'fillblank';
}

interface QuizResult {
  questions: QuizQuestion[];
  summary: string;
}

export const QuizGenerator = () => {
  const [pdfText, setPdfText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [quizType, setQuizType] = useState<string>('');
  const [importantTopics, setImportantTopics] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file only.",
        variant: "destructive",
      });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: "File Too Large",
        description: "Please upload a PDF file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setUploadedFile(file);
    
    try {
      toast({
        title: "Processing PDF...",
        description: "Extracting text from your PDF file.",
      });

      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('extract-pdf-text', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message);
      }

      setPdfText(data.text);
      
      toast({
        title: "PDF Processed Successfully! ✅",
        description: `Text extracted from "${file.name}". Ready to generate quiz.`,
      });
    } catch (error) {
      console.error('PDF extraction error:', error);
      toast({
        title: "PDF Processing Failed",
        description: "Failed to extract text from PDF. Please try again or paste text manually.",
        variant: "destructive",
      });
    }
  };

  const generateQuiz = async () => {
    if (!pdfText.trim()) {
      toast({
        title: "Missing PDF Text",
        description: "Please enter the PDF text content first.",
        variant: "destructive",
      });
      return;
    }

    if (!quizType) {
      toast({
        title: "Missing Quiz Type",
        description: "Please select a quiz type.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: {
          pdfText,
          quizType,
          importantTopics
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      setQuizResult({
        questions: data.questions,
        summary: data.summary
      });

      toast({
        title: "Quiz Generated Successfully! ✨",
        description: `Generated ${data.questions.length} AI-powered questions from your PDF content.`,
      });
    } catch (error) {
      console.error('Quiz generation error:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate quiz. Please check your content and try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const resetForm = () => {
    setPdfText('');
    setQuizType('');
    setImportantTopics('');
    setQuizResult(null);
  };

  return (
    <div className="space-y-8">
      {/* Input Form */}
      <Card className="glass-effect shadow-crystal transition-smooth hover:shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <FileText className="w-6 h-6 text-primary" />
            PDF Content & Quiz Settings
          </CardTitle>
          <CardDescription>
            Paste your PDF text content and configure your quiz preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs defaultValue="paste" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">Upload PDF</TabsTrigger>
              <TabsTrigger value="paste">Paste Text</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-upload" className="text-base font-medium">
                  Upload PDF File *
                </Label>
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-primary/50 transition-smooth">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <Label 
                    htmlFor="pdf-upload" 
                    className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-smooth"
                  >
                    Click to upload or drag and drop your PDF file here
                    <br />
                    <span className="text-xs">Max file size: 10MB</span>
                  </Label>
                  <Input
                    id="pdf-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                {uploadedFile && (
                  <p className="text-sm text-primary font-medium">
                    ✅ Uploaded: {uploadedFile.name}
                  </p>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="paste" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pdf-text" className="text-base font-medium">
                  PDF Text Content *
                </Label>
                <Textarea
                  id="pdf-text"
                  placeholder="Paste the extracted text from your PDF here..."
                  value={pdfText}
                  onChange={(e) => setPdfText(e.target.value)}
                  className="min-h-[200px] transition-smooth focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="quiz-type" className="text-base font-medium">
                Quiz Type *
              </Label>
              <Select value={quizType} onValueChange={setQuizType}>
                <SelectTrigger className="transition-smooth">
                  <SelectValue placeholder="Select quiz type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">MCQs (Multiple Choice)</SelectItem>
                  <SelectItem value="answer">Answer the following (5 marks)</SelectItem>
                  <SelectItem value="fillblank">Fill in the blanks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topics" className="text-base font-medium">
                Important Topics <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="topics"
                placeholder="e.g., Algorithms, Data Structures..."
                value={importantTopics}
                onChange={(e) => setImportantTopics(e.target.value)}
                className="transition-smooth"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button
              onClick={generateQuiz}
              disabled={isGenerating}
              className="flex-1 h-12 gradient-primary hover:opacity-90 transition-smooth"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5 mr-2" />
                  Generate Quiz
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={resetForm}
              className="h-12 transition-smooth"
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quiz Results */}
      {quizResult && (
        <div className="space-y-6">
          <Card className="glass-effect shadow-crystal">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <CheckCircle className="w-6 h-6 text-primary" />
                Generated Quiz — {quizType === 'mcq' ? 'MCQs' : quizType === 'answer' ? 'Answer the following (5 marks)' : 'Fill in the blanks'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {quizResult.questions.map((question, index) => (
                <div key={index} className="p-6 bg-card rounded-lg border shadow-soft">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg">
                      Q{index + 1}. {question.question}
                    </h3>
                    
                    {question.type === 'mcq' && question.options && (
                      <div className="space-y-2 ml-4">
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              ({String.fromCharCode(97 + optIndex)})
                            </span>
                            <span className={option === question.correctAnswer ? 'font-medium text-primary' : ''}>
                              {option}
                              {option === question.correctAnswer && ' ✅'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-effect shadow-crystal">
            <CardHeader>
              <CardTitle className="text-xl">PDF Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {quizResult.summary}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};