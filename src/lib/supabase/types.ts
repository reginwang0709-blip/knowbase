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
          processing_payload: Json;
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
          processing_payload?: Json;
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
          processing_payload?: Json;
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
      glossary_terms: {
        Row: {
          id: string;
          normalized_term: string;
          canonical_term: string;
          category: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          normalized_term: string;
          canonical_term: string;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          normalized_term?: string;
          canonical_term?: string;
          category?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      content_glossary_terms: {
        Row: {
          id: string;
          content_id: string;
          glossary_term_id: string;
          term_text: string;
          source: string;
          confidence: string | null;
          evidence_snippet: string | null;
          first_evidence_block_id: string | null;
          occurrence_count: number;
          explanation_status: string;
          highlight_enabled: boolean;
          display_status: string;
          display_reason: string | null;
          hidden_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          glossary_term_id: string;
          term_text: string;
          source?: string;
          confidence?: string | null;
          evidence_snippet?: string | null;
          first_evidence_block_id?: string | null;
          occurrence_count?: number;
          explanation_status?: string;
          highlight_enabled?: boolean;
          display_status?: string;
          display_reason?: string | null;
          hidden_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          glossary_term_id?: string;
          term_text?: string;
          source?: string;
          confidence?: string | null;
          evidence_snippet?: string | null;
          first_evidence_block_id?: string | null;
          occurrence_count?: number;
          explanation_status?: string;
          highlight_enabled?: boolean;
          display_status?: string;
          display_reason?: string | null;
          hidden_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_glossary_terms_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_glossary_terms_glossary_term_id_fkey";
            columns: ["glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "glossary_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary_occurrences: {
        Row: {
          id: string;
          content_glossary_term_id: string;
          content_id: string;
          block_id: string;
          start_offset: number | null;
          end_offset: number | null;
          matched_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_glossary_term_id: string;
          content_id: string;
          block_id: string;
          start_offset?: number | null;
          end_offset?: number | null;
          matched_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_glossary_term_id?: string;
          content_id?: string;
          block_id?: string;
          start_offset?: number | null;
          end_offset?: number | null;
          matched_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "glossary_occurrences_content_glossary_term_id_fkey";
            columns: ["content_glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "content_glossary_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_occurrences_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary_explanations: {
        Row: {
          id: string;
          content_glossary_term_id: string;
          definition: string;
          why_it_matters: string;
          evidence: string;
          aliases: Json;
          provider: string | null;
          model: string | null;
          generated_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content_glossary_term_id: string;
          definition?: string;
          why_it_matters?: string;
          evidence?: string;
          aliases?: Json;
          provider?: string | null;
          model?: string | null;
          generated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content_glossary_term_id?: string;
          definition?: string;
          why_it_matters?: string;
          evidence?: string;
          aliases?: Json;
          provider?: string | null;
          model?: string | null;
          generated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "glossary_explanations_content_glossary_term_id_fkey";
            columns: ["content_glossary_term_id"];
            isOneToOne: true;
            referencedRelation: "content_glossary_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      user_glossary_feedback: {
        Row: {
          id: string;
          user_id: string | null;
          content_id: string;
          glossary_term_id: string;
          content_glossary_term_id: string;
          feedback_type: string;
          user_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          content_id: string;
          glossary_term_id: string;
          content_glossary_term_id: string;
          feedback_type?: string;
          user_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          content_id?: string;
          glossary_term_id?: string;
          content_glossary_term_id?: string;
          feedback_type?: string;
          user_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_glossary_feedback_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_glossary_feedback_content_glossary_term_id_fkey";
            columns: ["content_glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "content_glossary_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_glossary_feedback_glossary_term_id_fkey";
            columns: ["glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "glossary_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary_events: {
        Row: {
          id: string;
          user_id: string | null;
          content_id: string;
          glossary_term_id: string | null;
          content_glossary_term_id: string | null;
          event_type: string;
          event_source: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          content_id: string;
          glossary_term_id?: string | null;
          content_glossary_term_id?: string | null;
          event_type: string;
          event_source?: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          content_id?: string;
          glossary_term_id?: string | null;
          content_glossary_term_id?: string | null;
          event_type?: string;
          event_source?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "glossary_events_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_events_content_glossary_term_id_fkey";
            columns: ["content_glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "content_glossary_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_events_glossary_term_id_fkey";
            columns: ["glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "glossary_terms";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary_generation_runs: {
        Row: {
          id: string;
          content_id: string;
          content_glossary_term_id: string | null;
          glossary_term_id: string | null;
          generation_type: string;
          trigger_source: string;
          provider: string | null;
          model: string | null;
          prompt_version: string | null;
          status: string;
          error_type: string | null;
          error_message: string | null;
          duration_ms: number | null;
          input_tokens: number | null;
          output_tokens: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          content_id: string;
          content_glossary_term_id?: string | null;
          glossary_term_id?: string | null;
          generation_type: string;
          trigger_source: string;
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          status: string;
          error_type?: string | null;
          error_message?: string | null;
          duration_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          content_id?: string;
          content_glossary_term_id?: string | null;
          glossary_term_id?: string | null;
          generation_type?: string;
          trigger_source?: string;
          provider?: string | null;
          model?: string | null;
          prompt_version?: string | null;
          status?: string;
          error_type?: string | null;
          error_message?: string | null;
          duration_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "glossary_generation_runs_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "contents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_generation_runs_content_glossary_term_id_fkey";
            columns: ["content_glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "content_glossary_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "glossary_generation_runs_glossary_term_id_fkey";
            columns: ["glossary_term_id"];
            isOneToOne: false;
            referencedRelation: "glossary_terms";
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
