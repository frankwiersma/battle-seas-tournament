
export interface Position {
  x: number;
  y: number;
}

export interface PlacedShip {
  id: string;
  positions: Position[];
}

export interface TeamPresence {
  team_id: string;
  ready: boolean;
}

export interface BoardState {
  ships: Array<{
    id: string;
    positions: Array<{ x: number; y: number }>;
  }>;
  hits: Array<{ x: number; y: number; isHit: boolean }>;
}

export interface GameState {
  myShips: PlacedShip[];
  myHits: { x: number; y: number; isHit: boolean }[];
  enemyHits: { x: number; y: number; isHit: boolean }[];
}
