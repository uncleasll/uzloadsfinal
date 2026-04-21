export type LoadStatus =
  | 'New'
  | 'Canceled'
  | 'TONU'
  | 'Dispatched'
  | 'En Route'
  | 'Picked-up'
  | 'Delivered'
  | 'Closed'

export type BillingStatus =
  | 'Pending'
  | 'Canceled'
  | 'BOL received'
  | 'Invoiced'
  | 'Sent to factoring'
  | 'Funded'
  | 'Paid'

export type StopType = 'pickup' | 'delivery'
export type ServiceType = 'Lumper' | 'Detention' | 'Other'
export type DocumentType = 'Confirmation' | 'BOL' | 'POD' | 'Other'

export interface Driver {
  id: number
  name: string
  phone?: string
  email?: string
  driver_type: string
  pay_rate_loaded: number
  pay_rate_empty: number
  is_active: boolean
  created_at?: string
}

export interface TruckDocument {
  id: number
  truck_id: number
  doc_type: string
  issue_date?: string
  exp_date?: string
  name?: string
  notes?: string
  file_path?: string
  original_filename?: string
  created_at?: string
}

export interface Truck {
  id: number
  unit_number: string
  make?: string
  model?: string
  year?: number
  vin?: string
  eld_provider?: string
  eld_id?: string
  ownership?: string
  driver_id?: number
  driver?: { id: number; name: string; driver_type: string }
  plate?: string
  plate_state?: string
  purchase_date?: string
  purchase_price?: number
  notes?: string
  is_active: boolean
  created_at?: string
  documents?: TruckDocument[]
}

export interface TrailerDocument {
  id: number
  trailer_id: number
  doc_type: string
  issue_date?: string
  exp_date?: string
  name?: string
  notes?: string
  file_path?: string
  original_filename?: string
  created_at?: string
}

export interface Trailer {
  id: number
  unit_number: string
  trailer_type?: string
  make?: string
  model?: string
  year?: number
  vin?: string
  ownership?: string
  driver_id?: number
  driver?: { id: number; name: string; driver_type: string }
  plate?: string
  plate_state?: string
  purchase_date?: string
  purchase_price?: number
  notes?: string
  is_active: boolean
  created_at?: string
  documents?: TrailerDocument[]
}

export interface Broker {
  id: number
  name: string
  mc_number?: string
  city?: string
  state?: string
  phone?: string
  email?: string
  factoring: boolean
  factoring_company?: string
  is_active: boolean
}

export interface Dispatcher {
  id: number
  name: string
  email?: string
  is_active: boolean
}

export interface LoadStop {
  id: number
  stop_type: StopType
  stop_order: number
  city?: string
  state?: string
  zip_code?: string
  country?: string
  stop_date?: string
  stop_time?: string
  address?: string
  company_name?: string
  notes?: string
}

export interface LoadService {
  id: number
  service_type: ServiceType
  add_deduct: string
  invoice_amount: number
  drivers_payable: number
  notes?: string
  stop_id?: number
  paid_by?: string
  created_at?: string
}

export interface LoadDocument {
  id: number
  document_type: DocumentType
  filename: string
  original_filename?: string
  file_size?: number
  notes?: string
  uploaded_at?: string
}

export interface LoadHistory {
  id: number
  description: string
  author?: string
  created_at?: string
}

export interface LoadNote {
  id: number
  content: string
  author?: string
  is_important?: boolean
  created_at?: string
}

export interface Load {
  id: number
  load_number: number
  status: LoadStatus
  billing_status: BillingStatus
  load_date: string
  actual_delivery_date?: string
  rate: number
  total_miles: number
  loaded_miles: number
  empty_miles: number
  po_number?: string
  notes?: string
  direct_billing: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string

  pay_type_snapshot?: string
  pay_rate_loaded_snapshot?: number
  pay_rate_empty_snapshot?: number
  freight_percentage_snapshot?: number
  flatpay_snapshot?: number
  drivers_payable_snapshot?: number
  snapshot_taken_at?: string
  snapshot_overridden?: boolean

  driver?: Driver
  co_driver?: Driver
  truck?: Truck
  trailer?: Trailer
  broker?: Broker
  dispatcher?: Dispatcher
  stops: LoadStop[]
  services: LoadService[]
  documents: LoadDocument[]
  history: LoadHistory[]
  notes_list: LoadNote[]
}

export interface LoadListItem {
  id: number
  load_number: number
  status: LoadStatus
  billing_status: BillingStatus
  load_date: string
  actual_delivery_date?: string
  rate: number
  total_miles: number
  loaded_miles: number
  empty_miles: number
  po_number?: string
  is_active: boolean
  drivers_payable_snapshot?: number
  driver?: Driver
  truck?: Truck
  trailer?: Trailer
  broker?: Broker
  dispatcher?: Dispatcher
  stops: LoadStop[]
  services: LoadService[]
  documents: LoadDocument[]
}

export interface LoadsResponse {
  items: LoadListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
  total_rate: number
}

export interface LoadFilters {
  search?: string
  status?: string
  billing_status?: string
  driver_id?: number
  broker_id?: number
  truck_id?: number
  trailer_id?: number
  dispatcher_id?: number
  date_from?: string
  date_to?: string
  show_only_active?: boolean
  direct_billing?: boolean
  load_number?: number
  page?: number
  page_size?: number
}

export interface LoadCreatePayload {
  status: LoadStatus
  billing_status: BillingStatus
  load_date: string
  actual_delivery_date?: string
  rate: number
  loaded_miles?: number
  empty_miles?: number
  po_number?: string
  notes?: string
  direct_billing?: boolean
  driver_id?: number
  truck_id?: number
  trailer_id?: number
  broker_id?: number
  dispatcher_id?: number
  stops: {
    stop_type: StopType
    stop_order: number
    city?: string
    state?: string
    zip_code?: string
    country?: string
    stop_date?: string
    stop_time?: string
    company_name?: string
    address?: string
  }[]
}

export interface ServiceCreatePayload {
  service_type: ServiceType
  add_deduct: string
  invoice_amount: number
  drivers_payable: number
  notes?: string
  paid_by?: string
  stop_id?: number
}
