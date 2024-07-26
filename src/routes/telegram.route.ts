import { TelegramController } from '@/controllers'
import { Routes } from '@/interfaces'
import { Router } from 'express'

export class TelegramRoute implements Routes {
  public path = '/telegram'
  public router = Router()
  public controller = new TelegramController()

  constructor() {
    this.initializeRoutes()
  }

  private initializeRoutes() {
    // this.router.post('/message', this.controller.addUserToGroup)
  }
}
