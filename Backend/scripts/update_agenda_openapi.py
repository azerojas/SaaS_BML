"""Build agenda contracts from live DTOs/routes while retaining previous phase APIs."""
import copy
import json
import re
import runpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
h=runpy.run_path(str(ROOT/'scripts/update_reporting_openapi.py'))
doc,schemas=h['doc'],h['schemas']
helpers=h['h']
register,ref,response=helpers['register'],helpers['ref'],helpers['response']
from apps.agenda.presentation import serializers as s
from apps.agenda.presentation.urls import router

inputs={'AgendaProfessionalInput':s.ProfessionalInput,'AgendaSpecialtiesInput':s.SpecialtiesInput,'AgendaScheduleInput':s.ScheduleInput,
        'AgendaBlockInput':s.BlockInput,'AgendaRetireInput':s.RetireInput,'AgendaBookingInput':s.BookingInput,'AgendaRescheduleInput':s.RescheduleInput,
        'AgendaCancelInput':s.CancelInput,'AgendaReason':s.Reason,'AgendaEmpty':s.StrictInput,'AgendaLinkInput':s.LinkInput,
        'AgendaWaitInput':s.WaitInput,'AgendaConvertInput':s.ConvertInput,'AgendaOfferInput':s.OfferInput,'AgendaConfigInput':s.ConfigInput}
for name,cls in inputs.items():register(name,cls,True)
for name,cls in {'AgendaProfessional':s.ProfessionalOutput,'AgendaSchedule':s.ScheduleOutput,'AgendaBlock':s.BlockOutput,
    'AgendaAppointment':s.AppointmentOutput,'AgendaAppointmentService':s.AppointmentServiceOutput,'AgendaWait':s.WaitOutput}.items():register(name,cls)

def exact(schema):
    if schema.get('type')=='object':schema['additionalProperties']=False
    if schema.get('format')=='decimal':schema['description']=schema.get('description','')+' Cadena JSON obligatoria.'
    for child in schema.values():
        if isinstance(child,dict):exact(child)
        elif isinstance(child,list):
            for item in child:
                if isinstance(item,dict):exact(item)

for name in inputs:exact(schemas[name])
for original in ['AgendaProfessional','AgendaSchedule','AgendaBlock']:
    schemas[original+'Patch']=copy.deepcopy(schemas[original+'Input'])
    schemas[original+'Patch'].pop('required',None)
schemas['AgendaSchedulePatch']['properties'].pop('profesional_id')
schemas['AgendaAppointmentDetail']=copy.deepcopy(schemas['AgendaAppointment'])
money={'type':'string','format':'decimal'}
identifier={'type':'integer','format':'int64'}
schemas['AgendaAppointmentDetail']['properties'].update({'servicios':{'type':'array','items':ref('AgendaAppointmentService')},
    'historial':{'type':'array','items':{'type':'object','properties':{'id':identifier,'estado_anterior':{'type':'string','nullable':True},'estado_nuevo':{'type':'string'},
    'cambiado_por_id':{**identifier,'nullable':True},'origen':{'type':'string'},'detalle':{'type':'string','nullable':True},'cambiado_en':{'type':'string','format':'date-time'}}}},
    'anticipo_confirmado':money,'anticipo_pendiente':money})
schemas['AgendaResult']={'type':'object','description':'Resultado minimo de escritura persistido para replay; nunca codigo/token de gestion ni PII.',
    'properties':{**{name:identifier for name in ['profesional_id','horario_id','bloqueo_id','cita_id','espera_id','visita_id','llegada_id','configuracion_id','expiradas','regularizadas','revisadas']},
    'estado':{'type':'string'},'activa':{'type':'boolean'},'retirado':{'type':'boolean'},'servicios':{'type':'array','items':identifier},
    'inicio_en':{'type':'string','format':'date-time'},'fin_en':{'type':'string','format':'date-time'},'expira_en':{'type':'string','format':'date-time','nullable':True},'precio_total':money,'anticipo_requerido':money}}
