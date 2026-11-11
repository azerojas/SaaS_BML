"""Consolidated Phase-6 contract. No database mutation or business calculations."""
import copy
import json
import runpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
h=runpy.run_path(str(ROOT/'scripts/update_finance_openapi.py'))
doc,schemas=h['doc'],h['schemas']
ref=h['ref']
from apps.reporting.presentation.serializers import FILTERS,REPORTS,METHODS
from apps.reporting.domain.metrics import DEFINITIONS

money={'type':'string','format':'decimal','example':'125.50'}
nullable_money={**money,'nullable':True}
integer={'type':'integer','minimum':0}
meta={'type':'object','required':['desde','hasta','hasta_exclusiva','timezone','moneda','granularidad','filtros','alcance_ventas'],
      'properties':{'desde':{'type':'string','format':'date'},'hasta':{'type':'string','format':'date'},
                    'hasta_exclusiva':{'type':'boolean','enum':[True]},'timezone':{'type':'string','enum':['America/Lima']},
                    'moneda':{'type':'string','enum':['PEN']},'granularidad':{'type':'string','enum':['day','week','month']},
                    'filtros':{'type':'object'},'alcance_ventas':{'type':'string','enum':['ESTABLECIMIENTO','COHORTE_VENTAS_COMPLETAS']}}}
schemas['AnalyticsPeriod']=meta
schemas['AnalyticsQuality']={'type':'object','required':['recaudacion_conciliada','dinero_recaudado_habilitado','advertencias'],
    'properties':{'recaudacion_conciliada':{'type':'boolean','enum':[False]},'dinero_recaudado_habilitado':{'type':'boolean','enum':[False]},
                  'advertencias':{'type':'array','items':{'type':'string'}}}}
base={'periodo':ref('AnalyticsPeriod'),'generado_en':{'type':'string','format':'date-time'},'calidad':ref('AnalyticsQuality')}
metric_names=['ventas_confirmadas','propinas','ingreso_por_servicios','ingreso_por_productos','ingreso_operativo','costo_directo','costo_servicios','costo_productos',
    'margen_servicios_antes_comisiones','margen_productos','comisiones','margen_contribucion','margen_tras_comisiones','saldo_pendiente','ticket_promedio',
    'cobros_registrados','anticipos_recibidos','dinero_recaudado','gastos_operativos','utilidad_estimada']
counts=['numero_ventas','visitas_finalizadas','clientas_unicas_atendidas','stock_bajo','cumpleanios_proximos','clientas_inactivas']
schemas['AnalyticsIndicators']={'type':'object','required':metric_names+counts,'properties':{
    **{key:{**nullable_money,'description':DEFINITIONS.get(key,'Desglose de snapshots; ver matriz KPI.')} for key in metric_names},
    **{key:integer for key in counts}}}
schemas['AnalyticsOverview']={'type':'object','properties':{**base,'indicadores':ref('AnalyticsIndicators'),
    'definiciones':{'type':'object','additionalProperties':{'type':'string'}},'alcance_saldo':{'type':'string'},
    'referencia_indicadores_clientas':{'type':'string','format':'date'},'ventas_asignables_al_periodo':{'type':'boolean'},'utilidad_estimada_habilitada':{'type':'boolean'}}}
schemas['AnalyticsRevenueRow']={'type':'object','properties':{
    **{key:{'type':'string','format':'date'} for key in ['inicio_periodo','desde','hasta']},'etiqueta':{'type':'string'},
    **{key:money for key in ['ventas_confirmadas','cobros_registrados','anticipos_recibidos']}}}
schemas['AnalyticsPaymentRow']={'type':'object','properties':{'metodo':{'type':'string','enum':METHODS},'cobros_registrados':money,'anticipos_recibidos':money,'pagos_count':integer,'anticipos_count':integer}}
schemas['AnalyticsServiceRow']={'type':'object','properties':{'servicio_id':integer,'descripcion_snapshot':{'type':'string'},'cantidad':{'type':'string','format':'decimal'},
    'ingreso':nullable_money,'costo_directo':nullable_money,'comisiones':nullable_money,'numero_ventas':integer}}
