import { ERROR_MESSAGE, USER_ROLE } from '@/constants'
import { HttpException } from '@/exceptions'
import { JwtTokenDataAdmin, RequestWithAdmin } from '@/interfaces'
import { SECRET_KEY } from '@config'
import { NextFunction, Request, Response } from 'express'
import { verify } from 'jsonwebtoken'

const getAuthorization = (req: Request) => {
  const cookie = req.cookies ? req.cookies['Authorization'] : null
  if (cookie) return cookie

  const header = req.header('Authorization')
  const token = header?.split(' ')[1]
  if (header) return token

  throw new HttpException(401, ERROR_MESSAGE.tokenNotFound)
}

export const AuthAdminMiddleware = async (req: RequestWithAdmin, res: Response, next: NextFunction) => {
  const Authorization = getAuthorization(req)
  if (Authorization) {
    try {
      const tokenData = verify(Authorization, SECRET_KEY) as JwtTokenDataAdmin
      req.adminInfo = tokenData
      if (tokenData.role == USER_ROLE.admin) {
        next()
      } else {
        throw new HttpException(401, ERROR_MESSAGE.invalidRole)
      }
    } catch (error) {
      throw new HttpException(401, ERROR_MESSAGE.invalidToken)
    }
  } else {
    throw new HttpException(404, ERROR_MESSAGE.urlNotFound)
  }
}
