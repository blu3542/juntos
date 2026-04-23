import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://nigvyotnrlgbqeeyueql.supabase.co'
export const supabaseAnonKey = '<your-supabase-anon-key>'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