schemas['AnalyticsClientRow']={'type':'object','additionalProperties':False,'properties':{'clienta_id':integer,'nombre':{'type':'string'},'ventas_confirmadas':money,'numero_ventas':integer,'visitas_finalizadas':integer}}
schemas['AnalyticsInventoryRow']={'type':'object','properties':{'articulo_id':integer,'nombre':{'type':'string'},'tipo':{'type':'string'},'unidad':{'type':'string'},
    'stock_minimo':{'type':'string','format':'decimal'},'existencia':{'type':'string','format':'decimal'},'bajo_minimo':{'type':'boolean'}}}
schemas['AnalyticsExpenseRow']={'type':'object','properties':{'categoria_id':integer,'categoria':{'type':'string'},'monto':money,'cantidad':integer}}
mapping={'revenue-series':('AnalyticsRevenueSeries','AnalyticsRevenueRow'), 'payment-methods':('AnalyticsPaymentMethods','AnalyticsPaymentRow'),
         'top-services':('AnalyticsTopServices','AnalyticsServiceRow'),'top-clients':('AnalyticsTopClients','AnalyticsClientRow'),
         'inventory-alerts':('AnalyticsInventory','AnalyticsInventoryRow'),'expenses':('AnalyticsExpenses','AnalyticsExpenseRow')}
page_props={'count':integer,'total_grupos':integer,'next':{'type':'string','nullable':True},'previous':{'type':'string','nullable':True}}
for report,(name,row) in mapping.items():
    props={**base,'results':{'type':'array','items':ref(row)}}
    if 'page' in FILTERS[report]:props.update(page_props)
    if report=='inventory-alerts':props.update({'foto_actual':{'type':'boolean','enum':[True]},'valoracion_total':nullable_money,
        'estadisticas':{'type':'object','properties':{key:integer for key in ['articulos_activos','stock_bajo','sin_existencia','stock_negativo']}}})
    if report=='expenses':props['total']=money
    if report in ('top-services','top-clients'):props['orden_efectivo' if report=='top-services' else 'incluye']={'type':'string'}
    if report=='top-clients':props['sin_clienta_ventas']=integer
    if report=='revenue-series':props.update({'fuentes_fecha':{'type':'object'},'anticipo_aplicado_es_nuevo_cobro':{'type':'boolean','enum':[False]}})
    if report=='payment-methods':props['componentes_separados']={'type':'boolean','enum':[True]}
    schemas[name]={'type':'object','properties':props}
schemas['AnalyticsMonthComparison']={'type':'object','properties':{'month':{'type':'string'},'timezone':{'type':'string'},'moneda':{'type':'string'},
    'parcial_mismo_dia':{'type':'boolean'},'incluye_dia_actual':{'type':'boolean'},'actual':ref('AnalyticsOverview'),'anterior':ref('AnalyticsOverview'),
    'comparacion':{'type':'object','additionalProperties':{'type':'object','properties':{'diferencia':nullable_money,'variacion_porcentaje':nullable_money}}}}}
schemas['AnalyticsRetention']={'type':'object','properties':{**base,'indicadores':{'type':'object','properties':{
    **{key:integer for key in ['cumpleanios_proximos','clientas_inactivas','ventana_cumpleanios_dias','inactividad_dias']},'referencia':{'type':'string','format':'date'}}},'alcance':{'type':'string'}}}

def query(name, **schema):return {'name':name,'in':'query','schema':schema}

base_params=[query('desde',type='string',format='date',description='Inicio inclusivo; requiere hasta.'),query('hasta',type='string',format='date',description='Limite EXCLUSIVO; requiere desde.'),
    query('periodo',type='string',enum=['day','week','month','custom'],default='day'),query('fecha',type='string',format='date',description='Ancla local para periodo predefinido; predeterminado hoy.'),
    query('granularidad',type='string',enum=['day','week','month'],default='day',description='Maximo 366 dias day, 3660 week/month.'),query('timezone',type='string',enum=['America/Lima'])]
