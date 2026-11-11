"""Regenerate the consolidated inventory contract without changing earlier API shapes."""
import copy
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/update_catalog_openapi.py'))
doc, schemas = helpers['doc'], helpers['schemas']
ref, page, query = helpers['ref'], helpers['page'], helpers['query']
register, operation, response = helpers['register'], helpers['operation'], helpers['response']
csrf, identity, common = helpers['csrf'], helpers['identity'], helpers['common']
from apps.inventario.api import serializers as s
from apps.inventario.domain.politicas import COST_POLICY


def op(*args, **kwargs):
    result = operation(*args, **kwargs)
    result['tags'] = ['inventario-admin']
    return result


for name, cls, is_input in [
    ('Proveedor',s.ProveedorOutput,False),('ProveedorCreate',s.ProveedorInput,True),
    ('DetalleCompraCreate',s.DetalleInput,True),('DetalleCompra',s.DetalleOutput,False),
    ('CompraCreate',s.CompraInput,True),('Compra',s.CompraOutput,False),
    ('CompraLista',s.CompraListOutput,False),('AjusteCreate',s.AjusteInput,True),
    ('Movimiento',s.MovimientoOutput,False),('StockInventario',s.InventarioStockOutput,False),
    ('AlertaVencimiento',s.VencimientoOutput,False)]:
    register(name,cls,is_input)
for name in ['Proveedor','Compra']:
    schemas[name+'Patch']=copy.deepcopy(schemas[name+'Create'])
    schemas[name+'Patch'].pop('required',None)
schemas['StockInventario']['properties']['costo_unitario_estimado']={'type':'string','format':'decimal','nullable':True}
schemas['StockInventario']['properties']['politica_costeo']={'type':'string','enum':[COST_POLICY]}
schemas['StockInventario']['properties']['moneda']={'type':'string','enum':['PEN']}
schemas['AlertaVencimiento']['properties']['existencia_lote']={'type':'string','nullable':True,'description':'Siempre null: no existe ledger por lote.'}
schemas['Movimiento']['properties']['compra_id']['nullable']=True
schemas['Movimiento']['properties']['valoracion']={'type':'string','enum':['ADQUISICION','NO_VALORIZADO','LEGADO']}
schemas['AjusteResultado']={'type':'object','properties':{
    'movimiento_id':{'type':'integer','format':'int64'},'articulo_id':{'type':'integer','format':'int64'},
    'motivo':{'type':'string','enum':['AJUSTE_ENTRADA','AJUSTE_SALIDA']},
    'cantidad_firmada':{'type':'string','format':'decimal'},'saldo_resultante':{'type':'string','format':'decimal'},
    'costo_unitario':{'type':'string','enum':['0.0000'],'description':'Placeholder del ledger no valorizado, no estimado de costo.'},
    'valoracion':{'type':'string','enum':['NO_VALORIZADO']},'moneda':{'type':'string','enum':['PEN']}}}
schemas['CostoInsumoHistorico']={'type':'object','properties':{
    'articulo_id':{'type':'integer','format':'int64'},'nombre':{'type':'string'},'unidad':{'type':'string'},
    'cantidad_estimada':{'type':'string','format':'decimal'},'costo_unitario_estimado':{'type':'string','format':'decimal','nullable':True},
    'costo_linea_estimado':{'type':'string','format':'decimal','nullable':True}}}
schemas['CostoRecetaHistorico']={'type':'object','properties':{
    'servicio_id':{'type':'integer','format':'int64'},'politica_costeo':{'type':'string','enum':[COST_POLICY]},
    'moneda':{'type':'string','enum':['PEN']},'insumos':{'type':'array','items':ref('CostoInsumoHistorico')},
    'costo_estimado':{'type':'string','format':'decimal','nullable':True},'completo':{'type':'boolean'},'advertencia':{'type':'string'}}}
schemas['AlertasInventario']=page('StockInventario')
schemas['AlertasInventario']['properties']['results']['items']={'oneOf':[ref('StockInventario'),ref('AlertaVencimiento')]}
schemas['AlertasInventario']['properties']['tipo_alerta']={'type':'string','enum':['bajo_stock','vencimiento']}
schemas['AlertasInventario']['properties']['advertencia']={'type':'string'}
for name in ['ProveedorCreate','ProveedorPatch','DetalleCompraCreate','CompraCreate','CompraPatch','AjusteCreate']:
    def exact(schema):
        if schema.get('type')=='object':
            schema['additionalProperties']=False
        if schema.get('format')=='decimal':
            schema['description']=schema.get('description','')+' Cadena JSON obligatoria; se rechazan numeros JSON.'
        for child in schema.values():
            if isinstance(child,dict):exact(child)
            elif isinstance(child,list):
                for item in child:
                    if isinstance(item,dict):exact(item)
    exact(schemas[name])

idempotency={'name':'Idempotency-Key','in':'header','required':True,'schema':{'type':'string','format':'uuid'},
             'description':'UUID no nula por ajuste y cuenta; conservar en reintentos. Otra carga con la misma clave devuelve 409.'}
purchase_filters=common+[query('estado',enum=['BORRADOR','RECIBIDA','ANULADA']),query('proveedor','integer',minimum=1),
                         query('desde',format='date'),query('hasta',format='date')]
