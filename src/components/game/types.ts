
export interface Cell {
  x: number;
  y: number;
  hasShip: boolean;
  isHit: boolean;
  isMiss: boolean;
  shipId?: string;
}

export interface ShipDragItem {
  id: string;
  length: number;
  isVertical: boolean;
}

export interface Position {
  x: number;
  y: number;
}
