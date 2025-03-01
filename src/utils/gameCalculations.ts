import { BoardState } from "@/types/game";

/**
 * Calculates how many ships have been sunk based on hits and ship positions
 */
export const calculateSunkShips = (
  ships: Array<{ positions: Array<{ x: number; y: number }> }>,
  hits: Array<{ x: number; y: number; isHit: boolean }>
): number => {
  return ships.filter(ship => {
    // A ship is sunk if all its positions have been hit
    return ship.positions.every(pos =>
      hits.some(hit => hit.x === pos.x && hit.y === pos.y && hit.isHit)
    );
  }).length;
}; 