schemas['AgendaSpecialties']={'type':'object','properties':{'profesional_id':identifier,'servicios':{'type':'array','items':identifier}}}
schemas['AgendaWaitDetail']=copy.deepcopy(schemas['AgendaWait'])
schemas['AgendaWaitDetail']['properties']['cita_id']={**identifier,'nullable':True}
schemas['AgendaConfig']=copy.deepcopy(schemas['AgendaConfigInput'])
schemas['AgendaAvailability']={'type':'object','properties':{'timezone':{'type':'string','enum':['America/Lima']},'fecha_local':{'type':'string','format':'date'},
    'profesional_id':identifier,'servicios':{'type':'array','items':identifier},'duracion_minutos':identifier,'cupo_minutos':{'type':'integer','enum':[0,60]},'precio_total':money,'anticipo_requerido':money,
    'disponibilidad_es_propuesta':{'type':'boolean','enum':[True]},'pendientes_vencidas_ocupan_hasta_expirar':{'type':'boolean','enum':[True]},
    'slots':{'type':'array','items':{'type':'object','properties':{'inicio_en':{'type':'string','format':'date-time'},'fin_en':{'type':'string','format':'date-time'}}}}}}
outputs={'ProfessionalView':'AgendaProfessional','ScheduleView':'AgendaSchedule','BlockView':'AgendaBlock','AppointmentView':'AgendaAppointment','WaitView':'AgendaWait','CalendarView':'AgendaAppointment'}
create_inputs={'ProfessionalView':'AgendaProfessionalInput','ScheduleView':'AgendaScheduleInput','BlockView':'AgendaBlockInput','AppointmentView':'AgendaBookingInput','WaitView':'AgendaWaitInput'}
action_inputs={'especialidades':'AgendaSpecialtiesInput','reprogramar':'AgendaRescheduleInput','cancelar':'AgendaCancelInput','confirmar':'AgendaEmpty','completar':'AgendaEmpty','no_asistio':'AgendaReason',
    'vincular_llegada':'AgendaLinkInput','expirar':'AgendaEmpty','oferta_manual':'AgendaOfferInput','convertir':'AgendaConvertInput','configuracion':'AgendaConfigInput'}
def query(name,**schema):return {'name':name,'in':'query','schema':schema}
availability_params=[{**query('fecha',type='string',format='date'),'required':True},{**query('profesional_id',type='integer',minimum=1),'required':True},
    {**query('servicios',type='array',items={'type':'integer','minimum':1},minItems=1,maxItems=10),'required':True,'style':'form','explode':False}]
pagination=[query('page',type='integer',minimum=1,default=1),query('page_size',type='integer',minimum=1,maximum=100,default=20)]
idem={'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','format':'uuid'},'description':'UUID no nula por intencion; conservar clave/carga/destino en reintentos.'}
csrf={'name':'X-CSRFToken','in':'header','required':True,'schema':{'type':'string'}}

