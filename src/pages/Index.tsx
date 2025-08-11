import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { QuizGenerator } from '@/components/QuizGenerator';

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <section id="quiz-generator" className="py-16">
          <div className="container mx-auto px-4">
            <QuizGenerator />
          </div>
        </section>
      </main>
    </div>
  );
};

export default Index;
