/**
 * Types générés depuis le schéma Postgres par `pnpm db:types`
 * (supabase gen types typescript --db-url … --schema public).
 * NE PAS MODIFIER À LA MAIN : relancer la génération après chaque migration.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          details: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: number;
          occurred_at: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: never;
          occurred_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          details?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: never;
          occurred_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      photos: {
        Row: {
          caption: string | null;
          category: string | null;
          created_at: string;
          created_by: string | null;
          height: number | null;
          id: string;
          is_cover: boolean;
          mime_type: string;
          original_filename: string | null;
          size_bytes: number | null;
          sort_order: number;
          storage_path: string;
          taken_at: string | null;
          updated_at: string;
          visit_id: string;
          width: number | null;
          zone_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          caption?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          height?: number | null;
          id?: string;
          is_cover?: boolean;
          mime_type: string;
          original_filename?: string | null;
          size_bytes?: number | null;
          sort_order?: number;
          storage_path: string;
          taken_at?: string | null;
          updated_at?: string;
          visit_id: string;
          width?: number | null;
          zone_key?: string | null;
        };
        Update: {
          caption?: string | null;
          category?: string | null;
          created_at?: string;
          created_by?: string | null;
          height?: number | null;
          id?: string;
          is_cover?: boolean;
          mime_type?: string;
          original_filename?: string | null;
          size_bytes?: number | null;
          sort_order?: number;
          storage_path?: string;
          taken_at?: string | null;
          updated_at?: string;
          visit_id?: string;
          width?: number | null;
          zone_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "photos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photos_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_markers: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          label: string | null;
          number: number;
          page: number;
          photo_id: string | null;
          plan_id: string;
          updated_at: string;
          visit_id: string;
          x: number;
          y: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          number: number;
          page?: number;
          photo_id?: string | null;
          plan_id: string;
          updated_at?: string;
          visit_id: string;
          x: number;
          y: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          label?: string | null;
          number?: number;
          page?: number;
          photo_id?: string | null;
          plan_id?: string;
          updated_at?: string;
          visit_id?: string;
          x?: number;
          y?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_markers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_markers_photo_id_fkey";
            columns: ["photo_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_markers_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "site_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_markers_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_markers_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          must_change_password: boolean;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id: string;
          is_active?: boolean;
          must_change_password?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          must_change_password?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          generated_at: string;
          generated_by: string | null;
          id: string;
          options: NonNullable<Json>;
          size_bytes: number | null;
          storage_path: string;
          visit_id: string;
        };
        ComputedFields: never;
        Insert: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          options?: NonNullable<Json>;
          size_bytes?: number | null;
          storage_path: string;
          visit_id: string;
        };
        Update: {
          generated_at?: string;
          generated_by?: string | null;
          id?: string;
          options?: NonNullable<Json>;
          size_bytes?: number | null;
          storage_path?: string;
          visit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_generated_by_fkey";
            columns: ["generated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      reserve_events: {
        Row: {
          actor_id: string | null;
          changes: NonNullable<Json>;
          created_at: string;
          event_type: Database["public"]["Enums"]["reserve_event_type"];
          from_status: Database["public"]["Enums"]["reserve_status"] | null;
          id: string;
          reserve_id: string;
          to_status: Database["public"]["Enums"]["reserve_status"] | null;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          changes?: NonNullable<Json>;
          created_at?: string;
          event_type: Database["public"]["Enums"]["reserve_event_type"];
          from_status?: Database["public"]["Enums"]["reserve_status"] | null;
          id?: string;
          reserve_id: string;
          to_status?: Database["public"]["Enums"]["reserve_status"] | null;
        };
        Update: {
          actor_id?: string | null;
          changes?: NonNullable<Json>;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["reserve_event_type"];
          from_status?: Database["public"]["Enums"]["reserve_status"] | null;
          id?: string;
          reserve_id?: string;
          to_status?: Database["public"]["Enums"]["reserve_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "reserve_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserve_events_reserve_id_fkey";
            columns: ["reserve_id"];
            isOneToOne: false;
            referencedRelation: "reserves";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserve_events_reserve_id_fkey";
            columns: ["reserve_id"];
            isOneToOne: false;
            referencedRelation: "reserves_with_state";
            referencedColumns: ["id"];
          },
        ];
      };
      reserve_photos: {
        Row: {
          created_at: string;
          kind: Database["public"]["Enums"]["photo_kind"];
          photo_id: string;
          reserve_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          kind?: Database["public"]["Enums"]["photo_kind"];
          photo_id: string;
          reserve_id: string;
        };
        Update: {
          created_at?: string;
          kind?: Database["public"]["Enums"]["photo_kind"];
          photo_id?: string;
          reserve_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reserve_photos_photo_id_fkey";
            columns: ["photo_id"];
            isOneToOne: false;
            referencedRelation: "photos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserve_photos_reserve_id_fkey";
            columns: ["reserve_id"];
            isOneToOne: false;
            referencedRelation: "reserves";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserve_photos_reserve_id_fkey";
            columns: ["reserve_id"];
            isOneToOne: false;
            referencedRelation: "reserves_with_state";
            referencedColumns: ["id"];
          },
        ];
      };
      reserves: {
        Row: {
          action: string;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          number: number;
          priority: Database["public"]["Enums"]["reserve_priority"];
          responsible_company: string | null;
          responsible_email: string | null;
          responsible_kind: Database["public"]["Enums"]["responsible_kind"];
          responsible_name: string | null;
          responsible_profile_id: string | null;
          site_id: string;
          status: Database["public"]["Enums"]["reserve_status"];
          updated_at: string;
          visit_id: string;
          zone_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          number: number;
          priority?: Database["public"]["Enums"]["reserve_priority"];
          responsible_company?: string | null;
          responsible_email?: string | null;
          responsible_kind?: Database["public"]["Enums"]["responsible_kind"];
          responsible_name?: string | null;
          responsible_profile_id?: string | null;
          site_id: string;
          status?: Database["public"]["Enums"]["reserve_status"];
          updated_at?: string;
          visit_id: string;
          zone_key?: string | null;
        };
        Update: {
          action?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          number?: number;
          priority?: Database["public"]["Enums"]["reserve_priority"];
          responsible_company?: string | null;
          responsible_email?: string | null;
          responsible_kind?: Database["public"]["Enums"]["responsible_kind"];
          responsible_name?: string | null;
          responsible_profile_id?: string | null;
          site_id?: string;
          status?: Database["public"]["Enums"]["reserve_status"];
          updated_at?: string;
          visit_id?: string;
          zone_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reserves_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_responsible_profile_id_fkey";
            columns: ["responsible_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      site_import_runs: {
        Row: {
          created_at: string;
          errors: NonNullable<Json>;
          file_name: string;
          id: string;
          mode: Database["public"]["Enums"]["import_mode"];
          performed_by: string | null;
          rows_created: number;
          rows_deactivated: number;
          rows_rejected: number;
          rows_total: number;
          rows_updated: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          errors?: NonNullable<Json>;
          file_name: string;
          id?: string;
          mode: Database["public"]["Enums"]["import_mode"];
          performed_by?: string | null;
          rows_created?: number;
          rows_deactivated?: number;
          rows_rejected?: number;
          rows_total?: number;
          rows_updated?: number;
        };
        Update: {
          created_at?: string;
          errors?: NonNullable<Json>;
          file_name?: string;
          id?: string;
          mode?: Database["public"]["Enums"]["import_mode"];
          performed_by?: string | null;
          rows_created?: number;
          rows_deactivated?: number;
          rows_rejected?: number;
          rows_total?: number;
          rows_updated?: number;
        };
        Relationships: [
          {
            foreignKeyName: "site_import_runs_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      site_plans: {
        Row: {
          created_at: string;
          id: string;
          is_archived: boolean;
          mime_type: string;
          name: string;
          page_count: number;
          site_id: string;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          mime_type: string;
          name: string;
          page_count?: number;
          site_id: string;
          storage_path: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_archived?: boolean;
          mime_type?: string;
          name?: string;
          page_count?: number;
          site_id?: string;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "site_plans_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_plans_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sites: {
        Row: {
          address: string | null;
          category: string | null;
          city: string | null;
          created_at: string;
          id: string;
          imported_at: string | null;
          is_active: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          postal_code: string | null;
          surface_m2: number | null;
          updated_at: string;
          warehouse_code: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          category?: string | null;
          city?: string | null;
          created_at?: string;
          id?: string;
          imported_at?: string | null;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          postal_code?: string | null;
          surface_m2?: number | null;
          updated_at?: string;
          warehouse_code: string;
        };
        Update: {
          address?: string | null;
          category?: string | null;
          city?: string | null;
          created_at?: string;
          id?: string;
          imported_at?: string | null;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          postal_code?: string | null;
          surface_m2?: number | null;
          updated_at?: string;
          warehouse_code?: string;
        };
        Relationships: [];
      };
      visit_participants: {
        Row: {
          company: string | null;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_present: boolean;
          job_title: string | null;
          profile_id: string | null;
          sort_order: number;
          updated_at: string;
          visit_id: string;
        };
        ComputedFields: never;
        Insert: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_present?: boolean;
          job_title?: string | null;
          profile_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          visit_id: string;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_present?: boolean;
          job_title?: string | null;
          profile_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          visit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_participants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_participants_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_participants_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_zone_notes: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          sort_order: number;
          updated_at: string;
          updated_by: string | null;
          visit_id: string;
          zone_key: string;
          zone_label: string;
        };
        ComputedFields: never;
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          visit_id: string;
          zone_key: string;
          zone_label: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          sort_order?: number;
          updated_at?: string;
          updated_by?: string | null;
          visit_id?: string;
          zone_key?: string;
          zone_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visit_zone_notes_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_zone_notes_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visit_zone_notes_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      visits: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          duplicated_from_id: string | null;
          id: string;
          reason: Database["public"]["Enums"]["visit_reason"];
          site_id: string;
          status: Database["public"]["Enums"]["visit_status"];
          subject: string | null;
          title: string;
          type: Database["public"]["Enums"]["visit_type"];
          updated_at: string;
          version: number;
          visit_date: string;
          writer_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          duplicated_from_id?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["visit_reason"];
          site_id: string;
          status?: Database["public"]["Enums"]["visit_status"];
          subject?: string | null;
          title: string;
          type?: Database["public"]["Enums"]["visit_type"];
          updated_at?: string;
          version?: number;
          visit_date: string;
          writer_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          duplicated_from_id?: string | null;
          id?: string;
          reason?: Database["public"]["Enums"]["visit_reason"];
          site_id?: string;
          status?: Database["public"]["Enums"]["visit_status"];
          subject?: string | null;
          title?: string;
          type?: Database["public"]["Enums"]["visit_type"];
          updated_at?: string;
          version?: number;
          visit_date?: string;
          writer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "visits_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_duplicated_from_id_fkey";
            columns: ["duplicated_from_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_duplicated_from_id_fkey";
            columns: ["duplicated_from_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_writer_id_fkey";
            columns: ["writer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      reserves_with_state: {
        Row: {
          action: string;
          closed_at: string | null;
          closed_by: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          is_overdue: boolean | null;
          number: number;
          priority: Database["public"]["Enums"]["reserve_priority"];
          responsible_company: string | null;
          responsible_email: string | null;
          responsible_kind: Database["public"]["Enums"]["responsible_kind"];
          responsible_name: string | null;
          responsible_profile_id: string | null;
          site_id: string;
          status: Database["public"]["Enums"]["reserve_status"];
          updated_at: string;
          visit_id: string;
          zone_key: string | null;
        };
        ComputedFields: never;
        Insert: {
          action?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          code?: never;
          created_at?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string | null;
          is_overdue?: never;
          number?: number | null;
          priority?: Database["public"]["Enums"]["reserve_priority"] | null;
          responsible_company?: string | null;
          responsible_email?: string | null;
          responsible_kind?: Database["public"]["Enums"]["responsible_kind"] | null;
          responsible_name?: string | null;
          responsible_profile_id?: string | null;
          site_id?: string | null;
          status?: Database["public"]["Enums"]["reserve_status"] | null;
          updated_at?: string | null;
          visit_id?: string | null;
          zone_key?: string | null;
        };
        Update: {
          action?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          code?: never;
          created_at?: string | null;
          created_by?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string | null;
          is_overdue?: never;
          number?: number | null;
          priority?: Database["public"]["Enums"]["reserve_priority"] | null;
          responsible_company?: string | null;
          responsible_email?: string | null;
          responsible_kind?: Database["public"]["Enums"]["responsible_kind"] | null;
          responsible_name?: string | null;
          responsible_profile_id?: string | null;
          site_id?: string | null;
          status?: Database["public"]["Enums"]["reserve_status"] | null;
          updated_at?: string | null;
          visit_id?: string | null;
          zone_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reserves_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_responsible_profile_id_fkey";
            columns: ["responsible_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visit_summaries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reserves_visit_id_fkey";
            columns: ["visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["id"];
          },
        ];
      };
      visit_summaries: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string;
          done_reserves_count: number | null;
          id: string;
          last_report_at: string | null;
          open_reserves_count: number | null;
          overdue_reserves_count: number | null;
          photos_count: number | null;
          reason: Database["public"]["Enums"]["visit_reason"];
          site_city: string | null;
          site_code: string;
          site_id: string;
          site_name: string;
          status: Database["public"]["Enums"]["visit_status"];
          subject: string | null;
          title: string;
          type: Database["public"]["Enums"]["visit_type"];
          updated_at: string;
          version: number;
          visit_date: string;
          writer_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "visits_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "visits_writer_id_fkey";
            columns: ["writer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      complete_visit: {
        Args: { visit_id: string };
        Returns: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          duplicated_from_id: string | null;
          id: string;
          reason: Database["public"]["Enums"]["visit_reason"];
          site_id: string;
          status: Database["public"]["Enums"]["visit_status"];
          subject: string | null;
          title: string;
          type: Database["public"]["Enums"]["visit_type"];
          updated_at: string;
          version: number;
          visit_date: string;
          writer_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "visits";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reopen_visit: {
        Args: { visit_id: string };
        Returns: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          duplicated_from_id: string | null;
          id: string;
          reason: Database["public"]["Enums"]["visit_reason"];
          site_id: string;
          status: Database["public"]["Enums"]["visit_status"];
          subject: string | null;
          title: string;
          type: Database["public"]["Enums"]["visit_type"];
          updated_at: string;
          version: number;
          visit_date: string;
          writer_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "visits";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      soft_delete_visit: {
        Args: { visit_id: string };
        Returns: {
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          duplicated_from_id: string | null;
          id: string;
          reason: Database["public"]["Enums"]["visit_reason"];
          site_id: string;
          status: Database["public"]["Enums"]["visit_status"];
          subject: string | null;
          title: string;
          type: Database["public"]["Enums"]["visit_type"];
          updated_at: string;
          version: number;
          visit_date: string;
          writer_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "visits";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      import_mode: "simulate" | "apply";
      photo_kind: "defect" | "proof";
      reserve_event_type: "created" | "updated" | "status_changed" | "deleted";
      reserve_priority: "low" | "normal" | "high" | "urgent";
      reserve_status: "open" | "in_progress" | "done";
      responsible_kind: "internal" | "external";
      user_role: "rt" | "direction" | "admin";
      visit_reason:
        | "periodic"
        | "lease_negotiation"
        | "post_claim"
        | "tenant_entry"
        | "tenant_exit"
        | "meeting";
      visit_status: "in_progress" | "completed";
      visit_type: "technical" | "meeting";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      import_mode: ["simulate", "apply"],
      photo_kind: ["defect", "proof"],
      reserve_event_type: ["created", "updated", "status_changed", "deleted"],
      reserve_priority: ["low", "normal", "high", "urgent"],
      reserve_status: ["open", "in_progress", "done"],
      responsible_kind: ["internal", "external"],
      user_role: ["rt", "direction", "admin"],
      visit_reason: [
        "periodic",
        "lease_negotiation",
        "post_claim",
        "tenant_entry",
        "tenant_exit",
        "meeting",
      ],
      visit_status: ["in_progress", "completed"],
      visit_type: ["technical", "meeting"],
    },
  },
} as const;
