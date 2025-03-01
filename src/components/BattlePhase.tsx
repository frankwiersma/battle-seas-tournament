import React, { useEffect } from "react";
import GameBoard from "@/components/GameBoard";
import type { PlacedShip } from "@/types/game";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";

interface BattlePhaseProps {
  myShips: PlacedShip[];
  myHits: { x: number; y: number; isHit: boolean }[];
  enemyHits: { x: number; y: number; isHit: boolean }[];
  onCellClick: (x: number, y: number) => void;
  scores: {
    myScore: number;
    enemyScore: number;
    myGuesses: number;
    enemyGuesses: number;
    myShipsSunk: number;
    enemyShipsSunk: number;
  };
  gameWon: boolean;
  gameLost: boolean;
  onRestart: () => void;
  teamId?: string | null;
}

const BattlePhase: React.FC<BattlePhaseProps> = ({
  myShips,
  myHits,
  enemyHits,
  onCellClick,
  scores = {
    myScore: 0,
    enemyScore: 0,
    myGuesses: 0,
    enemyGuesses: 0,
    myShipsSunk: 0,
    enemyShipsSunk: 0
  },
  gameWon = false,
  gameLost = false,
  onRestart,
  teamId = null
}) => {
  // Reset team ready status when victory/defeat window is shown
  useEffect(() => {
    if ((gameWon || gameLost) && teamId) {
      console.log('Victory/defeat detected, ensuring team ready status is reset');
      supabase
        .from('teams')
        .update({ is_ready: false })
        .eq('id', teamId)
        .then(({ error }: { error: any }) => {
          if (error) {
            console.error('Error resetting team ready status on victory/defeat:', error);
          } else {
            console.log('Team ready status reset to false on victory/defeat');
          }
        });
    }
  }, [gameWon, gameLost, teamId]);

  return (
    <div className="w-full max-w-[1600px]">
      {/* Score Display */}
      <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm mb-8">
        <div className="grid grid-cols-2 gap-4 text-white">
          <div>
            <h3 className="text-lg font-semibold">Your Score</h3>
            <p>Hits: {scores.myScore}</p>
            <p>Total Shots: {scores.myGuesses}</p>
            <p className="text-green-400">Ships Sunk: {scores.myShipsSunk} / 3</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Enemy Score</h3>
            <p>Hits: {scores.enemyScore}</p>
            <p>Total Shots: {scores.enemyGuesses}</p>
            <p className="text-red-400">Ships Sunk: {scores.enemyShipsSunk} / 3</p>
          </div>
        </div>
      </div>

      {/* Game Boards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
          <GameBoard
            isCurrentPlayer={false}
            placementPhase={false}
            placedShips={myShips}
            hits={enemyHits}
            showShips={true}
          />
        </div>
        <div className="flex flex-col items-center">
          <h2 className="text-2xl font-semibold text-white mb-4">Enemy Waters</h2>
          <GameBoard
            isCurrentPlayer={true}
            placementPhase={false}
            hits={myHits}
            onCellClick={onCellClick}
            showShips={false}
          />
        </div>
      </div>

      {/* Victory/Defeat Message */}
      {(gameWon || gameLost) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-xl text-center">
            <h2 className={`text-4xl font-bold text-white mb-4 ${gameWon ? 'text-green-400' : 'text-red-400'}`}>
              {gameWon ? 'Victory! 🎉' : 'Defeat! 💀'}
            </h2>
            <p className="text-white/80 mb-6">
              {gameWon ? 'All enemy ships have been destroyed!' : 'Your fleet has been destroyed!'}
            </p>
            <Button 
              onClick={onRestart}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg text-lg"
            >
              Play Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BattlePhase;
