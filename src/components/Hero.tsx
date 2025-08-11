import { Button } from '@/components/ui/button';
import { ArrowDown, FileText, BrainCircuit, Sparkles } from 'lucide-react';
import heroImage from '@/assets/hero-image.jpg';

export const Hero = () => {
  const scrollToGenerator = () => {
    document.getElementById('quiz-generator')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative py-20 overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage} 
          alt="AI Quiz Generator Hero" 
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 to-background/60"></div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-20 left-10 w-16 h-16 rounded-full bg-primary/20 animate-pulse"></div>
      <div className="absolute top-40 right-20 w-12 h-12 rounded-full bg-secondary/30 animate-bounce delay-1000"></div>
      <div className="absolute bottom-20 left-1/4 w-8 h-8 rounded-full bg-accent/40 animate-pulse delay-500"></div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
              <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                AI-Powered Learning
              </span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold leading-tight">
              Transform Your
              <span className="block bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
                Study Materials
              </span>
              Into Smart Quizzes
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Upload your PDF content and let our AI create personalized quizzes with MCQs, 
              descriptive questions, or fill-in-the-blanks — plus get concise summaries.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <Button 
              size="lg" 
              onClick={scrollToGenerator}
              className="h-14 px-8 text-lg gradient-primary hover:opacity-90 transition-smooth group"
            >
              <BrainCircuit className="w-6 h-6 mr-2 group-hover:animate-pulse" />
              Start Creating Quizzes
              <ArrowDown className="w-5 h-5 ml-2 group-hover:translate-y-1 transition-transform" />
            </Button>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>PDF Support</span>
              </div>
              <div className="w-px h-4 bg-border"></div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>AI-Generated</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">Paste PDF Content</h3>
              <p className="text-sm text-muted-foreground">Simply copy and paste your study material text</p>
            </div>
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center mx-auto">
                <BrainCircuit className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="font-semibold">AI Processing</h3>
              <p className="text-sm text-muted-foreground">Our AI analyzes and creates relevant questions</p>
            </div>
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="font-semibold">Get Your Quiz</h3>
              <p className="text-sm text-muted-foreground">Receive personalized quizzes and summaries</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};