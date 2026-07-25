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
      bikes: {
        Row: {
          created_at: string
          description: string | null
          esp32_id: string
          firmware_message: string | null
          firmware_pinned_version: string | null
          firmware_progress: number
          firmware_reported_at: string | null
          firmware_state: string
          firmware_target_version: string | null
          firmware_updated_at: string | null
          firmware_version: string | null
          id: string
          name: string
          session_mode: string
          session_started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          esp32_id: string
          firmware_message?: string | null
          firmware_pinned_version?: string | null
          firmware_progress?: number
          firmware_reported_at?: string | null
          firmware_state?: string
          firmware_target_version?: string | null
          firmware_updated_at?: string | null
          firmware_version?: string | null
          id?: string
          name: string
          session_mode?: string
          session_started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          esp32_id?: string
          firmware_message?: string | null
          firmware_pinned_version?: string | null
          firmware_progress?: number
          firmware_reported_at?: string | null
          firmware_state?: string
          firmware_target_version?: string | null
          firmware_updated_at?: string | null
          firmware_version?: string | null
          id?: string
          name?: string
          session_mode?: string
          session_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      firmware_versions: {
        Row: {
          created_at: string
          fetched_at: string
          id: string
          is_latest: boolean
          manifest: Json | null
          notes: string | null
          released_at: string | null
          sha256: string | null
          source: string
          updated_at: string
          url: string
          version: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          id?: string
          is_latest?: boolean
          manifest?: Json | null
          notes?: string | null
          released_at?: string | null
          sha256?: string | null
          source?: string
          updated_at?: string
          url: string
          version: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          id?: string
          is_latest?: boolean
          manifest?: Json | null
          notes?: string | null
          released_at?: string | null
          sha256?: string | null
          source?: string
          updated_at?: string
          url?: string
          version?: string
        }
        Relationships: []
      }
      mqtt_topics: {
        Row: {
          bike_id: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          last_payload: string | null
          last_seen_at: string | null
          name: string
          topic: string
          updated_at: string
        }
        Insert: {
          bike_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          last_payload?: string | null
          last_seen_at?: string | null
          name: string
          topic: string
          updated_at?: string
        }
        Update: {
          bike_id?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          last_payload?: string | null
          last_seen_at?: string | null
          name?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mqtt_topics_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_events: {
        Row: {
          bike_id: string | null
          id: string
          payload: Json | null
          received_at: string
          topic: string
        }
        Insert: {
          bike_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          topic: string
        }
        Update: {
          bike_id?: string | null
          id?: string
          payload?: Json | null
          received_at?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_events_bike_id_fkey"
            columns: ["bike_id"]
            isOneToOne: false
            referencedRelation: "bikes"
            referencedColumns: ["id"]
          },
        ]
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
