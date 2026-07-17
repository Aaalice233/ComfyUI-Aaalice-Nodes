"""EnumSwitch — exact, lazy routing across stable enum branches."""

from __future__ import annotations

from comfy_api.latest import io

from .._lib.enum_switch import MAX_ENUM_BRANCHES, parse_routes, selected_input

_MISSING = object()


def _branch_inputs(template: io.MatchType.Template) -> list:
    return [
        io.MatchType.Input(
            f"branch_{index}",
            template=template,
            display_name=f"Branch {index}",
            optional=True,
            lazy=True,
            tooltip=f"Enum branch {index}; the visible label follows the configured key.",
        )
        for index in range(1, MAX_ENUM_BRANCHES + 1)
    ]


class EnumSwitch(io.ComfyNode):
    """Select exactly one lazy input by a configured string key."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        template = io.MatchType.Template("enum_switch")
        return io.Schema(
            node_id="EnumSwitch",
            display_name="🔀 Enum Switch",
            category="Aaalice/tools",
            description="Select one lazy branch by an exact string value.",
            inputs=[
                io.String.Input(
                    "selector",
                    force_input=True,
                    tooltip="String value used to select a matching branch.",
                ),
                *_branch_inputs(template),
            ],
            outputs=[
                io.MatchType.Output(
                    template=template,
                    id="output",
                    display_name="Output",
                    tooltip="Value from the selected branch.",
                ),
            ],
            accept_all_inputs=True,
        )

    @classmethod
    def validate_inputs(cls, routes_json: str = "[]", **_kwargs):
        try:
            parse_routes(routes_json)
        except ValueError as exc:
            return str(exc)
        return True

    @classmethod
    def check_lazy_status(cls, selector: str, routes_json: str = "[]", **kwargs):
        input_id = selected_input(selector, routes_json)
        value = kwargs.get(input_id, _MISSING)
        if value is _MISSING:
            raise ValueError(f"EnumSwitch branch {selector!r} is not connected")
        if value is None:
            return [input_id]
        return []

    @classmethod
    def execute(cls, selector: str, routes_json: str = "[]", **kwargs) -> io.NodeOutput:
        input_id = selected_input(selector, routes_json)
        value = kwargs.get(input_id, _MISSING)
        if value is _MISSING:
            raise ValueError(f"EnumSwitch branch {selector!r} is not connected")
        return io.NodeOutput(value)
