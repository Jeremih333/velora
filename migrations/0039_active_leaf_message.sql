-- The selected message is the leaf of the currently active immutable branch.
-- Renaming preserves every existing pointer while making the graph invariant explicit.
ALTER TABLE conversations RENAME COLUMN active_message_id TO active_leaf_message_id;
