export default class Board {
  constructor(size = 15) {
    this.size = size; // N x N
    this.grid = Array.from({ length: size }, () => Array(size).fill(0)); // 0 empty, 1 black, 2 white
    this.blocked = new Set(); // e.g., cells blocked by skills: key = `${x},${y}`
  }

  key(x, y) {
    return `${x},${y}`;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size;
  }

  isEmpty(x, y) {
    return this.inBounds(x, y) && this.grid[y][x] === 0 && !this.blocked.has(this.key(x, y));
  }

  place(x, y, player) {
    if (!this.isEmpty(x, y)) return false;
    this.grid[y][x] = player; // 1 or 2
    return true;
  }

  remove(x, y) {
    if (!this.inBounds(x, y)) return false;
    this.grid[y][x] = 0;
    this.blocked.delete(this.key(x, y));
    return true;
  }

  setBlocked(x, y, blocked = true) {
    if (!this.inBounds(x, y)) return false;
    const k = this.key(x, y);
    if (blocked) this.blocked.add(k); else this.blocked.delete(k);
    return true;
  }
}
