import unicodedata
from django.db.models import F, Func, Q, Value, CharField
from rest_framework.exceptions import ValidationError
from negocio.models import Clientas


ACCENTS = 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑáàäâéèëêíìïîóòöôúùüûñ'
PLAIN = 'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun'


def clientas_list(params):
    qs = Clientas.objects.all()
    active = params.get('activa', 'true')
    if active not in ('true', 'false', 'all'):
        raise ValidationError({'activa': 'Usa true, false o all.'})
    if active != 'all':
        qs = qs.filter(activa=active == 'true')
    search = params.get('search', '')
    if len(search) > 200:
        raise ValidationError({'search': 'Maximo 200 caracteres.'})
    for field in ('nombres', 'apellidos', 'telefono'):
        qs = qs.alias(**{field + '_search': Func(F(field), Value(ACCENTS), Value(PLAIN),
                                                function='translate', output_field=CharField())})
    term = unicodedata.normalize('NFC', ' '.join(search.split())).translate(str.maketrans(ACCENTS, PLAIN))
    for word in term.split():
        qs = qs.filter(Q(nombres_search__icontains=word) | Q(apellidos_search__icontains=word) | Q(telefono_search__icontains=word))
    return qs.order_by('apellidos', 'nombres', 'id')

