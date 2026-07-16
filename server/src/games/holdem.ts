import type {
  Card,
  HoldemAction,
  HoldemStage,
  HoldemView,
  HoldemWinner,
} from '@vo/shared';
import {
  HOLDEM_BIG_BLIND,
  HOLDEM_BUYIN,
  HOLDEM_MAX_SEATS,
  HOLDEM_SMALL_BLIND,
} from '@vo/shared';
import { evaluate7, newDeck } from './cards.js';

interface Seat {
  id: string;
  name: string;
  chips: number;
  /** Aposta na rodada de apostas atual (street). */
  bet: number;
  /** Total colocado no pote na mão inteira — usado nos side pots. */
  total: number;
  folded: boolean;
  allIn: boolean;
  inHand: boolean;
  showingCards?: boolean;
  cards: Card[];
}

/**
 * Texas Hold'em server-autoritativo com fichas fictícias. Quem zera as fichas
 * recompra automático na mão seguinte (é lounge, não cassino). Side pots
 * corretos no showdown; sem timer de turno — quem sai da zona é foldado.
 */
export class HoldemGame {
  private seats: Seat[] = [];
  private stage: HoldemStage = 'lobby';
  private deck: Card[] = [];
  private community: Card[] = [];
  private currentBet = 0;
  private minRaise = HOLDEM_BIG_BLIND;
  private dealerIdx = -1;
  private turnIdx = -1;
  /** Quem já agiu desde a última raise — fecha a rodada de apostas. */
  private acted = new Set<string>();
  private winners: HoldemWinner[] | null = null;
  private nextHandTimer: NodeJS.Timeout | null = null;
  private runOutBoardTimer: NodeJS.Timeout | null = null;
  private nextHandAt: number | null = null;

  constructor(private onChange: () => void) {}

  hasSeat(id: string): boolean {
    return this.seats.some((s) => s.id === id);
  }

  sit(id: string, name: string) {
    if (this.hasSeat(id) || this.seats.length >= HOLDEM_MAX_SEATS) return;
    this.seats.push({
      id,
      name,
      chips: HOLDEM_BUYIN,
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      inHand: false,
      showingCards: false,
      cards: [],
    });
    this.onChange();
  }

