import React from "react";

export interface CellProps {
  x: number;
  y: number;
  hasShip: boolean;
  isHit: boolean;
  isMiss: boolean;
  shipId?: string;
  showShips?: boolean;
  onClick: () => void;
  isOver?: boolean;
  canDrop?: boolean;
}

export const Cell: React.FC<CellProps> = ({
  x,
  y,
  hasShip,
  isHit,
  isMiss,
  showShips,
  onClick,
  isOver,
  canDrop
}) => {
  let cellClasses = [
    "w-16 h-16 border border-opacity-20 border-white rounded-lg transition-all duration-300 backdrop-blur-sm",
    "relative"
  ];

  if (isHit) {
    cellClasses.push("bg-red-500/80");
  } else if (isMiss) {
    cellClasses.push("bg-blue-500/50");
  } else if (hasShip && showShips) {
    cellClasses.push("bg-green-500/80");
  } else {
    cellClasses.push("bg-white/10 hover:bg-white/20");
  }

  if (isOver && canDrop) {
    cellClasses.push("bg-green-500/50");
  } else if (isOver && !canDrop) {
    cellClasses.push("bg-red-500/50");
  }

  return (
    <div
      data-coords={`${x},${y}`}
      className={cellClasses.join(" ")}
      onClick={onClick}
    >
      {hasShip && showShips && (
        <div className="absolute inset-1 rounded bg-green-300/20 border-2 border-green-300/50" />
      )}
      {isHit && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
        </div>
      )}
      {isMiss && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-blue-500 rounded-full" />
        </div>
      )}
    </div>
  );
};
