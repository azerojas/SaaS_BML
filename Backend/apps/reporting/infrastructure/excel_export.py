"""Readable, bounded workbooks with literal text and numeric financial amounts."""
from datetime import date,datetime,timedelta
from decimal import Decimal
from io import BytesIO
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment,Font,PatternFill
from openpyxl.utils import get_column_letter
from apps.reporting.domain.errors import ReportError
from apps.reporting.domain.periods import ZONE
from .excel_labels import VALUES,label,description,warning_text

MAX_EXPORT_ROWS=10000
SHEETS={'overview':'Ingresos','revenue-series':'Ingresos','payment-methods':'Medios de pago',
    'top-services':'Tratamientos','top-clients':'Clientas','expenses':'Egresos','inventory-alerts':'Inventario'}
REPORT_TITLES={**SHEETS,'overview':'Reporte general'}
DEFAULT_COLUMNS={
    'Ingresos':['etiqueta','ventas_confirmadas','cobros_registrados','anticipos_recibidos'],
    'Egresos':['fecha','tipo','categoria','metodo','cantidad','monto'],
    'Tratamientos':['tratamiento','reservas_recibidas','reservas','personas','cantidad','numero_ventas','ingreso'],
    'Visitas':['visita_id','nombre','inicio_en','fin_en','estado'],
    'Medios de pago':['metodo','cobros_registrados','pagos_count','anticipos_recibidos','anticipos_count'],
    'Clientas':['clienta_id','nombre','ventas_confirmadas','numero_ventas','visitas_finalizadas'],
    'Inventario':['articulo_id','nombre','tipo','unidad','stock_minimo','existencia','bajo_minimo'],
}
NOTES={
    'Ingresos':'Ventas, cobros y anticipos se muestran por separado: no se deben sumar entre sí.',
    'Egresos':'Gastos operativos y reembolsos registrados. Las compras de inventario no se presuponen pagadas.',
    'Tratamientos':'Reservas recibidas según su fecha de creación; citas según su fecha de atención; tratamientos vendidos según la venta. Excluye citas canceladas.',
    'Visitas':'Todas las visitas iniciadas en el período, incluso sin venta ni pago. Una fila por visita.',
    'Inventario':'Situación actual del inventario; no representa existencias históricas al cierre del período.',
}


def safe_text(value):
    return ILLEGAL_CHARACTERS_RE.sub('',value.replace('\r\n','\n').replace('\r','\n')).encode('utf-8',errors='replace').decode('utf-8')[:32767]


def append(ws,values):
    ws.append([None]*len(values))
    # append advances this cursor; max_row would rescan every existing cell.
    row_number=ws._current_row
    for column,value in enumerate(values,1):
        cell=ws.cell(row_number,column)
        if isinstance(value,str):
            cell.value=safe_text(value)
            cell.data_type='s'
            cell.quotePrefix=True
        elif isinstance(value,datetime):cell.value=value.astimezone(ZONE).replace(tzinfo=None)
        else:cell.value=value
        if isinstance(value,Decimal):cell.number_format='"S/ "#,##0.00'
        if isinstance(value,datetime):cell.number_format='dd/mm/yyyy hh:mm'
        elif isinstance(value,date):cell.number_format='dd/mm/yyyy'


def period_text(filters):
    return 'Del '+filters.desde.strftime('%d/%m/%Y')+' al '+(filters.hasta-timedelta(days=1)).strftime('%d/%m/%Y')


def prepare_sheet(ws,title,filters,columns):
    width=max(3,len(columns))
    append(ws,['LASHEO · '+title])
    ws.merge_cells(start_row=1,start_column=1,end_row=1,end_column=width)
    append(ws,[period_text(filters)])
    ws.merge_cells(start_row=2,start_column=1,end_row=2,end_column=width)
    append(ws,[NOTES.get(ws.title,'Importes en soles. Los campos sin respaldo suficiente se muestran en blanco.')])
    ws.merge_cells(start_row=3,start_column=1,end_row=3,end_column=width)
    append(ws,columns)
    ws.row_dimensions[1].height=32
    ws.row_dimensions[2].height=24
    ws.row_dimensions[3].height=34
    ws.row_dimensions[4].height=32


def finish_sheet(ws):
    ws.freeze_panes='A5'
    ws.auto_filter.ref=f'A4:{get_column_letter(ws.max_column)}{max(4,ws.max_row)}'
    for row in ws:
        for cell in row:
            cell.font=Font(name='Calibri',size=11,color='302521')
            cell.alignment=Alignment(vertical='top',wrap_text=True)
            if cell.row>=5 and cell.row%2:cell.fill=PatternFill('solid',fgColor='FFF4ED')
    ws['A1'].font=Font(name='Calibri',size=19,bold=True,color='8E4B36')
    ws['A2'].font=Font(name='Calibri',size=11,bold=True,color='6A534A')
    ws['A3'].font=Font(name='Calibri',size=10,italic=True,color='6A534A')
    for cell in ws[4]:
        cell.font=Font(name='Calibri',size=11,bold=True,color='FFFFFF')
        cell.fill=PatternFill('solid',fgColor='8E4B36')
        cell.alignment=Alignment(vertical='center',wrap_text=True)
    for column in range(1,ws.max_column+1):
        length=max((len(str(ws.cell(row,column).value or '')) for row in range(4,min(ws.max_row,150)+1)),default=18)
        ws.column_dimensions[get_column_letter(column)].width=min(52,max(20,length+2))
    ws.sheet_view.showGridLines=False
    ws.print_title_rows='1:4'
    ws.sheet_properties.pageSetUpPr.fitToPage=True
    ws.page_setup.orientation='landscape'
    ws.page_setup.paperSize=ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth=1
    ws.page_setup.fitToHeight=0
    ws.oddFooter.center.text='Página &P de &N'


