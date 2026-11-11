"""Consolidated phase-4 API contract; earlier phase schemas remain intact."""
import copy
import json
import runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
h=runpy.run_path(str(ROOT/'scripts/update_inventory_openapi.py'))
doc,schemas=h['doc'],h['schemas']
ref,page,register,operation,response,query=h['ref'],h['page'],h['register'],h['operation'],h['response'],h['query']
identity,csrf,common=h['identity'],h['csrf'],h['common']
from apps.checkin.presentation import serializers as s
from apps.checkin.domain.rules import PUBLIC_MESSAGE


def op(*args,**kwargs):
    result=operation(*args,**kwargs)
    result['tags']=['checkin-publico' if kwargs.get('public') else 'checkin-admin']
    return result


for name,cls,is_input in [
    ('PuntoQR',s.PuntoOutput,False),('PuntoQRCreate',s.PuntoInput,True),
    ('CheckinPublicCreate',s.PublicCheckinInput,True),('Llegada',s.ArrivalListOutput,False),
    ('LlegadaManualCreate',s.ManualArrivalInput,True),('ConfirmarLlegada',s.ConfirmInput,True),
    ('ResolverLlegada',s.ResolutionInput,True),('AsociarVisita',s.AssociateVisitInput,True),
    ('EnlazarCita',s.LinkAppointmentInput,True),('VisitaCheckin',s.VisitOutput,False)]:
    register(name,cls,is_input)
schemas['PuntoQRPatch']=copy.deepcopy(schemas['PuntoQRCreate'])
schemas['PuntoQRPatch'].pop('required',None)
schemas['LlegadaDetalle']=copy.deepcopy(schemas['Llegada'])
schemas['LlegadaDetalle']['properties'].update({
    'visita':{'allOf':[ref('VisitaCheckin')],'nullable':True},
    'citas_sugeridas':{'type':'array','items':{'type':'object','properties':{
        'id':{'type':'integer'},'inicio_en':{'type':'string','format':'date-time'},
        'fin_en':{'type':'string','format':'date-time'},'estado':{'type':'string'}}}},
    'ultima_resolucion':{'type':'object','nullable':True,'properties':{
        'accion':{'type':'string'},'creada_en':{'type':'string','format':'date-time'},'datos':{'type':'object'}}}})
schemas['Llegada']['properties']['vencida']={'type':'boolean','readOnly':True}
schemas['LlegadaDetalle']['properties']['vencida']={'type':'boolean','readOnly':True}
schemas['CheckinPublicResult']={'type':'object','required':['detail'],'additionalProperties':False,
    'properties':{'detail':{'type':'string','enum':[PUBLIC_MESSAGE]}}}
schemas['CheckinPublicForm']={'type':'object','additionalProperties':False,'properties':{
    'establecimiento':{'type':'string'},'requiere_confirmacion_presencial':{'type':'boolean','enum':[True]},
    'consentimiento_preseleccionado':{'type':'boolean','enum':[False]},
    'aviso_privacidad':{'type':'object','properties':{'url':{'type':'string'},'version':{'type':'string'},'solo_pruebas':{'type':'boolean'}}},
    'campos':{'type':'array','items':{'type':'string'}}}}
schemas['CheckinDemoNotice']={'type':'object','properties':{'version':{'type':'string'},'solo_pruebas':{'type':'boolean','enum':[True]},
    'texto':{'type':'string'},'consentimiento_preseleccionado':{'type':'boolean','enum':[False]}}}
schemas['PuntoQREnlace']={'type':'object','properties':{'enlace':{'type':'string','format':'uri'},'formatos':{'type':'array','items':{'type':'string','enum':['svg','png']}}}}
schemas['LlegadasExpiradas']={'type':'object','properties':{'canceladas':{'type':'integer','minimum':0}}}
token={'name':'token','in':'path','required':True,'schema':{'type':'string','format':'uuid'}}
public_get=op('checkinPublicForm','Formulario minimo de un punto activo','CheckinPublicForm',public=True)
public_post=op('checkinPublicRequest','Solicitud no enumerativa, pendiente de verificacion humana','CheckinPublicResult','CheckinPublicCreate',
               status='202',public=True)
for method in [public_get,public_post]:
    method['responses']['429']=response('Limite compartido por IP/huella/telefono',ref('Error'))
    method['responses']['503']=response('Modo de prueba bloqueado con DEBUG False',ref('Error'))
