import { TelegramService } from '@/services'
import { Container } from 'typedi'

export class TelegramController {
  public telegramService = Container.get(TelegramService)

  public async sendMessage(req, res) {
    try {
      // const telegramService = new TelegramService()
      const { message } = req.body
      this.telegramService.bot.telegram.sendMessage(message.chatId, message.text)
      res.status(200).json({ message: 'Message sent' })
    } catch (error) {
      console.error('🔥 ~ file: telegram.controller.ts ~ line 21 ~ TelegramController ~ sendMessage ~ error', error)
      res.status(500).json({ error })
    }
  }
}
