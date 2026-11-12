"""Add the actor-scoped recovery API without rewriting the deployed finance/agenda contracts."""
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'docs/openapi.json'
doc = json.loads(path.read_text(encoding='utf-8'))
doc['info']['version'] = '8.4.2'
doc['components']['schemas']['FinanceIntentRecovery'] = {
    'type': 'object', 'additionalProperties': False,
    'required': ['encontrado', 'operacion', 'resultado', 'estado_http'],
    'properties': {'encontrado': {'type': 'boolean'}, 'operacion': {'type': 'string'},
        'resultado': {'allOf': [{'$ref': '#/components/schemas/FinanceResult'}], 'nullable': True},
        'estado_http': {'type': 'integer', 'nullable': True}},
}
doc['paths']['/api/finanzas/intentos/{key}/'] = {'get': {
    'operationId': 'financeIntentRecovery', 'tags': ['Finanzas'],
    'summary': 'Consultar resultado mínimo de una intención del usuario actual',
    'description': 'Solo staff activo con finanzas.view_finance y el permiso de la operación. '
        'Busca por actor/operación/UUID bajo el lock financiero compartido. No devuelve payload, '
        'PII, referencia bancaria ni hash de la solicitud. Una ausencia no autoriza cambiar de clave: '
        'un reintento debe conservar la UUID y el cuerpo originales. No reenvía mutaciones.',
    'parameters': [{'in': 'path', 'name': 'key', 'required': True, 'schema': {'type': 'string', 'format': 'uuid'}},
        {'in': 'query', 'name': 'operacion', 'required': True, 'schema': {'type': 'string', 'enum': [
            'visita.abrir', 'visita.notas', 'visita.cancelar', 'visita.finalizar', 'venta.crear',
            'venta.editar', 'venta.confirmar', 'venta.anular', 'pago.registrar', 'pago.anular', 'anticipo.aplicar']}}],
    'responses': {'200': {'description': 'Resultado persistido original o encontrado=false',
        'content': {'application/json': {'schema': {'$ref': '#/components/schemas/FinanceIntentRecovery'}}}},
        **{str(status): {'description': description} for status, description in [
            (400, 'UUID u operación inválida'), (403, 'Sesión o permiso insuficiente'), (503, 'Esquema financiero no disponible')]}},
}}
path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Frontend phase-4 recovery contract updated.')
