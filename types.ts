export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

export interface Block {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isStable: boolean;
  velocity: number;
  direction: 1 | -1;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}
