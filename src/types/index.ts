export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
  subscription_plan: 'free' | 'pro' | 'enterprise';
}

export interface CheckoutPage {
  id: string;
  user_id: string;
  title: string;
  slug: string;
  description?: string;
  logo_url?: string;
  theme: CheckoutTheme;
  custom_fields: CustomField[];
  products: Product[];
  layout: LayoutElement[]; // New property for layout
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pixels?: string[]; // Added for Facebook pixels integration
  utmify_key?: string; // Added for Utmify integration
  delivery_email?: string; // Added for personalized delivery email
}

export interface CheckoutTheme {
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  border_radius: string;
  button_style: 'rounded' | 'square' | 'pill';
}

export interface CustomField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
  placeholder?: string;
  order: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  type: 'digital' | 'physical';
  image_url?: string;
  digital_file_url?: string;
  discount?: number;
  is_active: boolean;
  requires_shipping: boolean;
  order: number;
}

export interface LayoutElement {
  id: string;
  type:
    | 'title'
    | 'description'
    | 'logo'
    | 'text_field'
    | 'button'
    | 'image'
    | 'spacer'
    | 'divider'
    | 'product_list'
    | 'customer_info_form';
  content: {
    text?: string;
    url?: string;
    placeholder?: string;
    required?: boolean;
    fieldId?: string; // For linking to custom_fields
    style?: {
      fontSize?: string;
      fontWeight?: string;
      align?: 'left' | 'center' | 'right';
      height?: string; // For spacers
      color?: string; // For dividers
    };
  };
  order: number;
}

export interface Order {
  id: string;
  checkout_page_id: string;
  customer_info: CustomerInfo;
  products: OrderProduct[];
  total_amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  payment_method: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  address?: Address;
  custom_fields: Record<string, any>;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
}

export interface OrderProduct {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Analytics {
  total_sales: number;
  total_orders: number;
  conversion_rate: number;
  revenue_by_day: { date: string; revenue: number }[];
  top_products: { name: string; sales: number }[];
  recent_orders: Order[];
}