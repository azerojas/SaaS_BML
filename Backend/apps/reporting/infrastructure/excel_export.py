"""Bounded XLSX output: typed numeric Decimal values and explicit literal text."""
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from apps.reporting.domain.errors import ReportError
from apps.reporting.domain.metrics import DEFINITIONS
from apps.reporting.domain.periods import ZONE

MAX_EXPORT_ROWS=10000
SHEETS={'overview':'Ingresos','revenue-series':'Ingresos','payment-methods':'Pagos','top-services':'Servicios',
        'top-clients':'Clientas','expenses':'Gastos','inventory-alerts':'Inventario'}


def safe_text(value):
    return ILLEGAL_CHARACTERS_RE.sub('',value.replace('\r\n','\n').replace('\r','\n')).encode('utf-8',errors='replace').decode('utf-8')[:32767]


def append(ws, values):
    ws.append([None]*len(values))
    for column,value in enumerate(values,1):
        cell=ws.cell(ws.max_row,column)
        if isinstance(value,str):
            cell.value=safe_text(value)
            cell.data_type='s'
            cell.quotePrefix=True
        elif isinstance(value,datetime): cell.value=value.astimezone(ZONE).replace(tzinfo=None)
        else: cell.value=value
        if isinstance(value,Decimal): cell.number_format='"S/ "#,##0.00'
        if isinstance(value,datetime): cell.number_format='yyyy-mm-dd hh:mm:ss'


def finish_sheet(ws):
    ws.freeze_panes='A2'
    ws.auto_filter.ref=ws.dimensions
    for cell in ws[1]:
        cell.font=Font(bold=True,color='FFFFFF')
        cell.fill=PatternFill('solid',fgColor='42324C')
    for column in range(1,ws.max_column+1):
        ws.column_dimensions[get_column_letter(column)].width=min(65,max(18,max((len(str(ws.cell(row,column).value or '')) for row in range(1,min(ws.max_row,100)+1)),default=18)+2))


def build_workbook(report, filters, summary, details, limit=100):
    workbook=Workbook()
    overview=workbook.active
    overview.title='Resumen'
    append(overview,['Indicador / filtro','Valor','Definicion / alcance'])
    for key,value in filters.metadata().items():
        append(overview,[key,str(value) if isinstance(value,dict) else value,''])
    append(overview,['generado_en',summary['generado_en'],'Hora local America/Lima'])
    for key,value in summary.get('indicadores',{}).items(): append(overview,[key,value,DEFINITIONS.get(key,'Ver contrato de indicadores')])
    warnings=set(summary['calidad']['advertencias'])|set(details['calidad']['advertencias'])
    for warning in sorted(warnings): append(overview,['ADVERTENCIA',warning,'No interpretar campos bloqueados como cero.'])
    rows=details.get('results',[])
    if report=='overview': rows=[{'indicador':key,'valor':value,'definicion':DEFINITIONS.get(key,'Ver contrato')} for key,value in details['indicadores'].items()]
    if report in ('top-services','top-clients'): rows=rows[:limit]
    if report=='expenses':
        append(overview,['gastos_operativos',details['total'],DEFINITIONS['gastos_operativos']])
    if report=='inventory-alerts':
        for key,value in details['estadisticas'].items(): append(overview,[key,value,'Foto actual, no al cierre del periodo'])
    append(overview,['filas_exportadas',len(rows),'El ranking respeta limit; no se exportan telefonos ni notas.'])
    if len(rows)>MAX_EXPORT_ROWS: raise ReportError('exportacion_excesiva','Reduce el rango de exportacion.','limit')
    sheet=workbook.create_sheet(SHEETS[report])
    columns=list(rows[0]) if rows else ['Sin datos']
    append(sheet,columns)
    for row in rows: append(sheet,[row.get(column) for column in columns])
    for ws in workbook: finish_sheet(ws)
    # Quantities are numeric, but must not acquire a monetary number format.
    for column,key in enumerate(columns,1):
        if key in ('cantidad','existencia','stock_minimo'):
            for cells in sheet.iter_rows(min_row=2,min_col=column,max_col=column): cells[0].number_format='0.000'
    output=BytesIO()
    workbook.save(output)
    if output.tell()>10*1024*1024: raise ReportError('exportacion_excesiva','El archivo excede 10 MiB.','limit')
    return output.getvalue(),len(rows)
