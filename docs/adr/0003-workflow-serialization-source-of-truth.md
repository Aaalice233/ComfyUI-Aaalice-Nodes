# Workflow serialization is the source of truth for panel parameters

The legacy design kept parameter state in process-global server memory synced over HTTP. That breaks after restart, confuses multi-worker setups, and diverges from what is saved in the workflow.

Panel parameter lists live in node properties and a serialized `parameters_json` widget value that travels with the prompt. Execute builds the Param Pack from that payload. Optional HTTP is not the source of truth for Phase A.
