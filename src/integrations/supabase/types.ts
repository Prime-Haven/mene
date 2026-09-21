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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          branch_id: string | null
          id: string
          member_id: string | null
          method: Database["public"]["Enums"]["attendance_method"]
          position_id: string | null
          recorded_at: string
          scanned_by_user_id: string | null
          service_id: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          position_id?: string | null
          recorded_at?: string
          scanned_by_user_id?: string | null
          service_id: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          id?: string
          member_id?: string | null
          method?: Database["public"]["Enums"]["attendance_method"]
          position_id?: string | null
          recorded_at?: string
          scanned_by_user_id?: string | null
          service_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          branch_id: string | null
          created_at: string
          detail: Json | null
          id: string
          source_ip: string | null
          target: string | null
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          source_ip?: string | null
          target?: string | null
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          branch_id?: string | null
          created_at?: string
          detail?: Json | null
          id?: string
          source_ip?: string | null
          target?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          filename: string | null
          id: string
          inserted_count: number
          row_count: number
          skipped_count: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          row_count?: number
          skipped_count?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          filename?: string | null
          id?: string
          inserted_count?: number
          row_count?: number
          skipped_count?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          branch_id: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          import_batch_id: string | null
          is_minor: boolean
          joined_on: string
          marital_status: string | null
          occupation: string | null
          phone: string | null
          position_id: string | null
          residential_area: string | null
          status: Database["public"]["Enums"]["member_status"]
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          import_batch_id?: string | null
          is_minor?: boolean
          joined_on?: string
          marital_status?: string | null
          occupation?: string | null
          phone?: string | null
          position_id?: string | null
          residential_area?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          import_batch_id?: string | null
          is_minor?: boolean
          joined_on?: string
          marital_status?: string | null
          occupation?: string | null
          phone?: string | null
          position_id?: string | null
          residential_area?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_kobo: number
          channel: string | null
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          reference: string
          status: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Insert: {
          amount_kobo: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          reference: string
          status?: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Update: {
          amount_kobo?: number
          channel?: string | null
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          reference?: string
          status?: string
          tenant_id?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          branch_id: string | null
          created_at: string
          group_name: string
          id: string
          level_id: string
          parent_id: string | null
          path: unknown
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          group_name: string
          id?: string
          level_id: string
          parent_id?: string | null
          path?: unknown
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          group_name?: string
          id?: string
          level_id?: string
          parent_id?: string | null
          path?: unknown
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "structure_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      qr_tokens: {
        Row: {
          issued_at: string
          member_id: string
          revoked_at: string | null
          tenant_id: string
          token_hash: string
        }
        Insert: {
          issued_at?: string
          member_id: string
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
        }
        Update: {
          issued_at?: string
          member_id?: string
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_open: boolean
          name: string
          service_date: string
          tenant_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name: string
          service_date: string
          tenant_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_open?: boolean
          name?: string
          service_date?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      structure_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          rank: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rank: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rank?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "structure_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          payment_method: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code: string | null
          pending_tier: Database["public"]["Enums"]["tenant_tier"] | null
          period_end: string
          period_start: string
          tenant_id: string
          tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code?: string | null
          pending_tier?: Database["public"]["Enums"]["tenant_tier"] | null
          period_end?: string
          period_start?: string
          tenant_id: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          payment_method?: Database["public"]["Enums"]["pay_method"]
          paystack_customer_code?: string | null
          pending_tier?: Database["public"]["Enums"]["tenant_tier"] | null
          period_end?: string
          period_start?: string
          tenant_id?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          position_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          position_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          position_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          background_path: string | null
          brand_accent: string
          brand_primary: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          group_vocabulary: string
          id: string
          logo_path: string | null
          name: string
          status: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          submit_button_text: string
          tier: Database["public"]["Enums"]["tenant_tier"]
          welcome_message: string | null
        }
        Insert: {
          background_path?: string | null
          brand_accent?: string
          brand_primary?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          group_vocabulary?: string
          id?: string
          logo_path?: string | null
          name: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain: string
          submit_button_text?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
          welcome_message?: string | null
        }
        Update: {
          background_path?: string | null
          brand_accent?: string
          brand_primary?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          group_vocabulary?: string
          id?: string
          logo_path?: string | null
          name?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          subdomain?: string
          submit_button_text?: string
          tier?: Database["public"]["Enums"]["tenant_tier"]
          welcome_message?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymise_member: { Args: { p_member: string }; Returns: undefined }
      apply_successful_payment: {
        Args: {
          p_amount?: number
          p_channel?: string
          p_paid_at?: string
          p_reference: string
        }
        Returns: undefined
      }
      birthdays_this_month: {
        Args: { p_tenant: string }
        Returns: {
          date_of_birth: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      can_read_member: {
        Args: { _branch: string; _position: string; _tenant: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          _bucket: string
          _identifier: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      create_member: {
        Args: {
          p_area: string
          p_branch: string
          p_dob: string
          p_email: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_marital_status: string
          p_occupation: string
          p_phone: string
          p_tenant: string
        }
        Returns: string
      }
      has_tenant_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _tenant: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_tenant_admin: { Args: { _tenant: string }; Returns: boolean }
      is_tenant_member: { Args: { _tenant: string }; Returns: boolean }
      issue_qr_token: { Args: { p_member: string }; Returns: string }
      log_audit: {
        Args: {
          _action: string
          _actor?: string
          _detail?: Json
          _ip?: string
          _target?: string
          _tenant: string
        }
        Returns: undefined
      }
      manual_attendance: {
        Args: { p_member: string; p_service: string }
        Returns: Json
      }
      normalize_phone_gh: { Args: { _phone: string }; Returns: string }
      platform_overview: { Args: never; Returns: Json }
      platform_set_tenant_status: {
        Args: {
          p_status: Database["public"]["Enums"]["tenant_status"]
          p_tenant: string
        }
        Returns: undefined
      }
      provision_tenant: {
        Args: {
          p_contact_email?: string
          p_contact_phone?: string
          p_name: string
          p_subdomain: string
          p_tier: Database["public"]["Enums"]["tenant_tier"]
        }
        Returns: string
      }
      public_open_services: {
        Args: { p_subdomain: string }
        Returns: {
          id: string
          name: string
          service_date: string
        }[]
      }
      resolve_scan: {
        Args: { p_service: string; p_token: string }
        Returns: Json
      }
      self_checkin: {
        Args: {
          p_area?: string
          p_dob?: string
          p_email?: string
          p_full_name: string
          p_gender?: Database["public"]["Enums"]["gender_type"]
          p_ip?: string
          p_phone: string
          p_subdomain: string
        }
        Returns: Json
      }
      self_checkin_v2: {
        Args: {
          p_area: string
          p_dob: string
          p_email: string
          p_full_name: string
          p_gender: Database["public"]["Enums"]["gender_type"]
          p_ip: string
          p_marital_status: string
          p_occupation: string
          p_phone: string
          p_service: string
          p_subdomain: string
        }
        Returns: Json
      }
      subdomain_available: { Args: { p_subdomain: string }; Returns: boolean }
      tenant_branding: { Args: { p_subdomain: string }; Returns: Json }
      tenant_can_write: { Args: { _tenant: string }; Returns: boolean }
      tenant_dashboard: { Args: { p_tenant: string }; Returns: Json }
      text2ltree: { Args: { "": string }; Returns: unknown }
      update_tenant_branding: {
        Args: {
          p_accent: string
          p_background_path: string
          p_button: string
          p_logo_path: string
          p_name: string
          p_primary: string
          p_tenant: string
          p_welcome: string
        }
        Returns: undefined
      }
      update_tenant_vocabulary: {
        Args: { p_tenant: string; p_vocabulary: string }
        Returns: undefined
      }
      user_branch: { Args: { _tenant: string }; Returns: string }
      user_position_path: { Args: { _tenant: string }; Returns: unknown }
    }
    Enums: {
      account_status: "active" | "suspended"
      app_role:
        | "owner"
        | "church_admin"
        | "branch_admin"
        | "leader"
        | "usher"
        | "platform_admin"
      attendance_method: "scan" | "self_checkin" | "manual" | "corrected"
      gender_type: "male" | "female" | "other"
      member_status: "first_timer" | "active" | "archived" | "anonymised"
      pay_method: "card" | "momo"
      tenant_status: "active" | "grace" | "suspended" | "closed"
      tenant_tier: "basic" | "standard" | "premium"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_status: ["active", "suspended"],
      app_role: [
        "owner",
        "church_admin",
        "branch_admin",
        "leader",
        "usher",
        "platform_admin",
      ],
      attendance_method: ["scan", "self_checkin", "manual", "corrected"],
      gender_type: ["male", "female", "other"],
      member_status: ["first_timer", "active", "archived", "anonymised"],
      pay_method: ["card", "momo"],
      tenant_status: ["active", "grace", "suspended", "closed"],
      tenant_tier: ["basic", "standard", "premium"],
    },
  },
} as const
