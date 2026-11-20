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
    path: '/admin/puntos-qr',
    label: 'Puntos QR',
    icon: 'box',
    permission: 'negocio.view_puntosqr',
    description: 'Registro automático de visitas',
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
] as const;

export interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  permission: string | null;
  description: string;
  available: boolean;
}
export interface NavigationGroup {
  label: string;
  icon: string;
  items: NavigationItem[];
}
export function groupedNavigation(items: NavigationItem[]): NavigationGroup[] {
  const groups = [
    {
      label: 'Operación',
      icon: 'calendar',
      paths: ['/admin/agenda', '/admin/visitas', '/admin/puntos-qr'],
    },
    { label: 'Negocio', icon: 'sparkles', paths: ['/admin/clientas', '/admin/catalogo'] },
    {
      label: 'Inventario',
      icon: 'box',
      paths: ['/admin/inventario', '/admin/compras', '/admin/proveedores'],
    },
    { label: 'Finanzas', icon: 'chart', paths: ['/admin/ventas'] },
  ];
  return groups
    .map((group) => ({
      label: group.label,
      icon: group.icon,
      items: group.paths.flatMap((path) =>
        items.filter((item) => item.path === path || item.path.startsWith(path + '/')),
      ),
    }))
    .filter((group) => group.items.length > 0);
}
export function visibleNavigation(
  hasPermission: (permission: string) => boolean,
): NavigationItem[] {
  const catalogModels = [
    ['servicios', 'servicios'],
    ['articulos', 'articulos'],
  ] as const;
  return NAVIGATION.flatMap<NavigationItem>((item) => {
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
    return !item.permission ||
      hasPermission(item.permission) ||
      (item.path === '/admin/agenda' && hasPermission('agenda.view_own_agenda'))
      ? [
          {
            ...item,
            path: String(item.path),
            available: [
              '/admin',
              '/admin/agenda',
              '/admin/agenda/mis-fechas',
              '/admin/clientas',
              '/admin/inventario',
              '/admin/compras',
              '/admin/proveedores',
              '/admin/puntos-qr',
              '/admin/visitas',
              '/admin/ventas',
            ].includes(item.path),
          },
        ]
      : [];
  });
}
