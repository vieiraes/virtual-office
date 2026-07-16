import type { CheckersCell, CheckersSide, CheckersView } from '@vo/shared';

/**
 * Damas casual (regras simplificadas): peça anda 1 diagonal para frente,
 * captura saltando em qualquer diagonal (regra brasileira), cadeia de capturas
 * obrigatória depois da primeira, promoção na última linha. A dama anda e
 * captura 1 casa em qualquer diagonal (sem dama voadora). Captura não é
 * obrigatória. Brancas começam.
 */
export class CheckersGame {
  private board: CheckersCell[] = [];
  private blackSeat: { id: string; name: string } | null = null;
  private whiteSeat: { id: string; name: string } | null = null;
  private turn: CheckersSide = 'w';
  private winner: CheckersSide | null = null;
  private chainFrom: number | null = null;

  constructor(private onChange: () => void) {
    this.setupBoard();
  }

  private setupBoard() {
    this.board = Array<CheckersCell>(64).fill('');
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((x + y) % 2 !== 1) continue;
        if (y < 3) this.board[y * 8 + x] = 'b';
        if (y > 4) this.board[y * 8 + x] = 'w';
      }
    }
    this.turn = 'w';
    this.winner = null;
    this.chainFrom = null;
  }

  hasSeat(id: string): boolean {
    return this.blackSeat?.id === id || this.whiteSeat?.id === id;
  }

  sit(id: string, name: string) {
    if (this.hasSeat(id)) return;
    if (!this.whiteSeat) this.whiteSeat = { id, name };
    else if (!this.blackSeat) this.blackSeat = { id, name };
    else return;
    this.onChange();
  }

  leave(id: string) {
    if (!this.hasSeat(id)) return;
    if (this.blackSeat?.id === id) this.blackSeat = null;
    if (this.whiteSeat?.id === id) this.whiteSeat = null;
    this.setupBoard(); // partida abandonada recomeça do zero
    this.onChange();
  }

  reset(id: string) {
    if (!this.hasSeat(id)) return;
    this.setupBoard();
    this.onChange();
  }

  move(id: string, from: number, to: number) {
    if (this.winner || !this.blackSeat || !this.whiteSeat) return;
    const side: CheckersSide | null =
      this.whiteSeat.id === id ? 'w' : this.blackSeat.id === id ? 'b' : null;
    if (side !== this.turn) return;
    if (!Number.isInteger(from) || !Number.isInteger(to)) return;
    if (from < 0 || from > 63 || to < 0 || to > 63) return;
    if (this.chainFrom !== null && from !== this.chainFrom) return;

    const piece = this.board[from];
    if (!piece || piece.toLowerCase() !== side) return;
    if (this.board[to] !== '') return;

    const fx = from % 8, fy = Math.floor(from / 8);
    const tx = to % 8, ty = Math.floor(to / 8);
    const dx = tx - fx, dy = ty - fy;
    if (Math.abs(dx) !== Math.abs(dy)) return;

    const isKing = piece === 'B' || piece === 'W';
    const forward = side === 'w' ? -1 : 1;
    let captured = -1;

    if (Math.abs(dx) === 1) {
      // passo simples: só sem cadeia em andamento; peão só para frente
      if (this.chainFrom !== null) return;
      if (!isKing && dy !== forward) return;
    } else if (Math.abs(dx) === 2) {
      const mid = (fy + dy / 2) * 8 + (fx + dx / 2);
      const midPiece = this.board[mid];
      if (!midPiece || midPiece.toLowerCase() === side) return;
      captured = mid;
    } else {
      return;
    }

    this.board[to] = piece;
    this.board[from] = '';
    if (captured >= 0) this.board[captured] = '';

    // promoção na última linha
    const lastRow = side === 'w' ? 0 : 7;
    const promoted = !isKing && ty === lastRow;
    if (promoted) this.board[to] = side === 'w' ? 'W' : 'B';

    // cadeia: capturou, não promoveu agora e a mesma peça ainda captura
    if (captured >= 0 && !promoted && this.canCapture(to)) {
      this.chainFrom = to;
    } else {
      this.chainFrom = null;
      this.turn = side === 'w' ? 'b' : 'w';
    }

    const opponent = this.turn;
    if (!this.sideHasPieces(opponent) || !this.sideHasMoves(opponent)) {
      this.winner = side;
      this.chainFrom = null;
    }
    this.onChange();
  }

  view(): CheckersView {
    return {
      board: this.board,
      black: this.blackSeat,
      white: this.whiteSeat,
      turn: this.turn,
      winner: this.winner,
      chainFrom: this.chainFrom,
    };
  }

  // ---------- internos ----------

  private canCapture(idx: number): boolean {
    const piece = this.board[idx];
    if (!piece) return false;
    const side = piece.toLowerCase() as CheckersSide;
    const x = idx % 8, y = Math.floor(idx / 8);
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
      const mid = (y + dy / 2) * 8 + (x + dx / 2);
      const midPiece = this.board[mid];
      if (
        midPiece &&
        midPiece.toLowerCase() !== side &&
        this.board[ty * 8 + tx] === ''
      ) {
        return true;
      }
    }
    return false;
  }

  private sideHasPieces(side: CheckersSide): boolean {
    return this.board.some((c) => c.toLowerCase() === side);
  }

  private sideHasMoves(side: CheckersSide): boolean {
    for (let idx = 0; idx < 64; idx++) {
      const piece = this.board[idx];
      if (!piece || piece.toLowerCase() !== side) continue;
      if (this.canCapture(idx)) return true;
      const isKing = piece === 'B' || piece === 'W';
      const forward = side === 'w' ? -1 : 1;
      const x = idx % 8, y = Math.floor(idx / 8);
      for (const [dx, dy] of [[-1, forward], [1, forward], [-1, -forward], [1, -forward]] as const) {
        if (!isKing && dy !== forward) continue;
        const tx = x + dx, ty = y + dy;
        if (tx < 0 || tx > 7 || ty < 0 || ty > 7) continue;
        if (this.board[ty * 8 + tx] === '') return true;
      }
    }
    return false;
  }
}
