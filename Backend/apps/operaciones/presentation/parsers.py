import json
from django.conf import settings
from rest_framework.parsers import BaseParser
from rest_framework.exceptions import ParseError


class BoundedJSONParser(BaseParser):
    media_type='application/json'
    def parse(self,stream,media_type=None,parser_context=None):
        raw=stream.read(settings.DATA_UPLOAD_MAX_MEMORY_SIZE+1)
        if len(raw)>settings.DATA_UPLOAD_MAX_MEMORY_SIZE:raise ParseError('Solicitud demasiado grande.')
        try:return json.loads(raw.decode('utf-8'))
        except (ValueError,UnicodeError,RecursionError):raise ParseError('JSON invalido.') from None
