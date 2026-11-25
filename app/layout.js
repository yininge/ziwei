// 地支 → 4×4 格子座標（1-based）。中央 2×2（row 2–3, col 2–3）留給命盤資訊。
export const GRID = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  酉: { row: 2, col: 4 }, 戌: { row: 3, col: 4 }, 亥: { row: 4, col: 4 },
  子: { row: 4, col: 3 }, 丑: { row: 4, col: 2 }, 寅: { row: 4, col: 1 },
  卯: { row: 3, col: 1 }, 辰: { row: 2, col: 1 },
};
