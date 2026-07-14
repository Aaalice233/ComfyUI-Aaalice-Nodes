# Stable parameter ids and direct output link rebinding

Status: Accepted.

Users frequently add, remove, reorder, and rename parameters. Pure output-slot index alignment makes downstream links silently point at the wrong value after edits.

Each parameter has a hidden stable **Parameter Id** scoped to its ParameterPanel. The full identity is `node_id + parameter_id`.

ParameterPanel exposes up to 32 direct outputs. `slotMeta` maps each visible output to a Parameter Id, so compatible structure changes rebind existing links by Parameter Id instead of slot position.

Deleting a connected parameter crosses an identity boundary. The authoring surface must list affected links and require confirmation before explicitly disconnecting them. Copying a Parameter creates a new identity and never copies links.
