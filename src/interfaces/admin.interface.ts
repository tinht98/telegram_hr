import { USER_ROLE } from '@/constants'

export interface JwtTokenDataAdmin {
  id: string
  role: USER_ROLE
}
