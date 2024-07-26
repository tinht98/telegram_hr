import { Telegraf } from 'telegraf'
import { Service } from 'typedi'

import { TelegramChatModel, TelegramUserJoinChatModel, TelegramUserModel } from '@/models'

const TELEGRAM_BOT_TOKEN = '6730362518:AAGbVJs3WH2VOoTNxh38gdTxbhMZTiodpyw'

enum CommandKeys {
  GET_LIST_CHANNELS = 'getlistchannels',
  GET_INVITE_LINKS = 'getinvitelinks',
  REMOVE_BUILDER = 'removebuilder',
  GET_LIST_BUILDERS = 'getlistbuilders',
  GET_CHAT_MEMBERS_COUNT = 'getchatmemberscount'
}

const commands = [
  {
    command: CommandKeys.GET_INVITE_LINKS,
    description: 'Get invite links of all channels'
  },
  {
    command: CommandKeys.GET_LIST_CHANNELS,
    description: 'Get list of all channels'
  },
  {
    command: CommandKeys.REMOVE_BUILDER,
    description: 'Remove builder from all channels'
  },
  {
    command: CommandKeys.GET_LIST_BUILDERS,
    description: 'Get list of all builders'
  },
  {
    command: CommandKeys.GET_CHAT_MEMBERS_COUNT,
    description: 'Get the number of members in a chat'
  }
]

@Service()
export class TelegramService {
  public bot: Telegraf
  userStates = {} // In-memory state to track user conversations

  constructor() {
    this.bot = new Telegraf(TELEGRAM_BOT_TOKEN)

    this.bot.start(ctx => ctx.reply('Welcome'))
    this.bot.hears('hi', ctx => ctx.reply('Hey there'))

    // Add commands
    this.bot.telegram.setMyCommands(commands)

    // Handle commands
    this.bot.command(CommandKeys.GET_LIST_CHANNELS, this.commandGetListChannels.bind(this))
    this.bot.command(CommandKeys.GET_INVITE_LINKS, this.commandGetInviteLinks.bind(this))
    this.bot.command(CommandKeys.REMOVE_BUILDER, this.commandRemoveBuilder.bind(this))
    this.bot.command(CommandKeys.GET_LIST_BUILDERS, this.commandGetListBuilders.bind(this))
    this.bot.command(CommandKeys.GET_CHAT_MEMBERS_COUNT, this.commandGetChatMembersCount.bind(this))

    // Builder management
    this.bot.on('my_chat_member', this.myChatMember.bind(this))
    this.bot.on('new_chat_members', this.newChatMembers.bind(this))
    this.bot.on('left_chat_member', this.leftChatMember.bind(this))

    // User replies to the bot
    this.bot.on('text', this.processReply.bind(this))

    this.bot.launch()
  }

  async commandGetListChannels(ctx) {
    const channels = await TelegramChatModel.find()
    const makeLine = (channel, index) => `${index + 1}/ ${channel.title}`
    ctx.reply(`Channels:\n\n${channels.map(makeLine).join('\n')}
    `)
  }

  async commandGetInviteLinks(ctx) {
    const channels = await TelegramChatModel.find({}, { id: 1, title: 1, invite_link: 1 })
    const links: { name: string; link: string }[] = []
    for (const channel of channels) {
      if (!channel.invite_link) {
        channel.invite_link = await this.bot.telegram.exportChatInviteLink(channel.id)
        await TelegramChatModel.updateOne({ id: channel.id }, { invite_link: channel.invite_link })
      }
      links.push({ name: channel.title, link: channel.invite_link })
    }

    const makeLine = (item, index) => ` ${index + 1}/ ${item.name}: ${item.link}`
    ctx.reply(`Open the following links to join the channels:\n${links.map(makeLine).join('\n')}`)
  }

  async commandGetListBuilders(ctx) {
    const builders = await TelegramUserModel.find({ is_bot: false })
    const makeLine = (builder, index) => `${index + 1}/ @${builder.username}: ${builder.first_name ?? ''} ${builder.last_name ?? ''}`
    ctx.reply(`
      Builders:\n\n${builders.map(makeLine).join('\n')}
    `)
  }

  async commandGetChatMembersCount(ctx) {
    await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the group name')
    this.userStates[ctx.from.id] = { stage: CommandKeys.GET_CHAT_MEMBERS_COUNT }
  }

