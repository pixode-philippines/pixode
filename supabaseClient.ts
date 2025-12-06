
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// SUPABASE CONFIGURATION
// ============================================================================
// To make this work:
// 1. Create a project at https://supabase.com
// 2. Go to Project Settings -> API
// 3. Replace the URL and Key below with your "Project URL" and "anon public" key.
//    Alternatively, set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY
//    in a .env.local file in the project root.
// 4. Go to Authentication -> Providers -> Enable Email/Password
// 5. Go to Authentication -> Users -> Add User to create your login credentials.
// ============================================================================

// Helper to safely access environment variables without crashing in browser
const getEnv = (key: string) => {
    try {
        if (typeof process !== 'undefined' && process.env) {
            return process.env[key];
        }
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
             // @ts-ignore
            return import.meta.env[key];
        }
    } catch (e) {
        // Ignore errors
    }
    return undefined;
};

// REPLACE THE STRINGS BELOW WITH YOUR OWN SUPABASE CREDENTIALS IF ENV VARS ARE MISSING
const supabaseUrl = getEnv('REACT_APP_SUPABASE_URL') || 'https://mogdizazsjmlrtdsqxfl.supabase.co'; // Explicit placeholder
const supabaseKey = getEnv('REACT_APP_SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vZ2RpemF6c2ptbHJ0ZHNxeGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NjYyNDQsImV4cCI6MjA4MDM0MjI0NH0.JIaIAY_MboM8pQHiB3Ij9LHEzrJDUngnx5BJ8bcErPE'; // Explicit placeholder

export const supabase = createClient(supabaseUrl, supabaseKey);

/*
-- SQL SCHEMA FOR ATTENDANCE_RECORDS (run this in your Supabase SQL Editor)
CREATE TABLE public.attendance_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  clock_in_time timestamptz NULL DEFAULT now(),
  clock_out_time timestamptz NULL,
  date date NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_pkey PRIMARY KEY (id),
  CONSTRAINT attendance_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Optional: Add a unique constraint to ensure only one open attendance record per user per day
ALTER TABLE public.attendance_records ADD CONSTRAINT unique_open_attendance_per_day UNIQUE (user_id, date) WHERE (clock_out_time IS NULL);

-- Enable Row Level Security (RLS)
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT: Authenticated users can view all attendance records
CREATE POLICY "Allow authenticated users to view attendance records" ON public.attendance_records
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for INSERT: Authenticated users can clock in (insert their own record)
CREATE POLICY "Allow authenticated users to clock in" ON public.attendance_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for UPDATE: Users can clock out their own records, managers can update any
CREATE POLICY "Allow users to clock out their own records, managers to update any" ON public.attendance_records
  FOR UPDATE USING (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('CEO', 'Co-Founder', 'Admin')
  ) WITH CHECK (
    auth.uid() = user_id OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('CEO', 'Co-Founder', 'Admin')
  );

-- Policy for DELETE: Only CEO/Co-Founder/Admin can delete records
CREATE POLICY "Allow CEO/Co-Founder/Admin to delete attendance records" ON public.attendance_records
  FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('CEO', 'Co-Founder', 'Admin')
  );

-- Also ensure your 'profiles' table has an 'id' (UUID PK) and 'role' (text) column.
-- For example:
-- CREATE TABLE public.profiles (
--   id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
--   full_name text NULL,
--   email text NULL UNIQUE,
--   role text NULL DEFAULT 'Employee'::text,
--   created_at timestamptz NOT NULL DEFAULT now(),
--   updated_at timestamptz NOT NULL DEFAULT now(),
--   CONSTRAINT profiles_pkey PRIMARY KEY (id)
-- );
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow public read access" ON public.profiles FOR SELECT USING (true);
-- CREATE POLICY "Allow individual users to update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- CREATE POLICY "Allow individual users to create their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
*/
