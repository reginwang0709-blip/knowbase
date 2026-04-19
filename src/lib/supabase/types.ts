export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      parse_tasks: {
        Row: {
          id: string;
          user_id: string | null;
          url: string;
          platform: string | null;
          title: string | null;
          status:
            | "submitted"
            | "detecting_source"
            | "extracting_content"
            | "generating_transcript"
            | "generating_knowledge_pack"
            | "completed"
            | "failed";
          progress: number;
          content_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          url: string;
          platform?: string | null;
          title?: string | null;
          status?:
            | "submitted"
            | "detecting_source"
            | "extracting_content"
            | "generating_transcript"
            | "generating_knowledge_pack"
            | "completed"
            | "failed";
          progress?: number;
          content_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          url?: string;
          platform?: string | null;
          title?: string | null;
          status?:
            | "submitted"
            | "detecting_source"
            | "extracting_content"
            | "generating_transcript"
            | "generating_knowledge_pack"
            | "completed"
            | "failed";
          progress?: number;
          content_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contents: {
        Row: {
          id: string;
          task_id: string | null;
          user_id: string | null;
          title: string;
          platform: string;
          source_url: string;
          author: string | null;
          published_at: string | null;
          parsed_at: string;
          summary: string;
          content_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          user_id?: string | null;
          title: string;
          platform: string;
          source_url: string;
          author?: string | null;
          published_at?: string | null;
          parsed_at?: string;
          summary: string;
          content_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          user_id?: string | null;
          title?: string;
          platform?: string;
          source_url?: string;
          author?: string | null;
          published_at?: string | null;
          parsed_at?: string;
          summary?: string;
          content_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contents_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "parse_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      library_categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          description: string;
          generated_reason: string;
          source_content_count: number;
          confidence: number;
          last_adjusted_at: string | null;
          top_keywords: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          description: string;
          generated_reason: string;
          source_content_count?: number;
          confidence?: number;
          last_adjusted_at?: string | null;
          top_keywords?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          description?: string;
          generated_reason?: string;
          source_content_count?: number;
          confidence?: number;
          last_adjusted_at?: string | null;
          top_keywords?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      library_topics: {
        Row: {
          id: string;
          category_id: string;
          user_id: string | null;
          name: string;
          description: string | null;
          top_keywords: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          user_id?: string | null;
          name: string;
          description?: string | null;
          top_keywords?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          user_id?: string | null;
          name?: string;
          description?: string | null;
          top_keywords?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_topics_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "library_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      content_topic_assignments: {
        Row: {
          id: string;
          content_id: string;
          topic_id: string;
          confidence: number;
          assignment_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          topic_id: string;
          confidence?: number;
          assignment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          topic_id?: string;
          confidence?: number;
          assignment_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_topic_assignments_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_topic_assignments_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "library_topics";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