stock_filters=common+[query('articulo','integer',minimum=1),query('categoria','integer',minimum=1),
    query('tipo',enum=['INSUMO','VENTA','AMBOS']),query('activo',enum=['true','false','all'],default='true'),
    query('bajo_minimo',enum=['true','false','all']),query('sin_movimientos',enum=['true','false','all'])]
doc['paths']['/api/proveedores/']={
    'get':op('inventoryProviders','Proveedores privados','Proveedor',params=common+[query('activo',enum=['true','false','all'])],paginated=True),
    'post':op('inventoryProviderCreate','Crear proveedor sin unicidad ficticia de RUC','Proveedor','ProveedorCreate',status='201',params=[csrf])}
doc['paths']['/api/proveedores/{id}/']={'parameters':[identity],
    'get':op('inventoryProviderGet','Detalle de proveedor','Proveedor'),
    'patch':op('inventoryProviderPatch','Editar proveedor','Proveedor','ProveedorPatch',params=[csrf])}
for action in ('desactivar','reactivar'):
    doc['paths']['/api/proveedores/{id}/'+action+'/']={'parameters':[identity],
        'post':op('inventoryProvider'+action.title(),action.title()+' proveedor','Proveedor',params=[csrf])}
doc['paths']['/api/compras/']={
    'get':op('inventoryPurchases','Compras recientes con filtros','CompraLista',params=purchase_filters,paginated=True),
    'post':op('inventoryPurchaseCreate','Crear borrador y calcular total servidor','Compra','CompraCreate',status='201',params=[csrf])}
doc['paths']['/api/compras/{id}/']={'parameters':[identity],
    'get':op('inventoryPurchaseGet','Compra con detalles','Compra'),
    'patch':op('inventoryPurchasePatch','Editar solo BORRADOR; detalles reemplaza lista completa','Compra','CompraPatch',params=[csrf])}
for action in ('recibir','anular'):
    operation_data=op('inventoryPurchase'+action.title(),action.title()+' compra de manera idempotente','Compra',params=[csrf])
    operation_data['responses']['409']=response('Estado incompatible o fuentes inconsistentes',ref('Error'))
    operation_data['description']='Cuerpo vacio. Recepcion calcula total y genera un movimiento unico por linea. Repetir devuelve 200 sin movimientos nuevos.' if action=='recibir' else 'Cuerpo vacio. Solo BORRADOR a ANULADA; reintento de ANULADA devuelve 200.'
    doc['paths']['/api/compras/{id}/'+action+'/']={'parameters':[identity],'post':operation_data}
doc['paths']['/api/inventario/stock/']={'get':op('inventoryStock','Stock de vista y costo historico orientativo','StockInventario',params=stock_filters,paginated=True)}
doc['paths']['/api/inventario/movimientos/']={'get':op('inventoryLedger','Kardex inmutable ordenado fecha, id','Movimiento',
    params=common+[query('articulo','integer',minimum=1),query('compra','integer',minimum=1),
                   query('motivo',enum=['COMPRA','AJUSTE_ENTRADA','AJUSTE_SALIDA','DEVOLUCION','CONSUMO_SERVICIO','VENTA_PRODUCTO']),
                   query('desde',format='date'),query('hasta',format='date')],paginated=True)}
doc['paths']['/api/inventario/movimientos/{id}/']={'parameters':[identity],'get':op('inventoryLedgerGet','Movimiento confirmado de solo lectura','Movimiento')}
adjust=op('inventoryAdjustment','Ajuste cuantitativo auditable sin valorizacion contable','AjusteResultado','AjusteCreate',status='201',params=[csrf,idempotency])
adjust['responses']['200']=response('Reintento: mismo resultado y saldo de la operacion original',ref('AjusteResultado'))
doc['paths']['/api/inventario/ajustes/']={'post':adjust}
doc['paths']['/api/inventario/alertas/']={'get':op('inventoryAlerts','Bajo minimo o fechas de detalles recibidos','AlertasInventario',
    params=common+[query('tipo',enum=['bajo_stock','vencimiento'],default='bajo_stock'),
                   query('articulo','integer',minimum=1),query('tipo_articulo',enum=['INSUMO','VENTA','AMBOS']),
                   query('dias','integer',minimum=0,maximum=365,default=30),
                   query('estado',enum=['vencido','proximo','all'])])}
doc['paths']['/api/inventario/costos-receta/{id}/']={'parameters':[identity],
    'get':op('inventoryRecipeCosts','Estimado historico de receta; sin FIFO ni costo de salida','CostoRecetaHistorico')}
if tuple(map(int,doc['info']['version'].split('.'))) < (1,2,0):
    doc['info']['version']='1.2.0'
phase4_suffix=' Fase 4:'+doc['info']['description'].split(' Fase 4:',1)[1] if ' Fase 4:' in doc['info']['description'] else ''
doc['info']['description']=doc['info']['description'].split(' Fase 3:')[0]+' Fase 3: proveedores, compras, recepcion idempotente, ledger, ajustes y estimados historicos privados.'+phase4_suffix
(ROOT/'docs/openapi.json').write_text(json.dumps(doc,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Inventory OpenAPI generated:',len(doc['paths']),'total paths.')

