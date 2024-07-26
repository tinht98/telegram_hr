import { ERROR_MESSAGE } from '@/constants'
import { HttpException } from '@/exceptions'
import { RequestResponse, Response } from '@/interfaces'
import { NextFunction, Request } from 'express'

export const ResponseMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.zap = response => {
    if (!response) {
      throw new HttpException(400, ERROR_MESSAGE.unknownError)
    }

    const message: RequestResponse = {
      data: response,
      success: !response.errMess,
      status: response.errMess ? 400 : 200,
      time: Date.now()
    }

    res.status(message.status)
    return res.json(message)
  }
  return next()
}
