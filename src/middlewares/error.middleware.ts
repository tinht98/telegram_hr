import { NODE_ENV } from '@/config'
import { HttpException } from '@/exceptions'
import { NextFunction, Request, Response } from 'express'
import { ERROR_MESSAGE } from '@/constants'

export const ErrorMiddleware = (error: HttpException, req: Request, res: Response, next: NextFunction) => {
  try {
    const status: number = error.status || 500
    const message: string = NODE_ENV !== 'production' ? error.message || ERROR_MESSAGE.unknownError : ERROR_MESSAGE.unknownError

    console.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message: ${message}`)
    res.status(status).json({ message, success: false, status: status, time: Date.now() })
  } catch (error) {
    next(error)
  }
}
