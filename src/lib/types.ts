// Shared types for the world sheet (world_state.state), per SPEC.md §4.

export interface WorldCharacter {
  id: string;
  name: string;
  description: string;
  relation_to_player: string;
  status: string;
  last_seen: string;
  secrets_known_by_player: string[];
}

export interface WorldLocation {
  id: string;
  name: string;
  description: string;
  notes: string;
}

export interface WorldQuest {
  id: string;
  title: string;
  status: "active" | "done" | "failed";
  details: string;
}

export interface WorldTimelineEvent {
  turn: number;
  event: string;
}

export interface WorldState {
  player: {
    name: string;
    traits: string[];
    goals: string[];
    inventory: string[];
    status: string;
  };
  characters: WorldCharacter[];
  locations: WorldLocation[];
  quests: WorldQuest[];
  established_facts: string[];
  world_rules: string[];
  timeline: WorldTimelineEvent[];
}

export const emptyWorldState: WorldState = {
  player: { name: "", traits: [], goals: [], inventory: [], status: "" },
  characters: [],
  locations: [],
  quests: [],
  established_facts: [],
  world_rules: [],
  timeline: [],
};

export interface StoredMessage {
  id: number;
  world_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// Output shape of the memory worker (Haiku), per SPEC.md §7.1.
export interface MemoryWorkerOutput {
  state_patch: JsonPatchOp[];
  new_memories: { content: string; importance: 1 | 2 | 3 | 4 | 5 }[];
}

// RFC 6902 JSON Patch operation.
export interface JsonPatchOp {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  value?: unknown;
  from?: string;
}