extras={key:query(key,type='integer',minimum=1) for key in ['servicio_id','profesional_id','categoria_id']}
extras.update({'metodo':query('metodo',type='string',enum=METHODS),'orden':query('orden',type='string',enum=['importe','cantidad','visitas'],default='importe'),
    'limit':query('limit',type='integer',minimum=1,maximum=100,default=100),'page':query('page',type='integer',minimum=1,maximum=5000,default=1),
    'page_size':query('page_size',type='integer',minimum=1,maximum=100,default=20)})

def operation(name, schema, permission, params):
    return {'operationId':name,'summary':name,'tags':['reporting'],'description':'Cuenta activa staff y permiso reporting.'+permission+'. Solo lectura de negocio; Decimal como cadenas. Componentes de caja separados; neto conciliado bloqueado. Ver reporting-api.md.',
        'parameters':params,'responses':{'200':h['response']('Correcto',ref(schema)),
            '400':h['response']('Filtros invalidos o no admitidos',ref('ValidationError')),'403':h['response']('Sin sesion o permiso',ref('Error')),
            '404':h['response']('Pagina inexistente',ref('Error')),'422':h['response']('Rango/volumen/timeout excedido; nunca totales truncados',ref('Error')),
            '503':h['response']('Permisos pendientes de activar',ref('Error'))}}

for report in REPORTS:
    schema='AnalyticsOverview' if report=='overview' else mapping[report][0]
    params=copy.deepcopy(base_params)+[copy.deepcopy(extras[key]) for key in sorted(FILTERS[report])]
    if report in ('top-services','top-clients'):
        next(param for param in params if param['name']=='orden')['schema']['enum']=['importe','cantidad'] if report=='top-services' else ['importe','visitas']
    permission={'top-clients':'view_clients','inventory-alerts':'view_inventory'}.get(report,'view_summary')
    doc['paths']['/api/v1/analytics/'+report+'/']={'get':operation('analytics'+report.title().replace('-',''),schema,permission,params)}
doc['paths']['/api/v1/analytics/month-comparison/']={'get':operation('analyticsMonthComparison','AnalyticsMonthComparison','view_summary',[
    {**query('month',type='string',pattern=r'^\d{4}-\d{2}$'),'required':True}])}
doc['paths']['/api/v1/analytics/clients/retention/']={'get':operation('analyticsClientsRetention','AnalyticsRetention','view_clients',copy.deepcopy(base_params))}
export=operation('reportExportXlsx','AnalyticsOverview','export',copy.deepcopy(base_params)+[
    {**query('report',type='string',enum=REPORTS),'required':True}]+[copy.deepcopy(extras[key]) for key in extras if key not in ('page','page_size')])
export['description']='Requiere reporting.export ADEMAS del permiso de consulta del reporte elegido. Filtros segun ese reporte; no page/page_size. Maximo 10000 filas, 10 MiB y 5 archivos/minuto/cuenta. Solo escribe auditoria de acceso; sin PII. XLSX sin formulas, textos forzados a literal. Nulo no significa cero.'
export['responses']['200']={'description':'Excel: Resumen y hoja correspondiente al reporte, con mismos calculos que API.',
    'headers':{'Content-Disposition':{'schema':{'type':'string'}},'Cache-Control':{'schema':{'type':'string','enum':['no-store, private']}}},
    'content':{'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':{'schema':{'type':'string','format':'binary'}}}}
export['responses']['429']=h['response']('Limite de exportaciones por cuenta',ref('Error'))
doc['paths']['/api/v1/reports/export.xlsx']={'get':export}
if tuple(map(int,doc['info']['version'].split('.'))) < (1,5,0):doc['info']['version']='1.5.0'
phase7_suffix=' Fase 7:'+doc['info']['description'].split(' Fase 7:',1)[1] if ' Fase 7:' in doc['info']['description'] else ''
doc['info']['description']=doc['info']['description'].split(' Fase 6:')[0]+' Fase 6: dashboard, series, rankings, inventario y Excel; recaudacion neta bloqueada hasta disponer de ledger conciliable de reembolsos.'+phase7_suffix
(ROOT/'docs/openapi.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Reporting OpenAPI generated:',len(doc['paths']),'total paths.')
