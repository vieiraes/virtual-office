import Phaser from 'phaser';
import type { Dir, Player } from '@vo/shared';
import {
  AVATAR_SIZE,
  CONNECT_RADIUS,
  MAP_HEIGHT,
  MAP_WIDTH,
  MOVE_SEND_HZ,
  MOVE_SPEED,
  ROLE_EMOJI,
} from '@vo/shared';
import { useStore } from '../store';
import { sendMove } from '../net/socket';
import {
  CHECKERS_DARK_COLOR,
  CHECKERS_LIGHT_COLOR,
  DESK_COLOR,
  DESK_TOP_COLOR,
  FLOOR_COLOR,
  FLOOR_GRID_COLOR,
  POKER_FELT_COLOR,
  POKER_RIM_COLOR,
  RUG_COLOR,
  WALL_COLOR,
  checkersTable,
  desks,
  pokerTable,
  rugs,
  walls,
  type Rect,
} from './map';

interface RemoteAvatar {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '13px',
  color: '#ffffff',
  stroke: '#000000',
  strokeThickness: 3,
};

export class OfficeScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private playerLabel!: Phaser.GameObjects.Text;
  private radiusCircle!: Phaser.GameObjects.Arc;
  private remotes = new Map<string, RemoteAvatar>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private lastMoveSentAt = 0;
  private wasMoving = false;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    super({ key: 'office' });
  }

  create() {
    this.drawMap();
    const obstacles = this.buildObstacles();

    const state = useStore.getState();
    const self = state.selfId ? state.players[state.selfId] : undefined;
    const spawnX = self?.x ?? 200;
    const spawnY = self?.y ?? 200;
    const color = state.selfColor || '#3498db';

    // círculo do raio de conexão — feedback visual do alcance da conversa
    this.radiusCircle = this.add
      .circle(spawnX, spawnY, CONNECT_RADIUS, 0x2ecc71, 0.06)
      .setStrokeStyle(1.5, 0x2ecc71, 0.35)
      .setDepth(1);

    this.warmAvatarTextures(color);
    this.player = this.physics.add.image(spawnX, spawnY, this.avatarTexture(color, 'idle'));
    this.player.setCollideWorldBounds(true).setDepth(10);
    this.player.body.setSize(AVATAR_SIZE - 6, AVATAR_SIZE - 6);
    this.playerLabel = this.makeLabel(
      `${ROLE_EMOJI[state.selfRole]} ${state.selfName || 'Você'}`,
      spawnX,
      spawnY,
    );

    this.physics.add.collider(this.player, obstacles);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setBackgroundColor(WALL_COLOR);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // jogadores remotos: sincroniza sprites com o store (join/leave/move)
    for (const p of Object.values(state.players)) this.syncRemote(p);
    this.unsubscribers.push(
      useStore.subscribe(
        (s) => s.players,
        (players) => this.diffRemotes(players),
      ),
      useStore.subscribe(
        (s) => s.nearbyPeerIds,
        (ids) => this.tintNearby(ids),
      ),
      // chat focado: solta o teclado do jogo (inclusive as capturas de
      // preventDefault das setas/espaço, que impediriam digitar no input)
      useStore.subscribe(
        (s) => s.chatFocused,
        (focused) => {
          const kb = this.input.keyboard!;
          kb.enabled = !focused;
          if (focused) {
            kb.resetKeys();
            kb.disableGlobalCapture();
            this.player.setVelocity(0, 0);
          } else {
            kb.enableGlobalCapture();
          }
        },
      ),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((u) => u());
      this.unsubscribers = [];
    });
  }

  update(time: number) {
    this.handleMovement(time);

    this.playerLabel.setPosition(this.player.x, this.player.y - AVATAR_SIZE);
    this.radiusCircle.setPosition(this.player.x, this.player.y);

    // interpolação dos remotos — suaviza os updates de ~15 Hz
    for (const remote of this.remotes.values()) {
      remote.sprite.x = Phaser.Math.Linear(remote.sprite.x, remote.targetX, 0.3);
      remote.sprite.y = Phaser.Math.Linear(remote.sprite.y, remote.targetY, 0.3);
      remote.label.setPosition(remote.sprite.x, remote.sprite.y - AVATAR_SIZE);
    }
  }

  // ---------- movimento ----------

  private handleMovement(time: number) {
    if (useStore.getState().chatFocused) return;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    const vx = (right ? 1 : 0) - (left ? 1 : 0);
    const vy = (down ? 1 : 0) - (up ? 1 : 0);
    const velocity = new Phaser.Math.Vector2(vx, vy).normalize().scale(MOVE_SPEED);
    this.player.setVelocity(velocity.x, velocity.y);

    const moving = vx !== 0 || vy !== 0;
    let dir: Dir = 'down';
    if (vx < 0) dir = 'left';
    else if (vx > 0) dir = 'right';
    else if (vy < 0) dir = 'up';

    // troca textura para mover os olhos na direção correta
    const color = useStore.getState().selfColor || '#3498db';
    const texDir = moving ? dir : 'idle';
    const texKey = this.avatarTexture(color, texDir);
    if (this.player.texture.key !== texKey) this.player.setTexture(texKey);

    const sendInterval = 1000 / MOVE_SEND_HZ;
    const stoppedNow = this.wasMoving && !moving;
    if ((moving && time - this.lastMoveSentAt >= sendInterval) || stoppedNow) {
      this.lastMoveSentAt = time;
      const payload = {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        dir,
        moving,
      };
      sendMove(payload);
      // posição própria no store: usada pela proximidade e por quem entrar depois
      const selfId = useStore.getState().selfId;
      if (selfId) useStore.getState().patchPlayer(selfId, payload);
    }
    this.wasMoving = moving;
  }

  // ---------- proximidade (cálculo em proximity.ts, fora do loop do Phaser) ----------

  private tintNearby(ids: string[]) {
    if (!this.sys?.isActive()) return;
    const nearby = new Set(ids);
    for (const [id, remote] of this.remotes) {
      remote.label.setColor(nearby.has(id) ? '#2ecc71' : '#ffffff');
    }
  }

  // ---------- jogadores remotos ----------

  private diffRemotes(players: Record<string, Player>) {
    // guarda contra callback de uma cena já destruída ainda inscrita no
    // store: em dev, o StrictMode monta o Phaser 2x e a 1ª instância pode
    // levar um tick a mais pra desinscrever via SHUTDOWN — sem isso, o
    // callback morto tenta criar GameObject num scene nulo e derruba a aba.
    if (!this.sys?.isActive()) return;
    const selfId = useStore.getState().selfId;
    for (const p of Object.values(players)) {
      if (p.id !== selfId) this.syncRemote(p);
    }
    for (const id of this.remotes.keys()) {
      if (!players[id]) this.removeRemote(id);
    }
  }

  private syncRemote(p: Player) {
    if (p.id === useStore.getState().selfId) return;
    const texDir = p.moving ? p.dir : 'idle';
    const existing = this.remotes.get(p.id);
    if (existing) {
      existing.targetX = p.x;
      existing.targetY = p.y;
      const texKey = this.avatarTexture(p.color, texDir);
      if (existing.sprite.texture.key !== texKey) existing.sprite.setTexture(texKey);
      return;
    }
    this.warmAvatarTextures(p.color);
    const sprite = this.add.image(p.x, p.y, this.avatarTexture(p.color, texDir)).setDepth(10);
    const label = this.makeLabel(`${ROLE_EMOJI[p.role] ?? ''} ${p.name}`, p.x, p.y);
    this.remotes.set(p.id, { sprite, label, targetX: p.x, targetY: p.y });
  }

  private removeRemote(id: string) {
    const remote = this.remotes.get(id);
    if (!remote) return;
    remote.sprite.destroy();
    remote.label.destroy();
    this.remotes.delete(id);
  }

  // ---------- desenho ----------

  private makeLabel(text: string, x: number, y: number) {
    return this.add
      .text(x, y - AVATAR_SIZE, text, LABEL_STYLE)
      .setOrigin(0.5, 1)
      .setDepth(20);
  }

  /** Gera 5 texturas por cor (idle + 4 direções) com olhos posicionados direcionalmente. */
  private avatarTexture(color: string, dir: Dir | 'idle' = 'idle'): string {
    const key = `avatar-${color}-${dir}`;
    if (this.textures.exists(key)) return key;

    // Deslocamento dos olhos por direção: [offsetX, offsetY] relativo ao centro
    const eyeOffset: Record<Dir | 'idle', [number, number]> = {
      idle:  [0,    0],
      down:  [0,    4],
      up:    [0,   -4],
      left:  [-4,   0],
      right: [4,    0],
    };
    const [ox, oy] = eyeOffset[dir];
    const cx = AVATAR_SIZE / 2;
    const cy = AVATAR_SIZE / 2;
    // olhos ficam levemente acima do centro em idle, ajustados pelo offset direcional
    const eyeBaseY = cy - 2;
    const eyeSpread = AVATAR_SIZE * 0.18;

    const tint = Phaser.Display.Color.HexStringToColor(color).color;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // corpo: quadrado arredondado colorido
    g.fillStyle(tint, 1);
    g.fillRoundedRect(0, 0, AVATAR_SIZE, AVATAR_SIZE, 9);

    // olho esquerdo
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx - eyeSpread + ox, eyeBaseY + oy, 4);
    // pupila esquerda
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx - eyeSpread + ox + (ox * 0.3), eyeBaseY + oy + (oy * 0.3), 2);

    // olho direito
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(cx + eyeSpread + ox, eyeBaseY + oy, 4);
    // pupila direita
    g.fillStyle(0x111111, 1);
    g.fillCircle(cx + eyeSpread + ox + (ox * 0.3), eyeBaseY + oy + (oy * 0.3), 2);

    g.generateTexture(key, AVATAR_SIZE, AVATAR_SIZE);
    g.destroy();
    return key;
  }

  /** Pré-aquece todas as 5 texturas direcionais para uma cor. */
  private warmAvatarTextures(color: string) {
    (['idle', 'down', 'up', 'left', 'right'] as const).forEach((d) =>
      this.avatarTexture(color, d),
    );
  }

  private drawMap() {
    this.add.rectangle(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, FLOOR_COLOR);

    // grade sutil do piso
    const grid = this.add.graphics();
    grid.lineStyle(1, FLOOR_GRID_COLOR, 1);
    for (let x = 0; x <= MAP_WIDTH; x += 64) grid.lineBetween(x, 0, x, MAP_HEIGHT);
    for (let y = 0; y <= MAP_HEIGHT; y += 64) grid.lineBetween(0, y, MAP_WIDTH, y);

    for (const r of rugs) {
      this.add
        .rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, RUG_COLOR, 0.5)
        .setStrokeStyle(2, RUG_COLOR, 0.9);
    }

    this.add
      .text(1350, 800, '🗂️ Sala de Reunião', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#8fa3bd',
      })
      .setOrigin(0.5, 0);

    this.add
      .text(820, 862, '🎮 Área de jogos', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#8fa3bd',
      })
      .setOrigin(0.5, 0);

    // mesa de poker: feltro verde com borda de madeira
    const pk = pokerTable;
    this.add
      .ellipse(pk.x + pk.w / 2, pk.y + pk.h / 2, pk.w + 14, pk.h + 14, POKER_RIM_COLOR)
      .setDepth(2);
    this.add
      .ellipse(pk.x + pk.w / 2, pk.y + pk.h / 2, pk.w, pk.h, POKER_FELT_COLOR)
      .setDepth(3);
    this.add
      .text(pk.x + pk.w / 2, pk.y + pk.h / 2, '🃏', { fontSize: '22px' })
      .setOrigin(0.5)
      .setDepth(4);

    // mesa de damas: tabuleiro xadrezado em cima da mesa
    const ck = checkersTable;
    this.add
      .rectangle(ck.x + ck.w / 2, ck.y + ck.h / 2, ck.w, ck.h, POKER_RIM_COLOR)
      .setDepth(2);
    const cell = 16;
    const bx = ck.x + ck.w / 2 - cell * 2;
    const by = ck.y + ck.h / 2 - cell * 2;
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        this.add
          .rectangle(
            bx + cx * cell + cell / 2,
            by + cy * cell + cell / 2,
            cell,
            cell,
            (cx + cy) % 2 === 0 ? CHECKERS_LIGHT_COLOR : CHECKERS_DARK_COLOR,
          )
          .setDepth(3);
      }
    }

    for (const r of desks) {
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2 + 4, r.w, r.h, DESK_COLOR).setDepth(2);
      this.add
        .rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h - 8, DESK_TOP_COLOR)
        .setDepth(3);
    }

    for (const r of walls) {
      this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, WALL_COLOR).setDepth(4);
    }
  }

  private buildObstacles(): Phaser.Physics.Arcade.StaticGroup {
    const group = this.physics.add.staticGroup();
    const addRect = (r: Rect) => {
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.physics.add.existing(zone, true);
      group.add(zone);
    };
    walls.forEach(addRect);
    desks.forEach(addRect);
    addRect(pokerTable);
    addRect(checkersTable);
    return group;
  }
}
