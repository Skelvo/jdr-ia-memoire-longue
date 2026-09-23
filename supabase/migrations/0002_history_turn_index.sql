-- Phase 2: track which turn produced each world_state_history row, so "undo the
-- last turn" (SPEC.md §9 UX) can find and roll back exactly the right patch.
-- Nullable: a player edit from the Carnet isn't tied to a specific turn.

alter table world_state_history
  add column if not exists turn_index int;

create index if not exists world_state_history_world_turn_idx
  on world_state_history (world_id, turn_index);
