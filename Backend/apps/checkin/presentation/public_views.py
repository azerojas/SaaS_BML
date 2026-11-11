import json
from django.conf import settings
from rest_framework.exceptions import APIException, ParseError, UnsupportedMediaType
from rest_framework.parsers import BaseParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.checkin.application import commands
from apps.checkin.domain.rules import PUBLIC_MESSAGE
from apps.catalogo.services import CatalogConflict
from apps.checkin.infrastructure.abuse_protection import consume_request, consume_phone
from .serializers import PublicCheckinInput


class BoundedJSONParser(BaseParser):
    media_type = 'application/json'
    def parse(self, stream, media_type=None, parser_context=None):
        data = stream.read(8193)
        if len(data) > 8192:
            raise ParseError('Solicitud demasiado grande.')
        try:
            return json.loads(data.decode('utf-8'))
        except (ValueError, UnicodeError, RecursionError):
            raise ParseError('JSON invalido.') from None


class CheckinUnavailable(APIException):
    status_code = 503
    default_code = 'checkin_no_configurado'
    default_detail = 'El formulario no esta disponible en este entorno.'


class PublicBase(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [BoundedJSONParser]
    http_method_names = ['get', 'post', 'head', 'options']
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        consume_request(request)
        if settings.CHECKIN_DEMO_MODE and not settings.DEBUG:
            raise CheckinUnavailable()
        if request.method == 'POST' and request.content_type != 'application/json':
            raise UnsupportedMediaType(request.content_type)


class PublicCheckinView(PublicBase):
    def get(self, request, token):
        commands.active_point(token)
        return Response({'establecimiento': settings.CHECKIN_PUBLIC_NAME,
            'requiere_confirmacion_presencial': True, 'consentimiento_preseleccionado': False,
            'aviso_privacidad': {'url': settings.CHECKIN_PRIVACY_NOTICE_URL,
                'version': settings.CHECKIN_PRIVACY_NOTICE_VERSION, 'solo_pruebas': settings.CHECKIN_DEMO_MODE},
            'campos': ['telefono', 'nombres', 'apellidos', 'consentimiento_datos', 'version_aviso']})
    def post(self, request, token):
        serializer = PublicCheckinInput(data=request.data)
        serializer.is_valid(raise_exception=True)
        consume_phone(serializer.validated_data['telefono'])
        try:
            commands.request_arrival(token, serializer.validated_data)
        except CatalogConflict as exc:
            # The command has rolled back its atomic block; never expose a unique collision publicly.
            if exc.default_code != 'duplicado_checkin':
                raise
        return Response({'detail': PUBLIC_MESSAGE}, status=202)


class DemoNoticeView(PublicBase):
    http_method_names = ['get', 'head', 'options']
    def get(self, request):
        if not settings.CHECKIN_DEMO_MODE:
            from rest_framework.exceptions import NotFound
            raise NotFound()
        return Response({'version': settings.CHECKIN_PRIVACY_NOTICE_VERSION, 'solo_pruebas': True,
            'texto': 'Entorno de pruebas de Lasheo: utiliza unicamente nombres y telefonos ficticios. '
                     'Los datos enviados se guardan como propuesta de ficha y llegada pendiente. '
                     'Recepcion debe verificar identidad y consentimiento antes de habilitar una visita. '
                     'Este texto no es el aviso legal definitivo del establecimiento. No se envian mensajes ni se realizan cobros.',
            'consentimiento_preseleccionado': False})

