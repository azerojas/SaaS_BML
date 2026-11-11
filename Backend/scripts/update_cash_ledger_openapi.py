"""Extend prior contracts with the reviewed cash ledger routes."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'docs/openapi.json'
doc=json.loads(p.read_text(encoding='utf-8'))
schemas=doc['components']['schemas']
schemas['CashRefundInput']={'type':'object','additionalProperties':False,'required':['monto','metodo','motivo','devolucion_verificada'],'properties':{'pago_id':{'type':'integer','minimum':1},'anticipo_id':{'type':'integer','minimum':1},'monto':{'type':'string','pattern':r'^\d+\.\d{2}$'},'metodo':{'type':'string','enum':['EFECTIVO','YAPE','PLIN','TRANSFERENCIA','TARJETA','OTRO']},'motivo':{'type':'string','minLength':8,'maxLength':250},'referencia':{'type':'string','pattern':'^[A-Z0-9_-]{4,100}$'},'devolucion_verificada':{'type':'boolean','enum':[True]}}}
schemas['CashAdjustmentInput']={'type':'object','additionalProperties':False,'required':['monto','motivo'],'properties':{'monto':{'type':'string'},'motivo':{'type':'string','minLength':8,'maxLength':250}}}
schemas['CashReconciliationInput']={'type':'object','additionalProperties':False,'required':['fecha','metodo','observado','evidencia_sha256','referencia'],'properties':{'fecha':{'type':'string','format':'date'},'metodo':schemas['CashRefundInput']['properties']['metodo'],'observado':{'type':'string'},'evidencia_sha256':{'type':'string','pattern':'^[a-f0-9]{64}$'},'referencia':{'type':'string','minLength':8,'maxLength':100}}}
for path,name,permission in [('/api/reembolsos/','CashRefundInput','refund_payment'),('/api/conciliaciones/','CashReconciliationInput','reconcile_cash'),('/api/ventas/{id}/ajustar/','CashAdjustmentInput','adjust_sale')]:
 methods=['post'] if '{id}' in path else ['get','post']
 spec={}
 for method in methods:
  params=[]
  if '{id}' in path:params.append({'name':'id','in':'path','required':True,'schema':{'type':'integer','minimum':1}})
  if method=='post':params += [{'name':key,'in':'header','required':True,'schema':{'type':'string'}} for key in ['X-CSRFToken','Idempotency-Key']]
  operation={'operationId':name+'_'+method,'summary':permission+' '+method,'description':'Sesi?n staff + MFA seg?n entorno. Permiso finanzas.'+('view_finance' if method=='get' and path=='/api/reembolsos/' else permission)+'. Importes Decimal en cadenas; no modifica stock ni snapshots.','security':[{'sessionCookie':[]}],'parameters':params,'responses':{str(code):{'description':label} for code,label in [(200,'Consulta paginada'),(201,'Operaci?n registrada'),(400,'Validaci?n'),(403,'Sin permiso/CSRF/MFA'),(404,'No existe'),(409,'Conflicto o cierre no cuadra'),(503,'No disponible')]}}
  if method=='post':operation['requestBody']={'required':True,'content':{'application/json':{'schema':{'$ref':'#/components/schemas/'+name}}}}
  spec[method]=operation
 doc['paths'][path]=spec
doc['info']['version']='8.1.0'
p.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Cash ledger contracts:',len(doc['paths']),'paths')
