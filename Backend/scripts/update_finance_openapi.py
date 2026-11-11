"""Generate Phase 5 contracts from the implemented DTOs, retaining earlier APIs."""
import copy
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
h = runpy.run_path(str(ROOT / 'scripts/update_checkin_openapi.py'))
doc, schemas = h['doc'], h['schemas']
ref, register, operation, response, query = (h[name] for name in ('ref','register','operation','response','query'))
from apps.finanzas.presentation import serializers as s

inputs = {
    'FinanceVisitCreate': s.VisitCreate, 'FinanceVisitNotes': s.VisitNotes,
    'FinanceReason': s.Reason, 'FinanceSaleCreate': s.SaleCreate, 'FinanceSalePatch': s.SaleUpdate,
    'FinancePreviewInput': s.Preview, 'FinanceConfirm': s.ConfirmSale,
    'FinancePaymentInput': s.PaymentInput, 'FinanceVoidPayment': s.VoidPayment,
    'FinanceAdvanceCreate': s.AdvanceCreate, 'FinanceAdvanceConfirm': s.AdvanceConfirm,
    'FinanceAdvanceApply': s.AdvanceApply,
}
for name, cls in inputs.items():
    register(name, cls, True)
for name, cls in {
    'FinanceVisit':s.VisitOutput, 'FinanceSaleList':s.SaleListOutput,
    'FinanceSale':s.SaleOutput, 'FinancePayment':s.PaymentOutput,
    'FinanceAdvance':s.AdvanceOutput, 'FinanceProfessional':s.ProfessionalOutput,
}.items():
    register(name, cls)

def exact(schema):
    if schema.get('type') == 'object': schema['additionalProperties'] = False
    if schema.get('format') == 'decimal':
        schema['description'] += ' Cadena JSON obligatoria; no enviar numeros JSON.'
    for child in schema.values():
        if isinstance(child, dict): exact(child)
        elif isinstance(child, list):
            for item in child:
                if isinstance(item, dict): exact(item)

for name in inputs: exact(schemas[name])
amount = {'type':'string','format':'decimal','example':'25.00'}
identifier = {'type':'integer','format':'int64'}
schemas['FinanceBalance'] = {'type':'object','properties':{
    **{key:copy.deepcopy(amount) for key in ('subtotal','descuento_global','propina','total','pagos_confirmados','anticipos_aplicados','cobertura_total','saldo_pendiente')},
    'venta_id':identifier,'estado':{'type':'string'},'moneda':{'type':'string','enum':['PEN']}}}
schemas['FinanceResult'] = {'type':'object','description':'Resultado minimo persistido para reintentos. Consultar GET del recurso para detalle completo.',
    'properties':{**copy.deepcopy(schemas['FinanceBalance']['properties']),
                  'id':identifier,'visita_id':identifier,'pago_id':identifier,'anticipo_id':identifier,
                  'aplicacion_id':identifier,**{key:copy.deepcopy(amount) for key in ('monto','aplicado','disponible')},'saldo':ref('FinanceBalance')}}
schemas['FinanceVisit']['properties'].update({'venta_id':{**identifier,'nullable':True},
    'historial':{'type':'array','items':{'type':'object','properties':{
        'accion':{'type':'string'},'creada_en':{'type':'string','format':'date-time'},'usuario_id':identifier}}}})
schemas['FinanceAdvanceDetail'] = copy.deepcopy(schemas['FinanceAdvance'])
schemas['FinanceAdvanceDetail']['properties'].update({key:copy.deepcopy(amount) for key in ('aplicado','disponible')})
schemas['FinanceApplicableAdvances'] = {'type':'object','properties':{'venta_id':identifier,
    'anticipos':{'type':'array','items':ref('FinanceAdvanceDetail')}}}
schemas['FinanceSale']['properties'].update({
    'saldo':ref('FinanceBalance'),
    'finanzas_congeladas':{'type':'object','nullable':True,'properties':{
        **{key:copy.deepcopy(amount) for key in ('costo_directo','comisiones','ingreso_sin_propina','margen_antes_gastos')},
        'politica_costo':{'type':'string'}}},
    'aplicaciones_anticipo':{'type':'array','items':{'type':'object','properties':{
        'id':identifier,'anticipo_id':identifier,'monto':amount,'creada_en':{'type':'string','format':'date-time'}}}}})
schemas['FinancePreview'] = {'type':'object','description':'Lectura sin descontar stock. Se vuelve a validar al confirmar.', 'properties':{
    **{key:copy.deepcopy(amount) for key in ('subtotal','descuento_global','propina','total')},
    'venta_id':identifier,'moneda':{'type':'string','enum':['PEN']},'afecta_stock':{'type':'boolean','enum':[False]},
    'origen_consumos':{'type':'string','enum':['RECETA_ESTIMADA','REAL_PROPUESTO']},
    'politica_costo':{'type':'string'},'costo_directo_estimado':{**amount,'nullable':True},
    'receta_sugerida':copy.deepcopy(schemas['FinanceConfirm']['properties']['consumos_reales']),
    'stock_consultado':{'type':'array','items':{'type':'object','properties':{
        'articulo_id':identifier,'cantidad_requerida':amount,'existencia_actual':amount,
        'costo_unitario_estimado':{**amount,'nullable':True},'suficiente':{'type':'boolean'}}}}}}
schemas['FinanceEmpty'] = {'type':'object','additionalProperties':False}
idem = {'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','format':'uuid'},
        'description':'UUID no nula por actor/operacion. Conservar en reintento exacto; otro destino o payload da 409. Sin caducidad automatica.'}
pagination = h['h']['helpers']['pagination']
dates = [query('desde',format='date'), query('hasta',format='date')]

