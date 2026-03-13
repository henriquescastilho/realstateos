export type Owner = {
  id: string;
  tenant_id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
};

export type Renter = {
  id: string;
  tenant_id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
};

export type Property = {
  id: string;
  tenant_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_id: string;
  iptu_registration_number?: string | null;
};

export type Contract = {
  id: string;
  tenant_id: string;
  property_id: string;
  renter_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  due_day: number;
};

export type Charge = {
  id: string;
  tenant_id: string;
  property_id: string;
  contract_id: string;
  type: "RENT" | "IPTU" | "CONDO" | "CONSOLIDATED" | string;
  description: string;
  amount: string;
  due_date: string;
  source: string;
  status: string;
};

export type ConsolidatedCharge = {
  property_id: string;
  contract_id: string;
  reference_month: string;
  total_amount: string;
  items: Array<{
    charge_id: string;
    type: string;
    description: string;
    amount: string;
    due_date: string;
    status: string;
  }>;
};

export type DocumentRecord = {
  id: string;
  tenant_id: string;
  property_id: string;
  type: "IPTU" | "CONDO" | string;
  file_url: string;
  parsed_data: Record<string, unknown>;
};

export type TaskRecord = {
  id: string;
  tenant_id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
};

export type PaymentResult = {
  provider: "santander" | "mock" | string;
  charge_id: string;
  boleto_url: string;
  barcode: string;
  pix_qrcode: string;
};
