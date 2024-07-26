import { Response as ResponseExpress } from 'express'
import { Router } from 'express'
export interface Routes {
  path?: string
  router: Router
}

export interface Response extends ResponseExpress {
  zap: (data: any) => void
}

export interface RequestResponse {
  data: any
  success: boolean
  status: number
  time: number
}
