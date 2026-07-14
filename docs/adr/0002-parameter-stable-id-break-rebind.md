# Stable parameter ids and break link rebinding

Status: Accepted.

Users frequently add, remove, reorder, and rename parameters. Pure output-slot index alignment makes downstream links silently point at the wrong value after edits.

Each parameter has a hidden stable **Parameter Id** scoped to its ParameterPanel. The full identity is `node_id + parameter_id`.

ParameterPanel exposes one Param Pack output. The Param Pack keys values by Parameter Id. ParameterBreak exposes ordered slots, but compatible structure changes rebind existing links by Parameter Id.

Deleting a connected parameter crosses an identity boundary. The authoring surface must list affected links and require confirmation before explicitly disconnecting them. Copying a Parameter creates a new identity and never copies links.
