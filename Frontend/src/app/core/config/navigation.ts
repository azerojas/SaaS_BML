export const NAVIGATION = [
  {
    path: '/admin',
    label: 'Inicio',
    icon: 'home',
    permission: null,
    description: 'Tu espacio de trabajo',
  },
  {
    path: '/admin/agenda',
    label: 'Agenda',
    icon: 'calendar',
    permission: 'agenda.view_agenda',
    description: 'Citas y organización del día',
  },
  {
    path: '/admin/clientas',
    label: 'Clientas',
    icon: 'users',
    permission: 'negocio.view_clientas',
    description: 'El cuidado empieza por conocerlas',
  },
  {
    path: '/admin/catalogo',
    label: 'Catálogo',
    icon: 'sparkles',
    permission: 'negocio.view_servicios',
    description: 'Servicios y productos de tu salón',
  },
  {
    path: '/admin/inventario',
    label: 'Inventario',
    icon: 'box',
    permission: 'negocio.view_articulos',
    description: 'Todo en su lugar',
  },
  {
    path: '/admin/llegadas',
    label: 'Llegadas',
    icon: 'users',
    permission: 'negocio.view_llegadas',
    description: 'Recepción y confirmación presencial',
  },
  {
    path: '/admin/puntos-qr',
    label: 'Puntos QR',
    icon: 'box',
    permission: 'negocio.view_puntosqr',
    description: 'Registro público de llegada',
  },
  {
    path: '/admin/ventas',
    label: 'Ventas y pagos',
    icon: 'receipt',
    permission: 'finanzas.view_finance',
    description: 'Cobros, anticipos y saldos oficiales',
  },
  {
    path: '/admin/visitas',
    label: 'Visitas',
    icon: 'receipt',
    permission: 'finanzas.view_finance',
    description: 'Cada atención, bien acompañada',
  },
  {
    path: '/admin/compras',
    label: 'Compras',
    icon: 'receipt',
    permission: 'negocio.view_compras',
    description: 'Abastecimiento para cada cuidado',
  },
  {
    path: '/admin/proveedores',
    label: 'Proveedores',
    icon: 'users',
    permission: 'negocio.view_proveedores',
    description: 'Alianzas que acompañan tu trabajo',
  },
  {
    path: '/admin/reportes',
    label: 'Reportes',
    icon: 'chart',
    permission: 'reporting.view_summary',
    description: 'Información para tus decisiones',
  },
] as const;

export interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  permission: string | null;
  description: string;
  available: boolean;
}
export function visibleNavigation(
  hasPermission: (permission: string) => boolean,
): NavigationItem[] {
  const catalogModels = [
    ['servicios', 'servicios'],
    ['articulos', 'articulos'],
    ['categorias-servicio', 'categoriasservicio'],
    ['categorias-articulo', 'categoriasarticulo'],
    ['unidades', 'unidadesmedida'],
  ] as const;
  return NAVIGATION.flatMap<NavigationItem>((item) => {
    if (item.path === '/admin/reportes')
      return ['reporting.view_summary', 'reporting.view_clients', 'reporting.view_inventory'].some(
        hasPermission,
      )
        ? [{ ...item, available: true }]
        : [];
    if (item.path === '/admin/catalogo') {
      const allowed = catalogModels.find(([, model]) => hasPermission('negocio.view_' + model));
      return allowed
        ? [
            {
              ...item,
              path: allowed[0] === 'servicios' ? item.path : item.path + '/' + allowed[0],
              available: true,
            },
          ]
        : [];
    }
    return !item.permission || hasPermission(item.permission)
      ? [
          {
            ...item,
            path: String(item.path),
            available: [
              '/admin',
              '/admin/agenda',
              '/admin/clientas',
              '/admin/inventario',
              '/admin/compras',
              '/admin/proveedores',
              '/admin/llegadas',
              '/admin/puntos-qr',
              '/admin/visitas',
              '/admin/ventas',
            ].includes(item.path),
          },
        ]
      : [];
  });
}
