export const demoProducts = [
  {
    id: "demo-vest-s",
    sku: "GS-VEST-S",
    name: "Girl Scout Vest (Small)",
    category: "Uniforms",
    category_id: "uniforms",
    stock_quantity: 18,
    selling_price: 850,
    cost_price: 420,
  },
  {
    id: "demo-badge-first-aid",
    sku: "GS-BDG-FA",
    name: "First Aid Badge",
    category: "Merit Badges",
    category_id: "badges",
    stock_quantity: 64,
    selling_price: 120,
    cost_price: 40,
  },
  {
    id: "demo-kerchief",
    sku: "GS-ACC-KER",
    name: "Troop Kerchief",
    category: "Accessories",
    category_id: "accessories",
    stock_quantity: 35,
    selling_price: 260,
    cost_price: 95,
  },
  {
    id: "demo-hall-rental",
    sku: "RENT-HALL-001",
    name: "Main Hall Rental",
    category: "Hall Rental",
    category_id: "rent-hall",
    stock_quantity: 999,
    selling_price: 1500,
    cost_price: 0,
  },
  {
    id: "demo-room-rental",
    sku: "RENT-ROOM-001",
    name: "Meeting Room Rental",
    category: "Room Rental",
    category_id: "rent-room",
    stock_quantity: 999,
    selling_price: 800,
    cost_price: 0,
  },
];

export const demoSales = [
  {
    id: "sale-001",
    customer: "Troop 123",
    total_amount: 2450,
    created_at: new Date().toISOString(),
    branch: "Main Branch",
  },
  {
    id: "sale-002",
    customer: "Walk-in",
    total_amount: 980,
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    branch: "Main Branch",
  },
];

export const demoEmployees = [
  { id: "emp-001", full_name: "Maria Santos", role: "cashier" as const, branch: "Main" },
  { id: "emp-002", full_name: "Liza dela Cruz", role: "manager" as const, branch: "Uptown" },
  { id: "emp-003", full_name: "Ana Reyes", role: "inventory_clerk" as const, branch: "Main" },
];

export const demoCustomers = [
  { id: "cust-001", name: "Troop 321", membership: "Scout", points: 1200 },
  { id: "cust-002", name: "Troop 215", membership: "Leader", points: 1840 },
  { id: "cust-003", name: "Parents Guild", membership: "Volunteer", points: 600 },
];



