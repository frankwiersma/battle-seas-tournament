
import React from "react";
import GameBoard from "@/components/GameBoard";
import Ship from "@/components/Ship";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-primary to-secondary p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold text-white mb-2">Sea Battle Tournament</h1>
          <p className="text-white/80">Place your ships and prepare for battle!</p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
            <div className="flex flex-wrap gap-4 p-4 bg-white/10 rounded-xl backdrop-blur-sm">
              <Ship length={3} />
              <Ship length={2} />
              <Ship length={2} />
              <Ship length={1} />
            </div>
          </div>

          <div className="animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-semibold text-white mb-4">Battle Grid</h2>
            <GameBoard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
