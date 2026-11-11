"""Backward-compatible development entrypoint. Deployment selects an explicit module."""
import os
_target=os.environ.get('DJANGO_ENV','development')
if _target=='production':
    from .production import *  # noqa: F403
elif _target=='staging':
    from .staging import *  # noqa: F403
elif _target=='ci':
    from .ci import *  # noqa: F403
else:
    from .development import *  # noqa: F403
