import { Direction } from "./map/constants";

export type NPCMemoryValue = string | number | boolean | null;

export type NPCMemory = Record<string, NPCMemoryValue>;

export type NPCInteractionType = "dialogue" | "item" | "custom";

export interface NPCInteractionHook {
  id: string;
  type: NPCInteractionType;
  description?: string;
  payload?: Record<string, unknown>;
}

export type NPCInteractionTriggerSource = "bump" | "action" | "script";

export interface NPCInteractionEvent {
  npcId: string;
  npcName: string;
  type: NPCInteractionType;
  hookId?: string;
  availableHooks: NPCInteractionHook[];
  trigger: NPCInteractionTriggerSource;
  timestamp: number;
  memory?: NPCMemory;
}

export interface PlainNPC {
  id: string;
  name: string;
  sprite: string;
  y: number;
  x: number;
  facing: Direction;
  maxHealth: number;
  health: number;
  canMove: boolean;
  memory?: NPCMemory;
  interactionHooks?: NPCInteractionHook[];
  tags?: string[];
  actions?: string[];
  metadata?: Record<string, unknown>;
}

interface NPCConfig {
  id: string;
  name: string;
  sprite: string;
  y: number;
  x: number;
  facing?: Direction;
  canMove?: boolean;
  maxHealth?: number;
  health?: number;
  memory?: NPCMemory;
  interactionHooks?: NPCInteractionHook[];
  tags?: string[];
  actions?: string[];
  metadata?: Record<string, unknown>;
}

export class NPC {
  id: string;
  name: string;
  sprite: string;
  y: number;
  x: number;
  facing: Direction;
  canMove: boolean;
  maxHealth: number;
  health: number;
  memory: NPCMemory;
  interactionHooks: NPCInteractionHook[];
  tags: string[];
  actions: string[];
  metadata?: Record<string, unknown>;

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.sprite = config.sprite;
    this.y = config.y;
    this.x = config.x;
    this.facing = config.facing ?? Direction.DOWN;
    this.canMove = config.canMove ?? false;
    this.maxHealth = config.maxHealth ?? 5;
    this.health = Math.max(0, Math.min(config.health ?? this.maxHealth, this.maxHealth));
    this.memory = { ...(config.memory ?? {}) };
    this.interactionHooks = config.interactionHooks
      ? [...config.interactionHooks]
      : [];
    this.tags = config.tags ? [...config.tags] : [];
    this.actions = config.actions ? [...config.actions] : [];
    this.metadata = config.metadata ? { ...config.metadata } : undefined;
  }

  toPlain(): PlainNPC {
    return {
      id: this.id,
      name: this.name,
      sprite: this.sprite,
      y: this.y,
      x: this.x,
      facing: this.facing,
      canMove: this.canMove,
      maxHealth: this.maxHealth,
      health: this.health,
      memory: { ...this.memory },
      interactionHooks: this.interactionHooks.map((hook) => ({ ...hook })),
      tags: [...this.tags],
      actions: [...this.actions],
      metadata: this.metadata ? { ...this.metadata } : undefined,
    };
  }

  toJSON(): PlainNPC {
    return this.toPlain();
  }

  setMemory(key: string, value: NPCMemoryValue): void {
    this.memory[key] = value;
  }

  getMemory(key: string): NPCMemoryValue | undefined {
    return this.memory[key];
  }

  clearMemory(key: string): void {
    delete this.memory[key];
  }

  moveTo(y: number, x: number): void {
    if (!this.canMove) return;
    this.y = y;
    this.x = x;
  }

  face(direction: Direction): void {
    this.facing = direction;
  }

  takeDamage(amount: number): void {
    const next = Math.max(0, this.health - Math.max(0, amount));
    this.health = next;
  }

  heal(amount: number): void {
    const next = Math.min(this.maxHealth, this.health + Math.max(0, amount));
    this.health = next;
  }

  isDead(): boolean {
    return this.health <= 0;
  }

  revive(): void {
    this.health = this.maxHealth;
  }

  createInteractionEvent(
    trigger: NPCInteractionTriggerSource,
    hook?: NPCInteractionHook
  ): NPCInteractionEvent {
    const resolvedHook = hook ?? this.interactionHooks[0];
    const fallback: NPCInteractionHook | undefined = resolvedHook
      ? { ...resolvedHook }
      : {
          id: `${this.id}-dialogue`,
          type: "dialogue",
          description: `Talk to ${this.name}`,
        };

    return {
      npcId: this.id,
      npcName: this.name,
      type: fallback.type,
      hookId: fallback.id,
      availableHooks: this.interactionHooks.map((h) => ({ ...h })),
      trigger,
      timestamp: Date.now(),
      memory: { ...this.memory },
    };
  }
}

export function rehydrateNPCs(npcs: PlainNPC[] | undefined): NPC[] {
  if (!npcs) return [];
  return npcs.map((npc) => new NPC({
    id: npc.id,
    name: npc.name,
    sprite: npc.sprite,
    y: npc.y,
    x: npc.x,
    facing: npc.facing,
    canMove: npc.canMove,
    maxHealth: npc.maxHealth,
    health: npc.health,
    memory: npc.memory,
    interactionHooks: npc.interactionHooks,
    tags: npc.tags,
    actions: npc.actions,
    metadata: npc.metadata,
  }));
}

export function serializeNPCs(npcs?: NPC[]): PlainNPC[] | undefined {
  if (!npcs) return undefined;
  return npcs.map((npc) => npc.toPlain());
}

export function clonePlainNPCs(npcs?: PlainNPC[]): PlainNPC[] | undefined {
  if (!npcs) return undefined;
  return npcs.map((npc) => ({
    ...npc,
    memory: npc.memory ? { ...npc.memory } : undefined,
    interactionHooks: npc.interactionHooks
      ? npc.interactionHooks.map((hook) => ({ ...hook }))
      : undefined,
    tags: npc.tags ? [...npc.tags] : undefined,
    actions: npc.actions ? [...npc.actions] : undefined,
    metadata: npc.metadata ? { ...npc.metadata } : undefined,
  }));
}
