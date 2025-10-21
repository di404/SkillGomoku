export function checkWin(grid, x, y, player, needed = 5) {
  // 从最后一步 (x,y) 起，检查四个方向是否连成 needed
  const dirs = [
    [1, 0], // 横
    [0, 1], // 竖
    [1, 1], // 斜 \ 
    [1, -1], // 斜 /
  ];

  const size = grid.length;

  for (const [dx, dy] of dirs) {
    let count = 1;
    // 正向
    let nx = x + dx, ny = y + dy;
    while (nx >= 0 && nx < size && ny >= 0 && ny < size && grid[ny][nx] === player) {
      count++; nx += dx; ny += dy;
    }
    // 反向
    nx = x - dx; ny = y - dy;
    while (nx >= 0 && nx < size && ny >= 0 && ny < size && grid[ny][nx] === player) {
      count++; nx -= dx; ny -= dy;
    }
    if (count >= needed) return true;
  }
  return false;
}
