export interface CustomerEntity {
  id?: number;
  customer_id: string;
  full_name: string;
  email: string;
  mobile: string;
  address?: string;
  password_hash: string;
  loyalty_tier?: string;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface AddressEntity {
  id?: number;
  customer_id: string;
  address_id: string;
  label: string;
  full_address: string;
  city: string;
  state: string;
  pincode: string;
  is_default?: boolean;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface CustomerWithAddresses extends CustomerEntity {
  addresses?: AddressEntity[];
}
