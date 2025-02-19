
import React from "react";
import GameBoard from "@/components/GameBoard";
import type { PlacedShip } from "@/types/game";

interface BattlePhaseProps {
  myShips: PlacedShip[];
  myHits: Array<{ x: number; y: number; isHit: boolean }>;
  enemyHits: Array<{ x: number; y: number; isHit: boolean }>;
  onCellClick: (x: number, y: number) => void;
}

const BattlePhase: React.FC<BattlePhaseProps> = ({
  myShips,
  myHits,
  enemyHits,
  onCellClick,
}) => {
  return (
    <>
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-2xl font-semibold text-white mb-4">Your Fleet</h2>
        <GameBoard
          isCurrentPlayer={false}
          placementPhase={false}
          placedShips={myShips}
          hits={enemyHits}
          showShips={true}
        />
      </div>
      <div className="space-y-4 animate-fade-in">
        <h2 className="text-2xl font-semibold text-white mb-4">Enemy Waters</h2>
        <GameBoard
          isCurrentPlayer={true}
          placementPhase={false}
          hits={myHits}
          onCellClick={onCellClick}
          showShips={false}
        />
      </div>
    </>
  );
};

export default BattlePhase;
