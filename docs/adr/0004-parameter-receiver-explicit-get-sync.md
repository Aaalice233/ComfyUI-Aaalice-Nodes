# ParameterReceiver uses visible Get nodes and explicit structural sync

Status: Accepted.

ParameterReceiver is a real 32-route backend pass-through node. Its frontend binding creates or reuses KJ Set nodes, creates visible collapsed KJ Get nodes, and connects those Gets to native receiver inputs. The receiver does not hide routing in an opaque payload and does not simulate KJNodes when the extension is unavailable.

The binding identity is the ParameterPanel node id plus the stable Parameter id. Names and types may refresh automatically, but additions, removals, reordering, and broken managed links only mark the receiver as needing synchronization. Structural graph changes occur only during first bind or an explicit user sync, inside one graph change boundary and with confirmation when links or additional Get consumers are affected.

This keeps the workflow inspectable and prevents distant nodes from being silently created or deleted while a user edits the source panel.
