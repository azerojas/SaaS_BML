import logging
from gunicorn.glogging import Logger
from .logging import SafeJSONFormatter


class SafeLogger(Logger):
    def setup(self,cfg):
        super().setup(cfg)
        for handler in self.error_log.handlers:handler.setFormatter(SafeJSONFormatter())