def write_data_sheet(workbook,title,filters,rows,columns=None):
    ws=workbook.create_sheet(title)
    keys=columns or (list(rows[0]) if rows else DEFAULT_COLUMNS.get(title,['Sin datos']))
    headings=[label(key) for key in keys]
    if title=='Tratamientos' and 'reservas' in keys:headings[keys.index('cantidad')]='Tratamientos vendidos'
    if title=='Inventario' and 'nombre' in keys:headings[keys.index('nombre')]='Artículo'
    prepare_sheet(ws,title,filters,headings)
    for row in rows:
        values=[]
        for key in keys:
            value=row.get(key)
            if key in ('estado','metodo','tipo') and isinstance(value,str):value=VALUES.get(value,value.replace('_',' ').capitalize())
            if key=='etiqueta' and isinstance(value,str):
                try:value=date.fromisoformat(value)
                except ValueError:pass
            if isinstance(value,bool):value='Sí' if value else 'No'
            values.append(value)
        append(ws,values)
        for column,key in enumerate(keys,1):
            if key in ('cantidad','existencia','stock_minimo'):
                ws.cell(ws._current_row,column).number_format='0.000' if isinstance(row.get(key),Decimal) else '0'
    if not rows:append(ws,['Sin registros en el período seleccionado.'])
    finish_sheet(ws)


def build_workbook(report,filters,summary,details,limit=100):
    workbook=Workbook()
    overview=workbook.active
    overview.title='Resumen'
    prepare_sheet(overview,REPORT_TITLES[report],filters,['Indicador','Importe o cantidad','Qué incluye'])
    metrics=dict(summary.get('indicadores',{}))
    sections=dict(details.get('secciones_exportacion',{}))
    if report=='overview':
        rows=sections.pop('Ingresos',[])
        columns=DEFAULT_COLUMNS['Ingresos']
        if 'Visitas' in sections:
            metrics['visitas_registradas']=len(sections['Visitas'])
            metrics['personas_visitantes']=len({row['clienta_id'] for row in sections['Visitas']})
        metrics['egresos_registrados']=sum((row['monto'] for row in sections.get('Egresos',[])),Decimal('0.00'))
    else:
        rows=details.get('results',[])
        if report in ('top-services','top-clients'):rows=rows[:limit]
        columns={
            'revenue-series':DEFAULT_COLUMNS['Ingresos'],
            'top-services':['servicio_id','descripcion_snapshot','cantidad','ingreso','costo_directo','comisiones','numero_ventas'],
            'expenses':['categoria_id','categoria','monto','cantidad'],
            'payment-methods':DEFAULT_COLUMNS['Medios de pago'],
            'top-clients':DEFAULT_COLUMNS['Clientas'],
            'inventory-alerts':DEFAULT_COLUMNS['Inventario'],
        }.get(report)
    if report=='expenses':metrics['gastos_operativos']=details['total']
    if report=='inventory-alerts':metrics.update(details['estadisticas'])
    for key,value in metrics.items():append(overview,[label(key),value,description(key)])
    warnings=set(summary['calidad']['advertencias'])|set(details['calidad']['advertencias'])
    for warning in sorted(warnings):append(overview,['Aclaración',None,warning_text(warning)])
    append(overview,['Lectura de importes',None,'Una celda en blanco no equivale a cero: faltan datos suficientes para calcularla.'])
    total=len(rows)+sum(len(values) for values in sections.values())
    if total>MAX_EXPORT_ROWS:raise ReportError('exportacion_excesiva','Reduce el rango de exportación; no se entregan listados incompletos.','limit')
    finish_sheet(overview)
    overview.column_dimensions['A'].width=43
    overview.column_dimensions['B'].width=25
    overview.column_dimensions['C'].width=85
    for row in range(5,overview.max_row+1):overview.row_dimensions[row].height=33
    write_data_sheet(workbook,SHEETS[report],filters,rows,columns)
    for title,values in sections.items():write_data_sheet(workbook,title,filters,values,DEFAULT_COLUMNS.get(title))
    output=BytesIO()
    workbook.save(output)
    if output.tell()>10*1024*1024:raise ReportError('exportacion_excesiva','El archivo excede 10 MiB.','limit')
    return output.getvalue(),total