  leave(id: string) {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat) return;
    if (this.inBetting() && seat.inHand && !seat.folded) {
      this.applyFold(seat);
    }
    this.seats = this.seats.filter((s) => s.id !== id);
    if (this.turnIdx >= this.seats.length) this.turnIdx = -1;
    if (this.seats.length === 0) this.resetToLobby();
    this.onChange();
  }

  startHand(byId: string) {
    if (!this.hasSeat(byId) || this.inBetting()) return;
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    this.nextHandAt = null;
    if (this.seats.length < 2) return;

    this.deck = newDeck();
    this.community = [];
    this.winners = null;
    this.acted.clear();
    for (const s of this.seats) {
      if (s.chips <= 0) s.chips = HOLDEM_BUYIN; // recompra automática
      s.bet = 0;
      s.total = 0;
      s.folded = false;
      s.allIn = false;
      s.inHand = true;
      s.showingCards = false;
      s.cards = [this.deck.pop()!, this.deck.pop()!];
    }

    this.dealerIdx = (this.dealerIdx + 1) % this.seats.length;
    const headsUp = this.seats.length === 2;
    // heads-up: o dealer é o small blind e age primeiro no preflop
    const sbIdx = headsUp ? this.dealerIdx : (this.dealerIdx + 1) % this.seats.length;
    const bbIdx = (sbIdx + 1) % this.seats.length;
    this.postBlind(this.seats[sbIdx], HOLDEM_SMALL_BLIND);
    this.postBlind(this.seats[bbIdx], HOLDEM_BIG_BLIND);
    this.currentBet = HOLDEM_BIG_BLIND;
    this.minRaise = HOLDEM_BIG_BLIND;
    this.stage = 'preflop';
    this.turnIdx = this.nextToAct(bbIdx);
    this.onChange();
  }

  act(id: string, action: HoldemAction, amount?: number): void {
    if (action === 'showCards') {
      if (this.stage !== 'showdown') return;
      const seat = this.seats.find((s) => s.id === id);
      if (seat) {
        seat.showingCards = true;
        this.onChange();
      }
      return;
    }

    if (!this.inBetting()) return;
    const seat = this.seats[this.turnIdx];
    if (!seat || seat.id !== id) return;

    const toCall = this.currentBet - seat.bet;
    switch (action) {
      case 'fold':
        this.applyFold(seat);
        break;
      case 'check':
        if (toCall !== 0) return;
        this.acted.add(seat.id);
        break;
      case 'call': {
        if (toCall <= 0) return;
        this.commit(seat, Math.min(toCall, seat.chips));
        this.acted.add(seat.id);
        break;
      }
      case 'raise': {
        const raiseBy = Math.max(this.minRaise, Math.floor(amount ?? this.minRaise));
        const needed = toCall + raiseBy;
        if (seat.chips <= needed) return this.act(id, 'allin');
        this.commit(seat, needed);
        this.currentBet = seat.bet;
        this.minRaise = raiseBy;
        this.acted.clear();
        this.acted.add(seat.id);
        break;
      }
      case 'allin': {
        const all = seat.chips;
        if (all <= 0) return;
        this.commit(seat, all);
        if (seat.bet > this.currentBet) {
          const raiseBy = seat.bet - this.currentBet;
          this.currentBet = seat.bet;
          if (raiseBy >= this.minRaise) this.minRaise = raiseBy;
          this.acted.clear();
        }
        this.acted.add(seat.id);
        break;
      }
      default:
        return;
    }
    this.afterAction();
  }

  view(viewerId: string): HoldemView {
    return {
      stage: this.stage,
      community: this.community,
      pot: this.seats.reduce((sum, s) => sum + s.total, 0),
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      turnId: this.inBetting() ? this.seats[this.turnIdx]?.id ?? null : null,
      dealerId: this.seats[this.dealerIdx]?.id ?? null,
      winners: this.winners,
      nextHandAt: this.nextHandAt,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        chips: s.chips,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        inHand: s.inHand,
        showingCards: s.showingCards,
        cards:
          s.id === viewerId || s.showingCards
            ? s.cards
            : s.cards.length > 0 && s.inHand && !s.folded
              ? null // ocultas mas existem — o client mostra o verso
              : [],
      })),
    };
  }

  // ---------- internos ----------

  private inBetting(): boolean {
    return ['preflop', 'flop', 'turn', 'river'].includes(this.stage);
  }

  private postBlind(seat: Seat, blind: number) {
    this.commit(seat, Math.min(blind, seat.chips));
  }

  private commit(seat: Seat, amount: number) {
    const put = Math.min(amount, seat.chips);
    seat.chips -= put;
    seat.bet += put;
    seat.total += put;
    if (seat.chips === 0) seat.allIn = true;
  }

  private applyFold(seat: Seat) {
    seat.folded = true;
    this.acted.add(seat.id);
  }

  private live(): Seat[] {
    return this.seats.filter((s) => s.inHand && !s.folded);
  }

  private canAct(s: Seat): boolean {
    return s.inHand && !s.folded && !s.allIn;
  }

  /** Próximo índice a partir de `fromIdx` (exclusivo) que pode agir. */
  private nextToAct(fromIdx: number): number {
    for (let step = 1; step <= this.seats.length; step++) {
      const idx = (fromIdx + step + this.seats.length) % this.seats.length;
      if (this.canAct(this.seats[idx])) return idx;
    }
    return -1;
  }

  private afterAction() {
    const live = this.live();
    if (live.length <= 1) return this.finishHand();

    const actors = live.filter((s) => !s.allIn);
    const roundDone =
      actors.length === 0 ||
      actors.every((s) => this.acted.has(s.id) && s.bet === this.currentBet);

    if (!roundDone) {
      this.turnIdx = this.nextToAct(this.turnIdx);
      if (this.turnIdx === -1) return this.finishHand();
      return this.onChange();
    }

    // ≤1 jogador ainda com fichas para apostar → revela o restante progressivamente
    if (actors.length <= 1) {
      return this.runOutBoard();
    }
    this.advanceStage();
  }

  private runOutBoard() {
    this.turnIdx = -1;
    this.acted.clear();
    
    const step = () => {
      if (this.stage === 'river' || this.community.length >= 5) {
        this.runOutBoardTimer = null;
        this.finishHand();
      } else {
        if (this.stage === 'preflop') this.stage = 'flop';
        else if (this.stage === 'flop') this.stage = 'turn';
        else if (this.stage === 'turn') this.stage = 'river';
        this.dealCommunity();
        this.onChange();
        this.runOutBoardTimer = setTimeout(step, 1000);
      }
    };
    
    if (this.stage === 'river' || this.community.length >= 5) {
       this.finishHand();
    } else {
       // Se o all-in foi preflop, as cartas do all-in ficam viradas e abrem o board. 
       // Então já viramos os mostrarCartas dos envolvidos para dar mais emoção!
       for (const s of this.live()) s.showingCards = true;
       this.onChange();
       this.runOutBoardTimer = setTimeout(step, 1000);
    }
  }

  private dealCommunity() {
    if (this.community.length === 0) {
      this.community.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
    } else if (this.community.length < 5) {
      this.community.push(this.deck.pop()!);
    }
  }

  private advanceStage() {
    for (const s of this.seats) s.bet = 0;
    this.currentBet = 0;
    this.minRaise = HOLDEM_BIG_BLIND;
    this.acted.clear();

    if (this.stage === 'preflop') this.stage = 'flop';
    else if (this.stage === 'flop') this.stage = 'turn';
    else if (this.stage === 'turn') this.stage = 'river';
    else return this.finishHand();

    this.dealCommunity();
    this.turnIdx = this.nextToAct(this.dealerIdx);
    if (this.turnIdx === -1) return this.finishHand();
    this.onChange();
  }

  private finishHand() {
    const live = this.live();
    const winners: HoldemWinner[] = [];

    if (live.length === 1) {
      // todo mundo foldou — leva o pote sem mostrar as cartas
      const pot = this.seats.reduce((sum, s) => sum + s.total, 0);
      live[0].chips += pot;
      winners.push({ id: live[0].id, name: live[0].name, amount: pot, hand: 'todos foldaram' });
    } else {
      while (this.community.length < 5) this.dealCommunity();
      const results = new Map(
        live.map((s) => [s.id, evaluate7([...s.cards, ...this.community])]),
      );
      // side pots: fatia o pote pelos níveis de contribuição
      const levels = [...new Set(this.seats.filter((s) => s.total > 0).map((s) => s.total))].sort(
        (a, b) => a - b,
      );
      const won = new Map<string, number>();
      let prev = 0;
      for (const level of levels) {
        const slice = this.seats.reduce(
          (sum, s) => sum + Math.max(0, Math.min(s.total, level) - prev),
          0,
        );
        prev = level;
        const eligible = live.filter((s) => s.total >= level);
        if (eligible.length === 0 || slice === 0) continue;
        const best = Math.max(...eligible.map((s) => results.get(s.id)!.score));
        const top = eligible.filter((s) => results.get(s.id)!.score === best);
        const share = Math.floor(slice / top.length);
        let rest = slice - share * top.length;
        for (const s of top) {
          const gain = share + (rest > 0 ? 1 : 0);
          if (rest > 0) rest--;
          won.set(s.id, (won.get(s.id) ?? 0) + gain);
        }
      }
      for (const [id, amount] of won) {
        const s = this.seats.find((x) => x.id === id)!;
        s.chips += amount;
        s.showingCards = true; // Ganhadores no showdown revelam automaticamente
        winners.push({ id, name: s.name, amount, hand: results.get(id)!.name });
      }
    }

    for (const s of this.seats) {
      s.bet = 0;
      s.total = 0;
    }
    this.winners = winners;
    this.stage = 'showdown';
    this.turnIdx = -1;
    this.onChange();

    // próxima mão automática — dá tempo de ver o resultado
    const NEXT_HAND_DELAY_MS = 8000;
    this.nextHandAt = Date.now() + NEXT_HAND_DELAY_MS;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      if (this.seats.length >= 2) this.startHand(this.seats[0].id);
      else this.resetToLobby();
    }, NEXT_HAND_DELAY_MS);
  }

  private resetToLobby() {
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    this.nextHandAt = null;
    if (this.runOutBoardTimer) {
      clearTimeout(this.runOutBoardTimer);
      this.runOutBoardTimer = null;
    }
    this.stage = 'lobby';
    this.community = [];
    this.winners = null;
    this.turnIdx = -1;
    this.currentBet = 0;
    for (const s of this.seats) {
      s.cards = [];
      s.inHand = false;
      s.folded = false;
      s.allIn = false;
      s.bet = 0;
      s.total = 0;
    }
    this.onChange();
  }
}
