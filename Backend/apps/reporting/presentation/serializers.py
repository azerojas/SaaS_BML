import re
from datetime import date
from django.utils import timezone
from rest_framework import serializers
from apps.reporting.domain.periods import ZONE, ReportFilter, preset_period
from apps.reporting.domain.errors import ReportError

METHODS=['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA','OTRO']
REPORTS=['overview','revenue-series','payment-methods','top-services','top-clients','inventory-alerts','expenses']
FILTERS={
    'overview':{'servicio_id','profesional_id'},
    'revenue-series':{'servicio_id','profesional_id'},
    'payment-methods':{'servicio_id','profesional_id','metodo'},
    'top-services':{'servicio_id','profesional_id','orden','limit','page','page_size'},
    'top-clients':{'servicio_id','profesional_id','orden','limit','page','page_size'},
    'inventory-alerts':{'categoria_id','page','page_size'},
    'expenses':{'categoria_id','page','page_size'},
    'clients-retention':set(),
}


class FilterInput(serializers.Serializer):
    desde=serializers.DateField(required=False)
    hasta=serializers.DateField(required=False)
    periodo=serializers.ChoiceField(choices=['day','week','month','custom'],required=False)
    fecha=serializers.DateField(required=False)
    granularidad=serializers.ChoiceField(choices=['day','week','month'],default='day')
    timezone=serializers.ChoiceField(choices=['America/Lima'],required=False)
    servicio_id=serializers.IntegerField(min_value=1,required=False)
    profesional_id=serializers.IntegerField(min_value=1,required=False)
    metodo=serializers.ChoiceField(choices=METHODS,required=False)
    categoria_id=serializers.IntegerField(min_value=1,required=False)
    page=serializers.IntegerField(min_value=1,max_value=5000,default=1)
    page_size=serializers.IntegerField(min_value=1,max_value=100,default=20)
    limit=serializers.IntegerField(min_value=1,max_value=100,default=100)
    orden=serializers.ChoiceField(choices=['importe','cantidad','visitas'],default='importe')
    report=serializers.ChoiceField(choices=REPORTS,required=False)


BASE={'desde','hasta','periodo','fecha','granularidad','timezone'}


def parse_filters(params, report, export=False):
    target=params.get('report','') if export else report
    if export and target not in REPORTS: raise serializers.ValidationError({'report':'Reporte permitido obligatorio.'})
    allowed=BASE|FILTERS[target]|({'report'} if export else set())
    if export: allowed-={'page','page_size'}
    if set(params)-allowed: raise serializers.ValidationError({'filtros':'Parametros desconocidos o incompatibles: '+', '.join(sorted(set(params)-allowed))})
    if hasattr(params,'getlist') and any(len(params.getlist(key))!=1 for key in params):
        raise serializers.ValidationError('No se permiten parametros repetidos.')
    for key in ('desde','hasta','fecha'):
        if key in params and not re.fullmatch(r'\d{4}-\d{2}-\d{2}',params[key]): raise serializers.ValidationError({key:'Usa YYYY-MM-DD.'})
    serializer=FilterInput(data=params)
    serializer.is_valid(raise_exception=True)
    data=serializer.validated_data
    if 'desde' in data or 'hasta' in data:
        if 'desde' not in data or 'hasta' not in data or data.get('periodo') not in (None,'custom') or 'fecha' in data:
            raise serializers.ValidationError('Rango requiere desde y hasta; no combinar con periodo predefinido/fecha.')
        start,end=data['desde'],data['hasta']
    else:
        if data.get('periodo')=='custom': raise serializers.ValidationError('custom requiere desde/hasta.')
        anchor=data.get('fecha',timezone.localdate(timezone=ZONE))
        if not 1900<=anchor.year<9998: raise serializers.ValidationError('Fecha fuera del rango 1900..9997.')
        start,end=preset_period(data.get('periodo','day'),anchor)
    ordering=data['orden']
    if target=='top-services' and ordering=='visitas' or target=='top-clients' and ordering=='cantidad':
        raise serializers.ValidationError({'orden':'Orden incompatible con el ranking.'})
    filters=ReportFilter(start,end,data['granularidad'],**{key:data.get(key) for key in ('servicio_id','profesional_id','metodo','categoria_id')})
    return filters,data,target


def parse_month(params):
    if set(params)!={'month'} or hasattr(params,'getlist') and len(params.getlist('month'))!=1 or not re.fullmatch(r'\d{4}-\d{2}',params.get('month','')):
        raise serializers.ValidationError({'month':'Indica solo month=YYYY-MM.'})
    try: month=date.fromisoformat(params['month']+'-01')
    except ValueError: raise serializers.ValidationError({'month':'Mes invalido.'}) from None
    today=timezone.localdate(timezone=ZONE)
    if month.year<1901 or month>today.replace(day=1): raise serializers.ValidationError({'month':'Mes futuro o anterior a 1901 no permitido.'})
    return params['month'],today
