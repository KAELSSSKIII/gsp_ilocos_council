export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          date: string
          employee_id: string
          hours_worked: number | null
          id: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_spaces: {
        Row: {
          base_rate: number
          capacity: number | null
          created_at: string
          description: string | null
          display_order: number
          facilities: string[] | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          product_category_id: string | null
          product_id: string | null
          rate_unit: string
          rental_type: Database["public"]["Enums"]["rental_space_type"]
          slug: string
          updated_at: string
        }
        Insert: {
          base_rate?: number
          capacity?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          facilities?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          product_category_id?: string | null
          product_id?: string | null
          rate_unit?: string
          rental_type: Database["public"]["Enums"]["rental_space_type"]
          updated_at?: string
        }
        Update: {
          base_rate?: number
          capacity?: number | null
          created_at?: string
          description?: string | null
          display_order?: number
          facilities?: string[] | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          product_category_id?: string | null
          product_id?: string | null
          rate_unit?: string
          rental_type?: Database["public"]["Enums"]["rental_space_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_spaces_product_category_id_fkey"
            columns: ["product_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_spaces_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_bookings: {
        Row: {
          booking_date: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          rental_space_id: string
          sale_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rental_space_id: string
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rental_space_id?: string
          sale_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_bookings_rental_space_id_fkey"
            columns: ["rental_space_id"]
            isOneToOne: false
            referencedRelation: "rental_spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      active_cart_items: {
        Row: {
          active_cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          active_cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          active_cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "active_cart_items_active_cart_id_fkey"
            columns: ["active_cart_id"]
            isOneToOne: false
            referencedRelation: "active_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      active_carts: {
        Row: {
          branch: string | null
          created_at: string
          created_by: string | null
          id: string
          updated_at: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_carts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          branch: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_number: string
          full_name: string
          hire_date: string
          id: string
          is_active: boolean
          phone: string | null
          position: string
          salary: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_number: string
          full_name: string
          hire_date: string
          id?: string
          is_active?: boolean
          phone?: string | null
          position: string
          salary: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_number?: string
          full_name?: string
          hire_date?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          position?: string
          salary?: number
          updated_at?: string
        }
        Relationships: []
      }
      held_cart_items: {
        Row: {
          created_at: string
          held_cart_id: string
          id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          held_cart_id: string
          id?: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          held_cart_id?: string
          id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "held_cart_items_held_cart_id_fkey"
            columns: ["held_cart_id"]
            isOneToOne: false
            referencedRelation: "held_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "held_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      held_carts: {
        Row: {
          branch: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          status: string
        }
        Insert: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          status?: string
        }
        Update: {
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "held_carts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          due_date: string
          id?: string
          invoice_number: string
          issue_date: string
          notes?: string | null
          status?: string
          subtotal: number
          tax_amount?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          code: string
          created_at: string
          email: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payroll: {
        Row: {
          basic_salary: number
          created_at: string
          deductions: number
          employee_id: string
          id: string
          net_salary: number
          overtime_pay: number
          payroll_number: string
          period_end: string
          period_start: string
          processed_at: string | null
          processed_by: string | null
          status: string
          tax_deducted: number
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          basic_salary: number
          created_at?: string
          deductions?: number
          employee_id: string
          id?: string
          net_salary: number
          overtime_pay?: number
          payroll_number: string
          period_end: string
          period_start: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          tax_deducted?: number
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          basic_salary?: number
          created_at?: string
          deductions?: number
          employee_id?: string
          id?: string
          net_salary?: number
          overtime_pay?: number
          payroll_number?: string
          period_end?: string
          period_start?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          tax_deducted?: number
          updated_at?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          reorder_level: number
          selling_price: number
          size: string | null
          sku: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          reorder_level?: number
          selling_price: number
          size?: string | null
          sku: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          reorder_level?: number
          selling_price?: number
          size?: string | null
          sku?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          branch?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          branch?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_cost: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_receipts: {
        Row: {
          cashier_id: string | null
          created_at: string
          id: string
          member_id: string | null
          payload: Json
          sale_id: string
          sale_number: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
          payload: Json
          sale_id: string
          sale_number: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          id?: string
          member_id?: string | null
          payload?: Json
          sale_id?: string
          sale_number?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_receipts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receipts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_receipts_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_settings: {
        Row: {
          created_at: string
          created_by: string | null
          current_number: number
          date_issued: string
          end_number: number
          id: string
          start_number: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_number: number
          date_issued: string
          end_number: number
          id?: string
          start_number: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_number?: number
          date_issued?: string
          end_number?: number
          id?: string
          start_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_void_events: {
        Row: {
          id: string
          receipt_number: number | null
          sale_id: string
          sale_number: string
          void_reason: string | null
          voided_at: string
          voided_by: string | null
        }
        Insert: {
          id?: string
          receipt_number?: number | null
          sale_id: string
          sale_number: string
          void_reason?: string | null
          voided_at?: string
          voided_by?: string | null
        }
        Update: {
          id?: string
          receipt_number?: number | null
          sale_id?: string
          sale_number?: string
          void_reason?: string | null
          voided_at?: string
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_void_events_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_void_events_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch: string | null
          cashier_id: string
          created_at: string
          discount_amount: number
          id: string
          member_id: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          receipt_issued_at: string | null
          receipt_number: number | null
          sale_number: string
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          branch?: string | null
          cashier_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          receipt_issued_at?: string | null
          receipt_number?: number | null
          sale_number: string
          status?: string
          subtotal: number
          tax_amount?: number
          total_amount: number
        }
        Update: {
          branch?: string | null
          cashier_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          member_id?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          receipt_issued_at?: string | null
          receipt_number?: number | null
          sale_number?: string
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      vouchers: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          posted_at: string | null
          reference_id: string | null
          reference_type: string | null
          status: Database["public"]["Enums"]["voucher_status"]
          updated_at: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          amount: number
          approved_by?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          posted_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          posted_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: Database["public"]["Enums"]["voucher_status"]
          updated_at?: string
          voucher_number?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      payment_method: "cash" | "card" | "online"
      rental_space_type: "hall" | "room"
      transaction_type: "sale" | "expense" | "payroll" | "adjustment"
      user_role: "admin" | "accountant" | "cashier" | "hr"
      voucher_status: "pending" | "approved" | "posted" | "cancelled"
      voucher_type: "payment" | "receipt" | "journal" | "payroll"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      payment_method: ["cash", "card", "online"],
      rental_space_type: ["hall", "room"],
      transaction_type: ["sale", "expense", "payroll", "adjustment"],
      user_role: ["admin", "accountant", "cashier", "hr"],
      voucher_status: ["pending", "approved", "posted", "cancelled"],
      voucher_type: ["payment", "receipt", "journal", "payroll"],
    },
  },
} as const
