import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dofckgebpdpglbyqlwei.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvZmNrZ2VicGRwZ2xieXFsd2VpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2NzIwMzQsImV4cCI6MjA4ODI0ODAzNH0.PtdoIz2S2gFb77xnlLnfRxuvZmyMn08OQMVGTtMkjBk'

export const supabase = createClient(supabaseUrl, supabaseKey)
