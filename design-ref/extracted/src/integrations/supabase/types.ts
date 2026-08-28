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
      application_messages: {
        Row: {
          application_id: string
          body: string
          channel: string
          created_at: string
          error: string | null
          id: string
          sent_by: string
          status: string
          subject: string
          template_id: string | null
        }
        Insert: {
          application_id: string
          body: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          sent_by: string
          status?: string
          subject: string
          template_id?: string | null
        }
        Update: {
          application_id?: string
          body?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          sent_by?: string
          status?: string
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          ai_highlights: Json | null
          ai_summary: string | null
          applicant_id: string
          audit_log: Json
          created_at: string
          id: string
          interview_mode: string
          intro_transcript: string | null
          intro_video_url: string | null
          job_id: string
          pipeline_status: Database["public"]["Enums"]["pipeline_stage"]
          resume_match: Json | null
          resume_text: string | null
          resume_url: string | null
          retake_allowed: boolean
          retake_count: number
          score: number | null
          score_breakdown: Json | null
          score_evidence: Json | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          ai_highlights?: Json | null
          ai_summary?: string | null
          applicant_id: string
          audit_log?: Json
          created_at?: string
          id?: string
          interview_mode?: string
          intro_transcript?: string | null
          intro_video_url?: string | null
          job_id: string
          pipeline_status?: Database["public"]["Enums"]["pipeline_stage"]
          resume_match?: Json | null
          resume_text?: string | null
          resume_url?: string | null
          retake_allowed?: boolean
          retake_count?: number
          score?: number | null
          score_breakdown?: Json | null
          score_evidence?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          ai_highlights?: Json | null
          ai_summary?: string | null
          applicant_id?: string
          audit_log?: Json
          created_at?: string
          id?: string
          interview_mode?: string
          intro_transcript?: string | null
          intro_video_url?: string | null
          job_id?: string
          pipeline_status?: Database["public"]["Enums"]["pipeline_stage"]
          resume_match?: Json | null
          resume_text?: string | null
          resume_url?: string | null
          retake_allowed?: boolean
          retake_count?: number
          score?: number | null
          score_breakdown?: Json | null
          score_evidence?: Json | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      company_verifications: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          domain: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          requested_by: string
          status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          requested_by: string
          status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          domain?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          requested_by?: string
          status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "company_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_template_questions: {
        Row: {
          created_at: string
          id: string
          position: number
          question_id: string | null
          template_id: string
          text_override: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          question_id?: string | null
          template_id: string
          text_override?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          question_id?: string | null
          template_id?: string
          text_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_template_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_template_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "interview_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_templates: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          rubric: Json
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          rubric?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          rubric?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          answers: Json
          application_id: string
          created_at: string
          ended_at: string | null
          flags: Json
          id: string
          mode: string
          snapshots: Json
          started_at: string | null
          transcript: Json
          video_url: string | null
        }
        Insert: {
          answers?: Json
          application_id: string
          created_at?: string
          ended_at?: string | null
          flags?: Json
          id?: string
          mode?: string
          snapshots?: Json
          started_at?: string | null
          transcript?: Json
          video_url?: string | null
        }
        Update: {
          answers?: Json
          application_id?: string
          created_at?: string
          ended_at?: string | null
          flags?: Json
          id?: string
          mode?: string
          snapshots?: Json
          started_at?: string | null
          transcript?: Json
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string
          embedding: string | null
          embedding_text: string | null
          embedding_updated_at: string | null
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          id: string
          ideal_profile: string | null
          interview_mode: string
          interview_template_id: string | null
          location: string | null
          og_image_url: string | null
          questions: Json
          rubric: Json
          salary_range: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description: string
          embedding?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          id?: string
          ideal_profile?: string | null
          interview_mode?: string
          interview_template_id?: string | null
          location?: string | null
          og_image_url?: string | null
          questions?: Json
          rubric?: Json
          salary_range?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string
          embedding?: string | null
          embedding_text?: string | null
          embedding_updated_at?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          id?: string
          ideal_profile?: string | null
          interview_mode?: string
          interview_template_id?: string | null
          location?: string | null
          og_image_url?: string | null
          questions?: Json
          rubric?: Json
          salary_range?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_interview_template_id_fkey"
            columns: ["interview_template_id"]
            isOneToOne: false
            referencedRelation: "interview_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_md: string
          company_id: string | null
          created_at: string
          id: string
          kind: string
          name: string
          owner_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_md: string
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name: string
          owner_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_md?: string
          company_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_shares: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          comment_count: number
          company_id: string | null
          created_at: string
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["post_kind"]
          like_count: number
          media_urls: Json
          share_count: number
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body?: string
          comment_count?: number
          company_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["post_kind"]
          like_count?: number
          media_urls?: Json
          share_count?: number
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          comment_count?: number
          company_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["post_kind"]
          like_count?: number
          media_urls?: Json
          share_count?: number
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          embedding: string | null
          embedding_updated_at: string | null
          full_name: string | null
          headline: string | null
          id: string
          resume_text: string | null
          skills: string[] | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          embedding?: string | null
          embedding_updated_at?: string | null
          full_name?: string | null
          headline?: string | null
          id: string
          resume_text?: string | null
          skills?: string[] | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          embedding?: string | null
          embedding_updated_at?: string | null
          full_name?: string | null
          headline?: string | null
          id?: string
          resume_text?: string | null
          skills?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      question_bank: {
        Row: {
          company_id: string | null
          created_at: string
          difficulty: string
          expected_signal: string | null
          id: string
          owner_id: string
          tags: string[]
          text: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          difficulty?: string
          expected_signal?: string | null
          id?: string
          owner_id: string
          tags?: string[]
          text: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          difficulty?: string
          expected_signal?: string | null
          id?: string
          owner_id?: string
          tags?: string[]
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiter_signup_attempts: {
        Row: {
          created_at: string
          id: string
          ip: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          user_id?: string | null
        }
        Relationships: []
      }
      role_audit: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string | null
          role: Database["public"]["Enums"]["app_role"]
          source: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          role: Database["public"]["Enums"]["app_role"]
          source?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          source?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      application_percentile: {
        Args: { _application_id: string }
        Returns: number
      }
      bulk_update_pipeline: {
        Args: { _application_ids: string[]; _new_status: string }
        Returns: number
      }
      get_applicant_email: {
        Args: { _application_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_jobs_for_user: {
        Args: { _limit?: number; _user: string }
        Returns: {
          company_id: string
          id: string
          is_saved: boolean
          similarity: number
          title: string
        }[]
      }
      rank_feed:
        | {
            Args: {
              _cursor_created_at?: string
              _cursor_id?: string
              _cursor_score?: number
              _kind: Database["public"]["Enums"]["post_kind"]
              _limit?: number
              _viewer: string
            }
            Returns: {
              author_id: string
              body: string
              comment_count: number
              company_id: string
              created_at: string
              id: string
              job_id: string
              kind: Database["public"]["Enums"]["post_kind"]
              like_count: number
              media_urls: Json
              score: number
              share_count: number
              tags: string[]
              title: string
              viewer_liked: boolean
            }[]
          }
        | {
            Args: {
              _kind: Database["public"]["Enums"]["post_kind"]
              _limit?: number
              _offset?: number
              _viewer: string
            }
            Returns: {
              author_id: string
              body: string
              comment_count: number
              company_id: string
              created_at: string
              id: string
              job_id: string
              kind: Database["public"]["Enums"]["post_kind"]
              like_count: number
              media_urls: Json
              score: number
              share_count: number
              tags: string[]
              title: string
              viewer_liked: boolean
            }[]
          }
    }
    Enums: {
      app_role: "admin" | "recruiter" | "applicant"
      application_status:
        | "submitted"
        | "video_uploaded"
        | "interview_pending"
        | "interview_in_progress"
        | "interview_complete"
        | "scored"
        | "rejected"
        | "shortlisted"
      employment_type: "full_time" | "part_time" | "contract" | "internship"
      job_status: "draft" | "active" | "closed"
      pipeline_stage:
        | "applied"
        | "interviewed"
        | "shortlisted"
        | "offer"
        | "rejected"
      post_kind: "job" | "showcase"
      verification_status: "unverified" | "pending" | "verified" | "rejected"
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
      app_role: ["admin", "recruiter", "applicant"],
      application_status: [
        "submitted",
        "video_uploaded",
        "interview_pending",
        "interview_in_progress",
        "interview_complete",
        "scored",
        "rejected",
        "shortlisted",
      ],
      employment_type: ["full_time", "part_time", "contract", "internship"],
      job_status: ["draft", "active", "closed"],
      pipeline_stage: [
        "applied",
        "interviewed",
        "shortlisted",
        "offer",
        "rejected",
      ],
      post_kind: ["job", "showcase"],
      verification_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const
