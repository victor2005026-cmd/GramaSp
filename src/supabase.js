import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://hyqpwbmmdpcdclenpope.supabase.co'
const SUPABASE_KEY = 'sb_publishable_mLFoWO2idJic1BV2y9h2Bw_-8Y3HEr3'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)