for url in router.urls:
    raw=str(url.pattern).removeprefix('^').removesuffix('$')
    path='/api/v1/agenda/'+re.sub(r'\(\?P<pk>[^)]+\)','{id}',raw)
    callback=url.callback
    methods={}
    for method,action in callback.actions.items():
        if method not in ('get','post','patch','put','delete'):continue
        cls=callback.cls
        name=cls.__name__
        output=outputs[name]
        params=[]
        if '{id}' in path:params.append({'name':'id','in':'path','required':True,'schema':{**identifier,'minimum':1}})
        if method=='get':
            if action=='list':
                params+=copy.deepcopy(pagination)
                if name=='ProfessionalView':params += [query('activa',type='string',enum=['true','false']),query('servicio_id',type='integer',minimum=1)]
                else:params += [query('profesional_id',type='integer',minimum=1)]
                if name in ('AppointmentView','WaitView','CalendarView'):
                    params += [query('clienta_id',type='integer',minimum=1),query('estado',type='string')]
                if name in ('BlockView','AppointmentView','WaitView','CalendarView'):
                    params += [query('desde',type='string',format='date'),query('hasta',type='string',format='date',description='Limite exclusivo; rango maximo93 dias. Interseccion de intervalos.')]
                    if name=='CalendarView':
                        for param in params:
                            if param['name'] in ('desde','hasta'):param['required']=True
                shape=helpers['h']['page'](output)
            else:
                if action=='retrieve' and name=='AppointmentView':output='AgendaAppointmentDetail'
                if action=='retrieve' and name=='WaitView':output='AgendaWaitDetail'
                if action=='especialidades':output='AgendaSpecialties'
                if action=='disponibilidad':output='AgendaAvailability';params+=copy.deepcopy(availability_params)
                if action=='configuracion':output='AgendaConfig'
                shape=ref(output)
            permission='view_agenda'
            input_schema=None
        else:
            params += [csrf,idem]
            permission=cls.action_permissions.get(action,'view_agenda')
            if action=='create':input_schema=create_inputs[name]
            elif action=='partial_update':input_schema=output+'Patch'
            elif action=='destroy':input_schema='AgendaRetireInput'
            else:input_schema=action_inputs[action]
            if name=='WaitView' and action=='cancelar':input_schema='AgendaReason'
            shape=ref('AgendaResult')
        status='201' if method=='post' and action in ('create','convertir') else '200'
        operation={'operationId':'agenda'+name.removesuffix('View')+action.title().replace('_','')+method.title(),
            'summary':action+' '+name.removesuffix('View'),'tags':['agenda-privada'],
            'description':'Cuenta activa staff y permiso agenda.'+permission+'. '+('Convertir requiere tambien manage_appointments. ' if action=='convertir' else '')+'Ver agenda-api.md: dinero y fechas siempre desde el backend; sin WhatsApp.',
            'parameters':params,'responses':{status:response('Correcto',shape),'400':response('Entrada o filtros invalidos',ref('ValidationError')),
                '403':response('Sin sesion/permiso/CSRF o excepcion no autorizada',ref('Error')),'404':response('Objeto inexistente',ref('Error')),
                '409':response('SLOT_NOT_AVAILABLE, estado, unicidad, anticipo o clave en conflicto; no cambios parciales',ref('Error')),
                '503':response('Permisos de agenda pendientes o configuracion ausente',ref('Error'))}}
        if input_schema:operation['requestBody']={'required':True,'content':{'application/json':{'schema':ref(input_schema)}}}
        methods[method]=operation
    doc['paths'][path]=methods

for resource in ['profesionales','servicios','disponibilidad']:
    if resource=='disponibilidad':schema=ref('AgendaAvailability')
    else:
        props={'id':identifier,'nombres':{'type':'string'},'apellidos':{'type':'string'}} if resource=='profesionales' else {'id':identifier,'nombre':{'type':'string'},'duracion_minutos':{**identifier,'nullable':True},'precio_base':money}
        schema={'type':'object','properties':{'timezone':{'type':'string','enum':['America/Lima']},'results':{'type':'array','maxItems':100,'items':{'type':'object','additionalProperties':False,'properties':props}},'reserva_publica_habilitada':{'type':'boolean','enum':[False]}}}
    doc['paths']['/api/v1/public/agenda/'+resource+'/']={'get':{'operationId':'agendaPublic'+resource.title(),'summary':'Consulta publica de '+resource,'tags':['agenda-publica'],'security':[],
        'description':'Solo lectura limitada por IP. Requiere configuracion/flag publico. No reserva/cancela citas, ni acepta telefono o token personal. Visibilidad explicita del profesional.',
        'parameters':copy.deepcopy(availability_params) if resource=='disponibilidad' else [],
        'responses':{'200':response('Consulta, nunca garantia de reserva',schema),'400':response('Consulta invalida',ref('ValidationError')),'404':response('Consulta no disponible',ref('Error')),
            '405':response('No hay operaciones publicas de reserva o gestion',ref('Error')),'429':response('Limite compartido PostgreSQL por IP',ref('Error')),'503':response('Modulo no activado',ref('Error'))}}}
doc['info']['version']='1.6.0'
doc['info']['description']=doc['info']['description'].split(' Fase 7:')[0]+' Fase 7: agenda privada, profesionales, horarios/bloqueos, reservas atomicas, anticipos, expiracion, enlace QR y lista de espera; consulta publica opcional sin alta/gestion anonima.'
(ROOT/'docs/openapi.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Agenda OpenAPI generated:',len(doc['paths']),'total paths.')
