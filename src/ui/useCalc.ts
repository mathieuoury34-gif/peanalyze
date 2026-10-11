import { useMemo } from 'react';
import { useData } from '../data/store';
import { computePositions, computeSummary, etfById } from '../domain/calc';
import type { AppData, Etf, Position, PortfolioSummary } from '../domain/types';

export interface Calc {
  data: AppData;
  positions: Position[];
  summary: PortfolioSummary;
  pos: (id: string) => Position | undefined;
  etf: (id: string) => Etf | undefined;
}

export function useCalc(): Calc {
  const data = useData();
  return useMemo(() => {
    const positions = computePositions(data);
    const summary = computeSummary(data, positions);
    return {
      data,
      positions,
      summary,
      pos: (id: string) => positions.find((p) => p.etfId === id),
      etf: (id: string) => etfById(data, id),
    };
  }, [data]);
}
