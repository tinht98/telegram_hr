import mongoose, { Schema } from 'mongoose'
import { ITelegramUser, ITelegramChat, ITelegramUserJoinChat } from '@/interfaces'

const TelegramUserSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    first_name: { type: String },
    last_name: { type: String },
    username: { type: String },
    image: { type: String }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramChatSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    type: { type: String, required: true },
    invite_link: { type: String }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

const TelegramUserJoinChatSchema = new Schema(
  {
    user_id: { type: String, required: true },
    chat_id: { type: String, required: true },
    status: { type: String, required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
)

export const TelegramUserModel = mongoose.model<ITelegramUser>('TelegramUser', TelegramUserSchema)
export const TelegramChatModel = mongoose.model<ITelegramChat>('TelegramChat', TelegramChatSchema)
export const TelegramUserJoinChatModel = mongoose.model<ITelegramUserJoinChat>('TelegramUserJoinChat', TelegramUserJoinChatSchema)
