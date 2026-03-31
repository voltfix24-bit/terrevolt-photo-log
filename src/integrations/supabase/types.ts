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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      categorie_instellingen: {
        Row: {
          categorie_id: number
          created_at: string | null
          id: string
          instructie: string | null
          naam: string | null
          tip: string | null
          updated_at: string | null
          volgorde: number | null
        }
        Insert: {
          categorie_id: number
          created_at?: string | null
          id?: string
          instructie?: string | null
          naam?: string | null
          tip?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Update: {
          categorie_id?: number
          created_at?: string | null
          id?: string
          instructie?: string | null
          naam?: string | null
          tip?: string | null
          updated_at?: string | null
          volgorde?: number | null
        }
        Relationships: []
      }
      categorie_opmerkingen: {
        Row: {
          categorie: string
          created_at: string | null
          id: string
          opmerking: string
          station_id: string
          updated_at: string | null
        }
        Insert: {
          categorie: string
          created_at?: string | null
          id?: string
          opmerking: string
          station_id: string
          updated_at?: string | null
        }
        Update: {
          categorie?: string
          created_at?: string | null
          id?: string
          opmerking?: string
          station_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorie_opmerkingen_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      categorie_voorbeelden: {
        Row: {
          categorie: string
          created_at: string | null
          id: string
          storage_path: string
          url: string
        }
        Insert: {
          categorie: string
          created_at?: string | null
          id?: string
          storage_path: string
          url: string
        }
        Update: {
          categorie?: string
          created_at?: string | null
          id?: string
          storage_path?: string
          url?: string
        }
        Relationships: []
      }
      fotos: {
        Row: {
          categorie: string
          created_at: string | null
          id: string
          station_id: string
          storage_path: string
          uploaded_at: string | null
          url: string
          volgorde: number | null
        }
        Insert: {
          categorie: string
          created_at?: string | null
          id?: string
          station_id: string
          storage_path: string
          uploaded_at?: string | null
          url: string
          volgorde?: number | null
        }
        Update: {
          categorie?: string
          created_at?: string | null
          id?: string
          station_id?: string
          storage_path?: string
          uploaded_at?: string | null
          url?: string
          volgorde?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      instellingen: {
        Row: {
          accent_gold_color: string | null
          background_color: string | null
          bedrijfsnaam: string | null
          created_at: string | null
          id: string
          logo_url: string | null
          orange_color: string | null
          primary_color: string | null
          primary_light_color: string | null
          profielfoto_url: string | null
          regio: string | null
          updated_at: string | null
        }
        Insert: {
          accent_gold_color?: string | null
          background_color?: string | null
          bedrijfsnaam?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          orange_color?: string | null
          primary_color?: string | null
          primary_light_color?: string | null
          profielfoto_url?: string | null
          regio?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_gold_color?: string | null
          background_color?: string | null
          bedrijfsnaam?: string | null
          created_at?: string | null
          id?: string
          logo_url?: string | null
          orange_color?: string | null
          primary_color?: string | null
          primary_light_color?: string | null
          profielfoto_url?: string | null
          regio?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      monteurs: {
        Row: {
          created_at: string | null
          id: string
          naam: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          naam: string
        }
        Update: {
          created_at?: string | null
          id?: string
          naam?: string
        }
        Relationships: []
      }
      stations: {
        Row: {
          behuizingsnummer: string | null
          created_at: string | null
          da_kast: boolean | null
          datum: string | null
          id: string
          ingevuld_door: string | null
          naam_msr: string
          type_ruimte: string | null
          updated_at: string | null
          vermogensveld: boolean | null
        }
        Insert: {
          behuizingsnummer?: string | null
          created_at?: string | null
          da_kast?: boolean | null
          datum?: string | null
          id?: string
          ingevuld_door?: string | null
          naam_msr: string
          type_ruimte?: string | null
          updated_at?: string | null
          vermogensveld?: boolean | null
        }
        Update: {
          behuizingsnummer?: string | null
          created_at?: string | null
          da_kast?: boolean | null
          datum?: string | null
          id?: string
          ingevuld_door?: string | null
          naam_msr?: string
          type_ruimte?: string | null
          updated_at?: string | null
          vermogensveld?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
