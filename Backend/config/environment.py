"""Development secrets may live outside the source tree; CI/staging/production never auto-load them."""
import os
from pathlib import Path


def development_env(base_dir):
    explicit=os.environ.get('LOCAL_ENV_FILE')
    if explicit:return Path(explicit).expanduser()
    private=Path.home()/'.codex/lasheo-private/development.env'
    return private if private.exists() else Path(base_dir)/'.env'
