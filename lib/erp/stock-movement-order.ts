export interface StockMovementChronologyKey {
  createdAt: string;
  id: string;
}

export function compareStockMovementChronology(left: StockMovementChronologyKey, right: StockMovementChronologyKey): number {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id.localeCompare(right.id);
}