def op(name, summary, output, input=None, permission='view_finance', mutation=False, **kw):
    result = operation(name,summary,output,input,params=([h['csrf'],idem] if mutation else [])+kw.pop('params',[]),**kw)
    result['tags'] = ['finanzas']
    result['description'] = 'Requiere cuenta activa staff y permiso finanzas.'+permission+'. '+(
        'Transaccion atomica e idempotente; respuesta previa conservada con su estado HTTP original.' if mutation else '')
    result['responses']['409'] = response('Estado, saldo, inventario, conciliacion o clave incompatible',ref('Error'))
    result['responses']['503'] = response('Migracion aditiva pendiente: modulo no activado',ref('Error'))
    return result

def detail(path, methods):
    doc['paths'][path] = {'parameters':[h['identity']], **methods}

doc['paths']['/api/visitas/'] = {
    'get':op('financeVisits','Listar visitas','FinanceVisit',paginated=True,params=pagination+dates+[
        query('clienta','integer'),query('llegada','integer'),query('cita','integer'),query('estado',enum=['ABIERTA','FINALIZADA','CANCELADA'])]),
    'post':op('financeVisitCreate','Abrir visita manual o llegada confirmada','FinanceResult','FinanceVisitCreate','manage_visits',True,status='201')}
detail('/api/visitas/{id}/',{
    'get':op('financeVisitDetail','Visita e historial','FinanceVisit'),
    'patch':op('financeVisitNotes','Editar notas de visita abierta','FinanceResult','FinanceVisitNotes','manage_visits',True)})
for action, schema in [('cancelar','FinanceReason'),('finalizar','FinanceEmpty')]:
    detail('/api/visitas/{id}/'+action+'/',{'post':op('financeVisit'+action.title(),action+' visita','FinanceResult',schema,'manage_visits',True)})

doc['paths']['/api/ventas/'] = {
    'get':op('financeSales','Listar ventas','FinanceSaleList',paginated=True,params=pagination+dates+[
        query('clienta','integer'),query('visita','integer'),query('estado',enum=['BORRADOR','CONFIRMADA','ANULADA'])]),
    'post':op('financeSaleCreate','Crear borrador sin afectar existencias','FinanceResult','FinanceSaleCreate','manage_sales',True,status='201')}
doc['paths']['/api/ventas/profesionales/'] = {'get':op('financeProfessionals','Profesionales activos configurados','FinanceProfessional',paginated=True,params=pagination)}
detail('/api/ventas/{id}/',{
    'get':op('financeSaleDetail','Detalle, snapshots y saldo','FinanceSale'),
    'patch':op('financeSalePatch','Reemplazar lineas o editar borrador','FinanceResult','FinanceSalePatch','manage_sales',True)})
preview=op('financeSalePreview','Previsualizar borrador sin escrituras','FinancePreview','FinancePreviewInput',params=[h['csrf']])
detail('/api/ventas/{id}/previsualizar/',{'post':preview})
for action, schema, perm, status in [
    ('confirmar','FinanceConfirm','confirm_sale','200'),('anular','FinanceReason','manage_sales','200'),
    ('pagar','FinancePaymentInput','register_payment','201'),('aplicar-anticipo','FinanceAdvanceApply','apply_advance','201')]:
    detail('/api/ventas/{id}/'+action+'/',{'post':op('financeSale'+action.title().replace('-',''),action+' venta','FinanceResult',schema,perm,True,status=status)})
detail('/api/ventas/{id}/anticipos-aplicables/',{'get':op('financeApplicableAdvances','Anticipos disponibles para la misma atencion','FinanceApplicableAdvances')})
doc['paths']['/api/pagos/'] = {'get':op('financePayments','Listar pagos','FinancePayment',paginated=True,
    params=pagination+dates+[query('venta','integer'),query('estado',enum=['CONFIRMADO','ANULADO'])])}
detail('/api/pagos/{id}/',{'get':op('financePaymentDetail','Detalle de pago','FinancePayment')})
detail('/api/pagos/{id}/anular/',{'post':op('financePaymentVoid','Corregir pago registrado por error; no es reembolso','FinanceResult','FinanceVoidPayment','void_payment',True)})
doc['paths']['/api/anticipos/'] = {
    'get':op('financeAdvances','Listar anticipos','FinanceAdvance',paginated=True,params=pagination+dates+[
        query('cita','integer'),query('estado',enum=['PENDIENTE','CONFIRMADO','ANULADO','REEMBOLSADO'])]),
    'post':op('financeAdvanceCreate','Crear anticipo pendiente','FinanceResult','FinanceAdvanceCreate','manage_advances',True,status='201')}
detail('/api/anticipos/{id}/',{'get':op('financeAdvanceDetail','Detalle y monto disponible','FinanceAdvanceDetail')})
for action, schema in [('confirmar','FinanceAdvanceConfirm'),('anular','FinanceReason')]:
    detail('/api/anticipos/{id}/'+action+'/',{'post':op('financeAdvance'+action.title(),action+' anticipo','FinanceResult',schema,'manage_advances',True)})
if tuple(map(int,doc['info']['version'].split('.'))) < (1,4,0):
    doc['info']['version']='1.4.0'
phase6_suffix=' Fase 6:'+doc['info']['description'].split(' Fase 6:',1)[1] if ' Fase 6:' in doc['info']['description'] else ''
doc['info']['description']=doc['info']['description'].split(' Fase 5:')[0]+' Fase 5: visitas, ventas, consumos reales, pagos parciales y aplicaciones de anticipos; activacion requiere migracion aditiva aprobada.'+phase6_suffix
(ROOT/'docs/openapi.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Finance OpenAPI generated:',len(doc['paths']),'total paths.')