  /**
   * Admin will chat `@user_name` to the bot, then the bot will remove the user from the database and ban the user from all channels
   * @param ctx
   */
  async commandRemoveBuilder(ctx) {
    await this.bot.telegram.sendMessage(ctx.chat.id, 'Please enter the `@username` of the builder you want to remove')
    this.userStates[ctx.from.id] = { stage: CommandKeys.REMOVE_BUILDER }
  }

  /**
   * This event is triggered when the bot's status in a chat changes.
   * The `ctx.myChatMember.new_chat_member.status` property indicates the new status of the bot
   * (e.g., member when `creator` | `administrator` | `member` | `restricted` | `left` | `kicked`)
   * @param ctx
   */
  async myChatMember(ctx) {
    try {
      const status = ctx.myChatMember.new_chat_member.status
      console.log('~ TelegramService ~ botOnChatMember ~ status:', status, 'chat:', ctx.chat)
      switch (status) {
        case 'member':
          TelegramChatModel.create({
            id: ctx.chat.id,
            title: ctx.chat.title,
            type: ctx.chat.type
          }).catch(() => {
            console.log('🔥 ~ TelegramService ~ botOnChatMember ~ error adding chat')
          })
          break
        case 'left':
          TelegramChatModel.deleteOne({ id: ctx.chat.id })
          break
      }
    } catch (error) {}
  }

  async newChatMembers(ctx) {
    console.log('~ TelegramService ~ newChatMembers ~ ctx:', ctx.message)
    for (const member of ctx.message.new_chat_members) {
      TelegramUserModel.create({
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        username: member.username,
        is_bot: member.is_bot
      }).catch(() => {
        console.log('🔥 ~ TelegramService ~ newChatMembers ~ error adding user')
      })

      TelegramUserJoinChatModel.create(
        {
          user_id: member.id,
          chat_id: ctx.chat.id,
          status: 'joined'
        },
        { upsert: true }
      ).catch(() => {
        console.log('🔥 ~ TelegramService ~ newChatMembers ~ error adding user to chat')
      })
    }
  }

  async leftChatMember(ctx) {
    console.log('~ TelegramService ~ leftChatMember ~ ctx:', ctx.message)
    TelegramUserModel.deleteOne({ id: ctx.message.left_chat_member.id })
    TelegramUserJoinChatModel.updateOne({ user_id: ctx.message.left_chat_member.id, chat_id: ctx.chat.id }, { status: 'removed' })
  }

  async processReply(ctx) {
    const state = this.userStates[ctx.from.id]
    if (state) {
      switch (state.stage) {
        case CommandKeys.REMOVE_BUILDER:
          console.log('🔥 ~ TelegramService ~ constructor ~ ctx.message.text:', ctx.message)
          await this.removeBuilder(ctx)
          break
        case CommandKeys.GET_CHAT_MEMBERS_COUNT:
          await this.getChatMembersCount(ctx)
          break
      }
    }
    // Clear user's state after processing
    this.userStates[ctx.from.id] = undefined
  }

  async removeBuilder(ctx) {
    const builderUsername = this._extractMentionedUser(ctx.message.text)
    const builder = await TelegramUserModel.findOne({ username: builderUsername })
    const chats = await TelegramChatModel.find({}, { id: 1 })
    const chatIds = chats.map(chat => chat.id)
    if (!builder) {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Builder not found')
    } else {
      for (const chatId of chatIds) {
        await TelegramUserJoinChatModel.deleteMany({ user_id: builder.id, chat_id: chatId })
        this.bot.telegram.banChatMember(chatId, builder.id).catch(() => {
          console.log('🔥 ~ TelegramService ~ removeBuilder ~ error banning user')
        })
      }
      await TelegramUserModel.deleteOne({ id: builder.id })
      await this.bot.telegram.sendMessage(ctx.chat.id, `Builder \`@${builder.username}\` has been removed from all channels`)
    }
  }

  async getChatMembersCount(ctx) {
    console.log('🔥 ~ TelegramService ~ constructor ~ ctx.message.text:', ctx.message)
    const text = await TelegramChatModel.findOne({ title: ctx.message.text })
    if (text) {
      const result = await this.bot.telegram.getChatMembersCount(text.id)
      await this.bot.telegram.sendMessage(ctx.chat.id, `The number of members in the chat is ${result}`)
    } else {
      await this.bot.telegram.sendMessage(ctx.chat.id, 'Chat not found')
    }
  }

  private _extractMentionedUser(text: string) {
    const mentionPattern = /@(\w+)/
    const match = text.match(mentionPattern)
    return match ? match[1] : null
  }
}
