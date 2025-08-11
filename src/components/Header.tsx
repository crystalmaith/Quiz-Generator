import { Brain, Snowflake } from 'lucide-react';

export const Header = () => {
  return (
    <header className="w-full bg-card/50 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          <div className="relative">
            <Brain className="w-8 h-8 text-primary" />
            <Snowflake className="w-4 h-4 text-secondary absolute -top-1 -right-1" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Maithili's AI Quiz Generator
            </h1>
            <p className="text-sm text-muted-foreground">
              Transform your PDF study materials into interactive quizzes
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};