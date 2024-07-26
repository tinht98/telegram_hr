import { config } from 'dotenv'
const envPath = `.env.${process.env.NODE_ENV || 'development'}`
config({ path: envPath })
console.log('🔥 ~ envPath:', envPath)

export const CREDENTIALS = process.env.CREDENTIALS === 'true'
export const { NODE_ENV, PORT, SECRET_KEY, LOG_FORMAT, LOG_DIR, ORIGIN } = process.env
export const { MONGO_SRV_URL } = process.env
