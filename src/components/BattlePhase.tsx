import React from "react";
import GameBoard from "@/components/GameBoard";
import type { PlacedShip } from "@/types/game";

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
}) => {
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

      {/* Victory Message */}
      {gameWon && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-xl text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Your Team Won! 🎉</h2>
            <p className="text-white/80">All enemy ships have been destroyed!</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BattlePhase;