public_post['responses'].pop('409',None)
public_post['responses']['415']=response('Solo application/json; maximo 8192 bytes',ref('Error'))
public_post['description']='La misma respuesta 202 para telefono existente, desconocido con datos incompletos, inactivo o solicitud pendiente. No devuelve identidad, IDs ni existencia de ficha. Alta nueva provisional requiere nombres/apellidos, consentimiento JSON true y aviso vigente; no activa historial ni crea visita.'
doc['paths']['/api/public/checkin/{token}/']={'parameters':[token],'get':public_get,'post':public_post}
doc['paths']['/api/public/checkin/aviso-prueba/']={'get':op('checkinDemoNotice','Aviso local solo para datos ficticios','CheckinDemoNotice',public=True)}
base='/api/admin/checkin/'
doc['paths'][base+'puntos/']={
    'get':op('checkinPoints','Listar puntos sin publicar tokens','PuntoQR',params=h['helpers']['pagination'],paginated=True),
    'post':op('checkinPointCreate','Crear punto; UUID generado en PostgreSQL','PuntoQR','PuntoQRCreate',status='201',params=[csrf])}
doc['paths'][base+'puntos/{id}/']={'parameters':[identity],
    'get':op('checkinPointGet','Detalle privado de punto','PuntoQR'),
    'patch':op('checkinPointPatch','Editar nombre o habilitar/deshabilitar punto','PuntoQR','PuntoQRPatch',params=[csrf])}
qr=op('checkinPointQR','Enlace o QR descargable de punto activo','PuntoQREnlace',params=[query('formato',enum=['json','svg','png'],default='json')])
qr['responses']['200']['content'].update({'image/svg+xml':{'schema':{'type':'string','format':'binary'}},'image/png':{'schema':{'type':'string','format':'binary'}}})
doc['paths'][base+'puntos/{id}/qr/']={'parameters':[identity],'get':qr}
doc['paths'][base+'llegadas/']={
    'get':op('checkinInbox','Bandeja privada sin historial clinico/notas','Llegada',params=common+[
        query('estado',enum=['PENDIENTE','CONFIRMADA','RECHAZADA','CANCELADA']),
        query('vigentes',enum=['true','false','all'],default='true'),query('punto','integer',minimum=1),
        query('desde',format='date'),query('hasta',format='date')],paginated=True),
    'post':op('checkinManualArrival','Solicitud manual de una ficha activa validada','LlegadaDetalle','LlegadaManualCreate',status='201',params=[csrf])}
doc['paths'][base+'llegadas/{id}/']={'parameters':[identity],'get':op('checkinArrivalDetail','Detalle de recepcion, resolucion y sugerencias de cita','LlegadaDetalle')}
for action,input_schema in [('confirmar','ConfirmarLlegada'),('rechazar','ResolverLlegada'),('cancelar','ResolverLlegada')]:
    doc['paths'][base+'llegadas/{id}/'+action+'/']={'parameters':[identity],
        'post':op('checkin'+action.title(),action.title()+' solicitud pendiente','LlegadaDetalle',input_schema,params=[csrf])}
doc['paths'][base+'llegadas/expirar/']={'post':op('checkinExpire','Pasar pendientes vencidas a CANCELADA, maximo 200 por llamada','LlegadasExpiradas',params=[csrf])}
for action,input_schema in [('crear-visita',None),('asociar-visita','AsociarVisita'),('enlazar-cita','EnlazarCita')]:
    method=op('checkin'+action.title().replace('-',''),action+' solo tras confirmacion humana','VisitaCheckin',input_schema,params=[csrf])
    method['responses']['409']=response('Estado, ficha, cita o visita incompatible',ref('Error'))
    doc['paths'][base+'llegadas/{id}/'+action+'/']={'parameters':[identity],'post':method}
if tuple(map(int,doc['info']['version'].split('.'))) < (1,3,0):
    doc['info']['version']='1.3.0'
phase5_suffix=' Fase 5:'+doc['info']['description'].split(' Fase 5:',1)[1] if ' Fase 5:' in doc['info']['description'] else ''
doc['info']['description']=doc['info']['description'].split(' Fase 4:')[0]+' Fase 4: check-in QR no enumerativo, verificacion presencial y visitas sin cobros.'+phase5_suffix
(ROOT/'docs/openapi.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Check-in OpenAPI generated:',len(doc['paths']),'total paths.')

