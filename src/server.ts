import App from '@/app'
import { TelegramRoute } from '@/routes'
import { ValidateEnv } from '@/utils'

ValidateEnv()

const app = new App([new TelegramRoute()])

app.listen()
