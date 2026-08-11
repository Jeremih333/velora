# ADR-0004: Memory

Status: accepted.

Persistent conversation memory is user-visible, editable and versioned. It is not an ephemeral
provider summary. Summarization is incremental with full hierarchical rebuild; historical edits
mark dependent memory stale. Manual versions can be restored and remain protected input.
