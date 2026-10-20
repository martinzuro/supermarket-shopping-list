
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "catalog": {
                  Row: {
                    "display_name": string,"last_added_at": string,"last_category_id": string | null,"last_currency": string | null,"last_price": number | null,"last_unit": string | null,"list_id": string,"name_normalized": string,"times_added": number
                  }
                  ComputedFields: never
                  Insert: {
                    "display_name": string,"last_added_at"?: string,"last_category_id"?: string | null,"last_currency"?: string | null,"last_price"?: number | null,"last_unit"?: string | null,"list_id": string,"name_normalized": string,"times_added"?: number
                  }
                  Update: {
                    "display_name"?: string,"last_added_at"?: string,"last_category_id"?: string | null,"last_currency"?: string | null,"last_price"?: number | null,"last_unit"?: string | null,"list_id"?: string,"name_normalized"?: string,"times_added"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalog_last_category_id_fkey"
      columns: ["list_id","last_category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["list_id","id"]
    },{
      foreignKeyName: "catalog_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"id": string,"is_default": boolean,"list_id": string,"name": string,"position": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_default"?: boolean,"list_id": string,"name": string,"position"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"id"?: string,"is_default"?: boolean,"list_id"?: string,"name"?: string,"position"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "category_id": string | null,"checked": boolean,"checked_at": string | null,"created_at": string,"created_by": string | null,"currency": string | null,"deleted_at": string | null,"estimated_price": number | null,"id": string,"list_id": string,"name": string,"name_normalized": string,"note": string | null,"position": number,"quantity": number | null,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"checked"?: boolean,"checked_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"deleted_at"?: string | null,"estimated_price"?: number | null,"id"?: string,"list_id": string,"name": string,"name_normalized"?: string,"note"?: string | null,"position"?: number,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"checked"?: boolean,"checked_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string | null,"deleted_at"?: string | null,"estimated_price"?: number | null,"id"?: string,"list_id"?: string,"name"?: string,"name_normalized"?: string,"note"?: string | null,"position"?: number,"quantity"?: number | null,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_fkey"
      columns: ["list_id","category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["list_id","id"]
    },{
      foreignKeyName: "items_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"list_invites": {
                  Row: {
                    "created_by": string,"expires_at": string,"id": string,"list_id": string,"purpose": string,"token": string,"used_at": string | null,"used_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_by"?: string,"expires_at"?: string,"id"?: string,"list_id": string,"purpose"?: string,"token"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "created_by"?: string,"expires_at"?: string,"id"?: string,"list_id"?: string,"purpose"?: string,"token"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_invites_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"list_members": {
                  Row: {
                    "joined_at": string,"list_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "joined_at"?: string,"list_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"list_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_members_list_id_fkey"
      columns: ["list_id"]
isOneToOne: false
      referencedRelation: "lists"
      referencedColumns: ["id"]
    }
                  ]
                },"lists": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "invite_token": string }; Returns: string
                           },
"claim_carry_over":
{ Args: { "invite_token": string,"new_ids"?: (string)[],"target_list_id": string }; Returns: {
              "category_id": string | null,
"checked": boolean,
"checked_at": string | null,
"created_at": string,
"created_by": string | null,
"currency": string | null,
"deleted_at": string | null,
"estimated_price": number | null,
"id": string,
"list_id": string,
"name": string,
"name_normalized": string,
"note": string | null,
"position": number,
"quantity": number | null,
"unit": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"invite_preview":
{ Args: { "invite_token": string }; Returns: {
              "inviter_email": string,"list_id": string,"status": string
            }[]
                           },
"list_member_emails":
{ Args: { "target_list_id": string }; Returns: {
              "email": string,"joined_at": string,"role": string,"user_id": string
            }[]
                           },
"merge_list":
{ Args: { "new_ids"?: (string)[],"source_list_id": string,"target_list_id": string }; Returns: {
              "category_id": string | null,
"checked": boolean,
"checked_at": string | null,
"created_at": string,
"created_by": string | null,
"currency": string | null,
"deleted_at": string | null,
"estimated_price": number | null,
"id": string,
"list_id": string,
"name": string,
"name_normalized": string,
"note": string | null,
"position": number,
"quantity": number | null,
"unit": string | null,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: false
        isSetofReturn: true
      } },
"move_category":
{ Args: { "direction": string,"past_category_id": string,"target_category_id": string }; Returns: {
              "created_at": string,
"deleted_at": string | null,
"id": string,
"is_default": boolean,
"list_id": string,
"name": string,
"position": number,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "categories"
        isOneToOne: false
        isSetofReturn: true
      } },
"normalize_name":
{ Args: { "value": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
