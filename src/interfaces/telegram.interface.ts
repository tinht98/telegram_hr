export interface ITelegramUser {
  id: number
  first_name: string
  last_name: string
  username: string
  is_bot?: boolean
}

export interface ITelegramChat {
  id: number
  title: string
  type: string
  invite_link?: string
}

export interface ITelegramUserJoinChat {
  user_id: number
  chat_id: number
  status: 'joined' | 'removed'
}
