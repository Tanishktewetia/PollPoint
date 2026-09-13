// Generated from replayed migrations by npm run db:types. Do not edit manually.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
    points_ledger: {
      Row: {
        id: string;
        user_id: string;
        submission_id: string;
        amount: number;
        created_at: string;
      };
      Insert: {
        id?: string;
        user_id: string;
        submission_id: string;
        amount: number;
        created_at?: string;
      };
      Update: {
        id?: string;
        user_id?: string;
        submission_id?: string;
        amount?: number;
        created_at?: string;
      };
      Relationships: [{ foreignKeyName: "points_ledger_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "points_ledger_submission_id_user_id_fkey"; columns: ["submission_id","user_id"]; isOneToOne: false; referencedRelation: "survey_submissions"; referencedColumns: ["id","user_id"] }];
    };
    profiles: {
      Row: {
        id: string;
        display_name: string | null;
        created_at: string;
      };
      Insert: {
        id: string;
        display_name?: string | null;
        created_at?: string;
      };
      Update: {
        id?: string;
        display_name?: string | null;
        created_at?: string;
      };
      Relationships: [{ foreignKeyName: "profiles_id_fkey"; columns: ["id"]; isOneToOne: true; referencedRelation: "users"; referencedColumns: ["id"] }];
    };
    submission_answers: {
      Row: {
        submission_id: string;
        survey_id: string;
        question_id: string;
        answer: Json;
      };
      Insert: {
        submission_id: string;
        survey_id: string;
        question_id: string;
        answer: Json;
      };
      Update: {
        submission_id?: string;
        survey_id?: string;
        question_id?: string;
        answer?: Json;
      };
      Relationships: [{ foreignKeyName: "submission_answers_submission_id_survey_id_fkey"; columns: ["submission_id","survey_id"]; isOneToOne: false; referencedRelation: "survey_submissions"; referencedColumns: ["id","survey_id"] }, { foreignKeyName: "submission_answers_survey_id_question_id_fkey"; columns: ["survey_id","question_id"]; isOneToOne: false; referencedRelation: "survey_questions"; referencedColumns: ["survey_id","id"] }];
    };
    survey_assignments: {
      Row: {
        id: string;
        survey_id: string;
        user_id: string;
        first_push_id: string;
        assigned_at: string;
      };
      Insert: {
        id?: string;
        survey_id: string;
        user_id: string;
        first_push_id: string;
        assigned_at?: string;
      };
      Update: {
        id?: string;
        survey_id?: string;
        user_id?: string;
        first_push_id?: string;
        assigned_at?: string;
      };
      Relationships: [{ foreignKeyName: "survey_assignments_survey_id_fkey"; columns: ["survey_id"]; isOneToOne: false; referencedRelation: "surveys"; referencedColumns: ["id"] }, { foreignKeyName: "survey_assignments_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "survey_assignments_first_push_id_survey_id_fkey"; columns: ["first_push_id","survey_id"]; isOneToOne: false; referencedRelation: "survey_pushes"; referencedColumns: ["id","survey_id"] }, { foreignKeyName: "survey_assignments_first_push_id_user_id_fkey"; columns: ["first_push_id","user_id"]; isOneToOne: false; referencedRelation: "survey_push_targets"; referencedColumns: ["push_id","user_id"] }];
    };
    survey_push_targets: {
      Row: {
        push_id: string;
        user_id: string;
      };
      Insert: {
        push_id: string;
        user_id: string;
      };
      Update: {
        push_id?: string;
        user_id?: string;
      };
      Relationships: [{ foreignKeyName: "survey_push_targets_push_id_fkey"; columns: ["push_id"]; isOneToOne: false; referencedRelation: "survey_pushes"; referencedColumns: ["id"] }, { foreignKeyName: "survey_push_targets_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
    };
    survey_pushes: {
      Row: {
        id: string;
        survey_id: string;
        audience: string;
        created_by: string;
        created_at: string;
        request_id: string;
        request_fingerprint: string;
        targeted_count: number;
        new_assignment_count: number;
      };
      Insert: {
        id?: string;
        survey_id: string;
        audience: string;
        created_by: string;
        created_at?: string;
        request_id: string;
        request_fingerprint: string;
        targeted_count: number;
        new_assignment_count: number;
      };
      Update: {
        id?: string;
        survey_id?: string;
        audience?: string;
        created_by?: string;
        created_at?: string;
        request_id?: string;
        request_fingerprint?: string;
        targeted_count?: number;
        new_assignment_count?: number;
      };
      Relationships: [{ foreignKeyName: "survey_pushes_survey_id_fkey"; columns: ["survey_id"]; isOneToOne: false; referencedRelation: "surveys"; referencedColumns: ["id"] }, { foreignKeyName: "survey_pushes_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
    };
    survey_questions: {
      Row: {
        id: string;
        survey_id: string;
        position: number;
        section: string;
        field_key: string;
        type: string;
        presentation: string;
        prompt: string;
        required: boolean;
        config: Json;
      };
      Insert: {
        id?: string;
        survey_id: string;
        position: number;
        section: string;
        field_key: string;
        type: string;
        presentation: string;
        prompt: string;
        required?: boolean;
        config: Json;
      };
      Update: {
        id?: string;
        survey_id?: string;
        position?: number;
        section?: string;
        field_key?: string;
        type?: string;
        presentation?: string;
        prompt?: string;
        required?: boolean;
        config?: Json;
      };
      Relationships: [{ foreignKeyName: "survey_questions_survey_id_fkey"; columns: ["survey_id"]; isOneToOne: false; referencedRelation: "surveys"; referencedColumns: ["id"] }];
    };
    survey_submissions: {
      Row: {
        id: string;
        assignment_id: string;
        survey_id: string;
        user_id: string;
        submitted_at: string;
        survey_title_snapshot: string;
        reward_points_snapshot: number;
      };
      Insert: {
        id?: string;
        assignment_id: string;
        survey_id: string;
        user_id: string;
        submitted_at?: string;
        survey_title_snapshot: string;
        reward_points_snapshot: number;
      };
      Update: {
        id?: string;
        assignment_id?: string;
        survey_id?: string;
        user_id?: string;
        submitted_at?: string;
        survey_title_snapshot?: string;
        reward_points_snapshot?: number;
      };
      Relationships: [{ foreignKeyName: "survey_submissions_assignment_id_survey_id_user_id_fkey"; columns: ["assignment_id","survey_id","user_id"]; isOneToOne: false; referencedRelation: "survey_assignments"; referencedColumns: ["id","survey_id","user_id"] }];
    };
    surveys: {
      Row: {
        id: string;
        title: string;
        description: string;
        reward_points: number;
        status: string;
        definition_version: number;
        created_by: string;
        created_at: string;
        updated_at: string;
        published_at: string | null;
        archived_at: string | null;
      };
      Insert: {
        id?: string;
        title: string;
        description?: string;
        reward_points: number;
        status?: string;
        definition_version?: number;
        created_by: string;
        created_at?: string;
        updated_at?: string;
        published_at?: string | null;
        archived_at?: string | null;
      };
      Update: {
        id?: string;
        title?: string;
        description?: string;
        reward_points?: number;
        status?: string;
        definition_version?: number;
        created_by?: string;
        created_at?: string;
        updated_at?: string;
        published_at?: string | null;
        archived_at?: string | null;
      };
      Relationships: [{ foreignKeyName: "surveys_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
    };
    };
    Views: Record<string, never>;
    Functions: {
    admin_session: { Args: Record<PropertyKey, never>; Returns: boolean };
    assigned_survey: { Args: { p_assignment_id: string }; Returns: Json };
    available_surveys: { Args: { p_page: number }; Returns: Json };
    bootstrap_first_admin: { Args: { target_user_id: string }; Returns: undefined };
    is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
    submit_survey: { Args: { p_assignment_id: string; p_answers: Json }; Returns: Json };
    update_display_name: { Args: { new_display_name: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
