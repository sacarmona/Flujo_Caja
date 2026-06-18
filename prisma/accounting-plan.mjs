export const accountingPlan = [
  {
    code: "1",
    name: "Ingresos",
    type: "INCOME",
    sortOrder: 1,
    children: [
      { code: "1.01", name: "Servicios de inspección", sortOrder: 10 },
      { code: "1.02", name: "Servicios de ingeniería", sortOrder: 20 },
      { code: "1.03", name: "Arriendo de equipos", sortOrder: 30 }
    ]
  },
  {
    code: "2",
    name: "Costos directos",
    type: "DIRECT_COST",
    sortOrder: 2,
    children: [
      { code: "2.01", name: "Personal de operaciones", sortOrder: 10 },
      { code: "2.02", name: "Subcontratos", sortOrder: 20 },
      { code: "2.03", name: "Equipos y materiales", sortOrder: 30 },
      { code: "2.04", name: "Traslados y viáticos", sortOrder: 40 }
    ]
  },
  {
    code: "3",
    name: "Gastos administrativos",
    type: "ADMIN_EXPENSE",
    sortOrder: 3,
    children: [
      { code: "3.01", name: "Remuneraciones", sortOrder: 10 },
      { code: "3.02", name: "Honorarios", sortOrder: 20 },
      { code: "3.03", name: "Cotizaciones previsionales", sortOrder: 30 },
      { code: "3.04", name: "Arriendos", sortOrder: 40 },
      { code: "3.05", name: "Software y licencias", sortOrder: 50 },
      { code: "3.06", name: "Contabilidad", sortOrder: 60 },
      { code: "3.07", name: "Seguros", sortOrder: 70 },
      { code: "3.08", name: "Gastos bancarios", sortOrder: 80 }
    ]
  },
  {
    code: "4",
    name: "Impuestos",
    type: "TAX",
    sortOrder: 4,
    children: [
      { code: "4.01", name: "IVA y F29", sortOrder: 10 },
      { code: "4.02", name: "PPM", sortOrder: 20 }
    ]
  },
  {
    code: "5",
    name: "Financiamiento",
    type: "FINANCING",
    sortOrder: 5,
    children: [
      { code: "5.01", name: "Créditos", sortOrder: 10 },
      { code: "5.02", name: "Intereses", sortOrder: 20 }
    ]
  },
  {
    code: "6",
    name: "Inversiones",
    type: "INVESTMENT",
    sortOrder: 6,
    children: [{ code: "6.01", name: "Compra de equipos", sortOrder: 10 }]
  },
  {
    code: "7",
    name: "Movimientos no operacionales",
    type: "NON_OPERATIONAL",
    sortOrder: 7,
    children: [
      { code: "7.01", name: "Aportes de socios", sortOrder: 10 },
      { code: "7.02", name: "Retiros de socios", sortOrder: 20 },
      { code: "7.03", name: "Ajustes no operacionales", sortOrder: 30 }
    ]
  }
];
